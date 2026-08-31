import { average, formatPercent, groupBy, requireAuth, wireLogout } from "./app.js";
import { attemptsForPaper, bestAttempt, flattenPapers, loadAttempts, loadCatalogue, attemptMillis } from "./papers.js";

let charts = [];

function destroyCharts() {
  charts.forEach((chart) => chart.destroy());
  charts = [];
}

function buildAnalytics(papers, attempts) {
  const completedPaperIds = new Set(attempts.map((attempt) => attempt.paperId));
  const validAttempts = attempts.filter((attempt) => Number.isFinite(attempt.percentage));
  const percentages = validAttempts.map((attempt) => attempt.percentage);
  const recent = [...validAttempts].sort((a, b) => attemptMillis(b) - attemptMillis(a)).slice(0, 5);
  const best = percentages.length ? Math.max(...percentages) : 0;
  const completion = papers.length ? (completedPaperIds.size / papers.length) * 100 : 0;

  const byPaperNumber = groupBy(validAttempts.map((attempt) => ({
    ...attempt,
    paperNumber: papers.find((paper) => paper.id === attempt.paperId)?.paper
  })).filter((attempt) => attempt.paperNumber), (attempt) => attempt.paperNumber);

  const paperAverages = Object.entries(byPaperNumber).map(([paperNumber, paperAttempts]) => ({
    paperNumber,
    average: average(paperAttempts.map((attempt) => attempt.percentage))
  })).sort((a, b) => Number(a.paperNumber) - Number(b.paperNumber));

  const completedPapers = papers.map((paper) => {
    const paperAttempts = attemptsForPaper(validAttempts, paper.id);
    return {
      paper,
      attempts: paperAttempts,
      best: bestAttempt(paperAttempts),
      average: average(paperAttempts.map((attempt) => attempt.percentage))
    };
  }).filter((entry) => entry.attempts.length);

  const ranked = [...completedPapers].sort((a, b) => b.average - a.average);

  return {
    totalPapers: papers.length,
    completedUnique: completedPaperIds.size,
    completion,
    totalAttempts: attempts.length,
    averageScore: average(percentages),
    best,
    recentAverage: average(recent.map((attempt) => attempt.percentage)),
    paperAverages,
    bestPaper: ranked[0] || null,
    weakestPaper: ranked[ranked.length - 1] || null,
    improvement: [...validAttempts].sort((a, b) => attemptMillis(a) - attemptMillis(b))
  };
}

function renderStats(analytics) {
  const stats = [
    ["Total papers", analytics.totalPapers],
    ["Papers completed", analytics.completedUnique],
    ["Completion", formatPercent(analytics.completion)],
    ["Total attempts", analytics.totalAttempts],
    ["Average score", formatPercent(analytics.averageScore)]
  ];

  document.querySelector("#stats-grid").innerHTML = stats.map(([label, value]) => `
    <article class="stat-card">
      <span>${label}</span>
      <strong>${value}</strong>
    </article>
  `).join("");

  document.querySelector("#insight-grid").innerHTML = `
    <article class="insight-card"><span>Best score</span><strong>${formatPercent(analytics.best)}</strong></article>
    <article class="insight-card"><span>Recent average</span><strong>${formatPercent(analytics.recentAverage)}</strong></article>
    <article class="insight-card"><span>Best-performing paper</span><strong>${analytics.bestPaper ? analytics.bestPaper.paper.name : "Not enough data"}</strong></article>
    <article class="insight-card"><span>Weakest-performing paper</span><strong>${analytics.weakestPaper ? analytics.weakestPaper.paper.name : "Not enough data"}</strong></article>
    ${[1, 2, 3].map((paperNumber) => {
      const match = analytics.paperAverages.find((item) => Number(item.paperNumber) === paperNumber);
      return `<article class="insight-card"><span>Paper ${paperNumber} average</span><strong>${match ? formatPercent(match.average) : "No attempts"}</strong></article>`;
    }).join("")}
  `;
}

function renderCharts(analytics) {
  destroyCharts();
  const Chart = window.Chart;
  if (!Chart || !analytics.totalAttempts) return;

  const improvementContext = document.querySelector("#improvement-chart");
  const paperAverageContext = document.querySelector("#paper-average-chart");
  const completionContext = document.querySelector("#completion-chart");

  charts.push(new Chart(improvementContext, {
    type: "line",
    data: {
      labels: analytics.improvement.map((attempt) => new Date(attemptMillis(attempt)).toLocaleDateString()),
      datasets: [{
        label: "Score %",
        data: analytics.improvement.map((attempt) => attempt.percentage),
        borderColor: "#1b6b68",
        backgroundColor: "rgba(27, 107, 104, 0.16)",
        tension: 0.32,
        fill: true
      }]
    },
    options: chartOptions({ max: 100 })
  }));

  charts.push(new Chart(paperAverageContext, {
    type: "bar",
    data: {
      labels: analytics.paperAverages.map((item) => `Paper ${item.paperNumber}`),
      datasets: [{
        label: "Average %",
        data: analytics.paperAverages.map((item) => item.average),
        backgroundColor: "#d56a3f"
      }]
    },
    options: chartOptions({ max: 100 })
  }));

  charts.push(new Chart(completionContext, {
    type: "doughnut",
    data: {
      labels: ["Completed", "Remaining"],
      datasets: [{
        data: [analytics.completedUnique, Math.max(analytics.totalPapers - analytics.completedUnique, 0)],
        backgroundColor: ["#1b6b68", "#d9e2ec"]
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: "bottom"
        }
      }
    }
  }));
}

function chartOptions({ max }) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        beginAtZero: true,
        max,
        ticks: {
          callback: (value) => `${value}%`
        }
      }
    },
    plugins: {
      legend: {
        display: false
      }
    }
  };
}

async function initDashboard(user) {
  wireLogout();
  try {
    const catalogues = await loadCatalogue();
    const papers = flattenPapers(catalogues);
    const attempts = await loadAttempts(user.uid);
    const analytics = buildAnalytics(papers, attempts);

    renderStats(analytics);
    document.querySelector("#dashboard-loading")?.classList.add("hidden");
    document.querySelector("#dashboard-content")?.classList.remove("hidden");

    if (!attempts.length) {
      document.querySelector("#dashboard-empty")?.classList.remove("hidden");
      document.querySelector("#charts-grid")?.classList.add("hidden");
      return;
    }

    renderCharts(analytics);
  } catch (error) {
    document.querySelector("#dashboard-loading")?.classList.add("hidden");
    const errorBox = document.querySelector("#dashboard-error");
    errorBox.textContent = error.message || "Could not load dashboard.";
    errorBox.classList.remove("hidden");
  }
}

requireAuth(initDashboard);
