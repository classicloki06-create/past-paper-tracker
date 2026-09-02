const cieSessions = [
  { year: 2026, session: "May/June", sessionCode: "mj" },
  { year: 2025, session: "May/June", sessionCode: "mj" },
  { year: 2025, session: "October/November", sessionCode: "on" },
  { year: 2024, session: "May/June", sessionCode: "mj" },
  { year: 2024, session: "October/November", sessionCode: "on" },
  { year: 2023, session: "May/June", sessionCode: "mj" },
  { year: 2023, session: "October/November", sessionCode: "on" },
  { year: 2022, session: "May/June", sessionCode: "mj" },
  { year: 2022, session: "October/November", sessionCode: "on" },
  { year: 2021, session: "May/June", sessionCode: "mj" },
  { year: 2021, session: "October/November", sessionCode: "on" },
  { year: 2020, session: "October/November", sessionCode: "on" }
];

const edexcelSessions = [
  { year: 2026, session: "January", sessionCode: "jan" },
  { year: 2026, session: "May/June", sessionCode: "jun" },
  { year: 2025, session: "January", sessionCode: "jan" },
  { year: 2025, session: "May/June", sessionCode: "jun" },
  { year: 2025, session: "October", sessionCode: "oct" },
  { year: 2024, session: "January", sessionCode: "jan" },
  { year: 2024, session: "May/June", sessionCode: "jun" },
  { year: 2024, session: "October", sessionCode: "oct" },
  { year: 2023, session: "January", sessionCode: "jan" },
  { year: 2023, session: "May/June", sessionCode: "jun" },
  { year: 2023, session: "October", sessionCode: "oct" },
  { year: 2022, session: "January", sessionCode: "jan" },
  { year: 2022, session: "May/June", sessionCode: "jun" },
  { year: 2022, session: "October", sessionCode: "oct" },
  { year: 2021, session: "January", sessionCode: "jan" },
  { year: 2021, session: "May/June", sessionCode: "jun" },
  { year: 2021, session: "October", sessionCode: "oct" },
  { year: 2020, session: "January", sessionCode: "jan" },
  { year: 2020, session: "October", sessionCode: "oct" }
];

const cieSubjects = [
  { subject: "Biology", syllabusCode: "9700" },
  { subject: "Chemistry", syllabusCode: "9701" },
  { subject: "Physics", syllabusCode: "9702" }
];

const cieScienceComponents = {
  AS: [
    { paper: 1, name: "Paper 1", type: "Multiple Choice", maximumMark: 40 },
    { paper: 2, name: "Paper 2", type: "AS Level Structured Questions", maximumMark: 60 },
    { paper: 3, name: "Paper 3", type: "Advanced Practical Skills", maximumMark: 40 }
  ],
  A2: [
    { paper: 4, name: "Paper 4", type: "A Level Structured Questions", maximumMark: 100 },
    { paper: 5, name: "Paper 5", type: "Planning, Analysis and Evaluation", maximumMark: 30 }
  ]
};

const cieMathComponents = {
  "as-pure": {
    qualification: "AS",
    route: "Pure Mathematics",
    papers: [{ paper: 1, name: "Pure Mathematics 1", type: "Pure Mathematics", maximumMark: 75 }]
  },
  "as-mechanics": {
    qualification: "AS",
    route: "Pure + Mechanics",
    papers: [
      { paper: 1, name: "Pure Mathematics 1", type: "Pure Mathematics", maximumMark: 75 },
      { paper: 4, name: "Mechanics", type: "Mechanics", maximumMark: 50 }
    ]
  },
  "as-statistics": {
    qualification: "AS",
    route: "Pure + Statistics",
    papers: [
      { paper: 1, name: "Pure Mathematics 1", type: "Pure Mathematics", maximumMark: 75 },
      { paper: 5, name: "Probability & Statistics 1", type: "Probability & Statistics", maximumMark: 50 }
    ]
  },
  "a2-statistics": {
    qualification: "A2",
    route: "Pure + Statistics",
    papers: [
      { paper: 1, name: "Pure Mathematics 1", type: "Pure Mathematics", maximumMark: 75 },
      { paper: 3, name: "Pure Mathematics 3", type: "Pure Mathematics", maximumMark: 75 },
      { paper: 5, name: "Probability & Statistics 1", type: "Probability & Statistics", maximumMark: 50 },
      { paper: 6, name: "Probability & Statistics 2", type: "Probability & Statistics", maximumMark: 50 }
    ]
  },
  "a2-mechanics-statistics": {
    qualification: "A2",
    route: "Pure + Mechanics + Statistics",
    papers: [
      { paper: 1, name: "Pure Mathematics 1", type: "Pure Mathematics", maximumMark: 75 },
      { paper: 3, name: "Pure Mathematics 3", type: "Pure Mathematics", maximumMark: 75 },
      { paper: 4, name: "Mechanics", type: "Mechanics", maximumMark: 50 },
      { paper: 5, name: "Probability & Statistics 1", type: "Probability & Statistics", maximumMark: 50 }
    ]
  }
};

