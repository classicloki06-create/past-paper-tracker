import { auth, firebaseReady } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

export function showToast(message, type = "success") {
  const region = document.querySelector("#toast-region");
  if (!region) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type === "error" ? "error" : ""}`;
  toast.textContent = message;
  region.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
  }, 3600);
}

export function formatPercent(value, decimals = 1) {
  if (!Number.isFinite(value)) return "0%";
  const fixed = Number.isInteger(value) ? value.toFixed(0) : value.toFixed(decimals);
  return `${fixed}%`;
}

export function formatDate(value) {
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(date);
}

export function setText(selector, text) {
  const element = document.querySelector(selector);
  if (element) element.textContent = text;
}

export function requireAuth(callback) {
  if (!firebaseReady) {
    showConfigurationError();
    return;
  }

  onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.href = "login.html";
      return;
    }
    callback(user);
  });
}

export function redirectAuthenticatedUsers(destination = "dashboard.html") {
  if (!firebaseReady) return;
  onAuthStateChanged(auth, (user) => {
    if (user) window.location.href = destination;
  });
}

export function wireLogout() {
  const button = document.querySelector("#logout-button");
  if (!button) return;

  button.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "login.html";
  });
}

export function showConfigurationError() {
  const errorBox = document.querySelector("[id$='-error']") || document.querySelector("#auth-message");
  const loading = document.querySelector("[id$='-loading']");
  loading?.classList.add("hidden");
  if (errorBox) {
    errorBox.classList.remove("hidden");
    errorBox.textContent = "Firebase is not configured yet. Add your web app values in js/firebase-config.js.";
  }
}

export function average(values) {
  if (!values.length) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function groupBy(items, keyGetter) {
  return items.reduce((groups, item) => {
    const key = keyGetter(item);
    groups[key] = groups[key] || [];
    groups[key].push(item);
    return groups;
  }, {});
}