const edexcelScienceUnits = {
  Biology: [
    { paper: 1, name: "Unit 1", type: "Molecules, Diet, Transport and Health", maximumMark: 80 },
    { paper: 2, name: "Unit 2", type: "Cells, Development, Biodiversity and Conservation", maximumMark: 80 },
    { paper: 3, name: "Unit 3", type: "Practical Skills in Biology I", maximumMark: 50 },
    { paper: 4, name: "Unit 4", type: "Energy, Environment, Microbiology and Immunity", maximumMark: 90 },
    { paper: 5, name: "Unit 5", type: "Respiration, Internal Environment, Coordination and Gene Technology", maximumMark: 90 },
    { paper: 6, name: "Unit 6", type: "Practical Skills in Biology II", maximumMark: 50 }
  ],
  Chemistry: [
    { paper: 1, name: "Unit 1", type: "Structure, Bonding and Introduction to Organic Chemistry", maximumMark: 80 },
    { paper: 2, name: "Unit 2", type: "Energetics, Group Chemistry, Halogenoalkanes and Alcohols", maximumMark: 80 },
    { paper: 3, name: "Unit 3", type: "Practical Skills in Chemistry I", maximumMark: 50 },
    { paper: 4, name: "Unit 4", type: "Rates, Equilibria and Further Organic Chemistry", maximumMark: 90 },
    { paper: 5, name: "Unit 5", type: "Transition Metals and Organic Nitrogen Chemistry", maximumMark: 90 },
    { paper: 6, name: "Unit 6", type: "Practical Skills in Chemistry II", maximumMark: 50 }
  ],
  Physics: [
    { paper: 1, name: "Unit 1", type: "Mechanics and Materials", maximumMark: 80 },
    { paper: 2, name: "Unit 2", type: "Waves and Electricity", maximumMark: 80 },
    { paper: 3, name: "Unit 3", type: "Practical Physics I", maximumMark: 50 },
    { paper: 4, name: "Unit 4", type: "Further Mechanics, Fields and Particles", maximumMark: 90 },
    { paper: 5, name: "Unit 5", type: "Thermodynamics, Radiation, Oscillations and Cosmology", maximumMark: 90 },
    { paper: 6, name: "Unit 6", type: "Practical Physics II", maximumMark: 50 }
  ]
};

const edexcelMathRoutes = {
  "as-statistics": {
    qualification: "AS",
    route: "Statistics",
    papers: [
      { paper: 1, name: "P1", type: "Pure Mathematics 1", maximumMark: 75 },
      { paper: 2, name: "P2", type: "Pure Mathematics 2", maximumMark: 75 },
      { paper: 5, name: "S1", type: "Statistics 1", maximumMark: 75 }
    ]
  },
  "as-mechanics": {
    qualification: "AS",
    route: "Mechanics",
    papers: [
      { paper: 1, name: "P1", type: "Pure Mathematics 1", maximumMark: 75 },
      { paper: 2, name: "P2", type: "Pure Mathematics 2", maximumMark: 75 },
      { paper: 4, name: "M1", type: "Mechanics 1", maximumMark: 75 }
    ]
  },
  "a2-statistics": {
    qualification: "A2",
    route: "Statistics",
    papers: [
      { paper: 3, name: "P3", type: "Pure Mathematics 3", maximumMark: 75 },
      { paper: 4, name: "P4", type: "Pure Mathematics 4", maximumMark: 75 },
      { paper: 6, name: "S2", type: "Statistics 2", maximumMark: 75 }
    ]
  },
  "a2-mechanics": {
    qualification: "A2",
    route: "Mechanics",
    papers: [
      { paper: 3, name: "P3", type: "Pure Mathematics 3", maximumMark: 75 },
      { paper: 4, name: "P4", type: "Pure Mathematics 4", maximumMark: 75 },
      { paper: 7, name: "M2", type: "Mechanics 2", maximumMark: 75 }
    ]
  }
};

function slug(value) {
  return String(value).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function buildPapers({ catalogueId, board, subject, syllabusCode, qualification, route, sessions, variants, components }) {
  return sessions.flatMap(({ year, session, sessionCode }) => variants.flatMap((variant) => components.map((component) => ({
    id: [catalogueId, year, sessionCode, `v${variant}`, `p${component.paper}`].map(slug).join("-"),
    year,
    session,
    sessionCode,
    variant: String(variant),
    paper: component.paper,
    name: `${subject} ${component.name}`,
    type: component.type,
    maximumMark: component.maximumMark,
    files: { questionPaper: "", markScheme: "", examinerReport: "" },
    board,
    subject,
    syllabusCode,
    code: syllabusCode,
    qualification,
    route,
    catalogueId,
    catalogueSource: "built-in"
  }))));
}

function buildCatalogue(config) {
  const catalogueId = config.catalogueId;
  return {
    id: catalogueId,
    source: "built-in",
    data: {
      catalogueId,
      board: config.board,
      subject: config.subject,
      syllabusCode: config.syllabusCode || "",
      code: config.syllabusCode || "",
      qualification: config.qualification,
      route: config.route || null
    },
    papers: buildPapers(config)
  };
}

function buildCieScienceCatalogues() {
  return cieSubjects.flatMap(({ subject, syllabusCode }) => ["AS", "A2"].map((qualification) => buildCatalogue({
    catalogueId: `cie-${syllabusCode}-${qualification.toLowerCase()}`,
    board: "CIE",
    subject,
    syllabusCode,
    qualification,
    route: null,
    sessions: cieSessions,
    variants: ["1", "2", "3"],
    components: cieScienceComponents[qualification]
  })));
}

function buildCieMathCatalogues() {
  return Object.entries(cieMathComponents).map(([routeKey, route]) => buildCatalogue({
    catalogueId: `cie-9709-${routeKey}`,
    board: "CIE",
    subject: "Mathematics",
    syllabusCode: "9709",
    qualification: route.qualification,
    route: route.route,
    sessions: cieSessions,
    variants: ["1", "2", "3"],
    components: route.papers
  }));
}

function edexcelUnitsFor(qualification, units) {
  if (qualification === "AS") return units.slice(0, 3);
  if (qualification === "A2") return units.slice(3, 6);
  return units;
}

function buildEdexcelScienceCatalogues() {
  return Object.entries(edexcelScienceUnits).flatMap(([subject, units]) => ["AS", "A2"].map((qualification) => buildCatalogue({
    catalogueId: `edexcel-ial-${slug(subject)}-${qualification.toLowerCase()}`,
    board: "Edexcel",
    subject,
    syllabusCode: "IAL",
    qualification,
    route: null,
    sessions: edexcelSessions,
    variants: ["IAL"],
    components: edexcelUnitsFor(qualification, units)
  })));
}

function buildEdexcelMathCatalogues() {
  return Object.entries(edexcelMathRoutes).map(([routeKey, route]) => buildCatalogue({
    catalogueId: `edexcel-ial-mathematics-${routeKey}`,
    board: "Edexcel",
    subject: "Mathematics",
    syllabusCode: "IAL",
    qualification: route.qualification,
    route: route.route,
    sessions: edexcelSessions,
    variants: ["IAL"],
    components: route.papers
  }));
}

export const builtInCatalogues = [
  ...buildCieScienceCatalogues(),
  ...buildCieMathCatalogues(),
  ...buildEdexcelScienceCatalogues(),
  ...buildEdexcelMathCatalogues()
];

export function findCatalogue(catalogueId) {
  return builtInCatalogues.find((catalogue) => catalogue.id === catalogueId) || null;
}

export function catalogueLabel(catalogue) {
  const route = catalogue.data.route ? ` · ${catalogue.data.route}` : "";
  return `${catalogue.data.subject} ${catalogue.data.qualification}${route}`;
}
