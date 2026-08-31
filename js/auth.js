import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { auth, firebaseReady } from "./firebase.js";
import { redirectAuthenticatedUsers } from "./app.js";

const message = document.querySelector("#auth-message");

function showMessage(text, isSuccess = false) {
  if (!message) return;
  message.textContent = text;
  message.classList.toggle("success", isSuccess);
}

function friendlyError(error) {
  const code = error?.code || "";
  if (code.includes("popup-closed-by-user")) return "Google sign-in was closed before it finished.";
  if (code.includes("popup-blocked")) return "Your browser blocked the Google sign-in popup. Allow popups for this site and try again.";
  if (code.includes("account-exists-with-different-credential")) return "An account already exists with this email using a different sign-in method.";
  if (code.includes("unauthorized-domain")) return "This domain is not authorized in Firebase Authentication yet.";
  if (code.includes("operation-not-allowed")) return "Google sign-in is not enabled in Firebase Authentication yet.";
  if (code.includes("invalid-email")) return "Enter a valid email address.";
  if (code.includes("user-not-found") || code.includes("wrong-password") || code.includes("invalid-credential")) return "Email or password is incorrect.";
  if (code.includes("email-already-in-use")) return "An account already exists for this email.";
  if (code.includes("weak-password")) return "Use a password with at least 6 characters.";
  if (code.includes("network-request-failed")) return "Check your internet connection and try again.";
  return "Something went wrong. Please try again.";
}

if (!firebaseReady) {
  showMessage("Firebase is not configured yet. Add your web app values in js/firebase-config.js.");
} else {
  redirectAuthenticatedUsers();
}

document.querySelector("#login-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const email = String(form.get("email") || "").trim();
  const password = String(form.get("password") || "");

  if (!email || !password) {
    showMessage("Enter your email and password.");
    return;
  }

  try {
    showMessage("Logging in...", true);
    await signInWithEmailAndPassword(auth, email, password);
    window.location.href = "dashboard.html";
  } catch (error) {
    showMessage(friendlyError(error));
  }
});

document.querySelector("#signup-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const name = String(form.get("name") || "").trim();
  const email = String(form.get("email") || "").trim();
  const password = String(form.get("password") || "");
  const confirm = String(form.get("confirm") || "");

  if (!name || !email || !password || !confirm) {
    showMessage("Complete all fields.");
    return;
  }
  if (password !== confirm) {
    showMessage("Passwords do not match.");
    return;
  }

  try {
    showMessage("Creating your account...", true);
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credential.user, { displayName: name });
    window.location.href = "dashboard.html";
  } catch (error) {
    showMessage(friendlyError(error));
  }
});

document.querySelector("#google-auth-button")?.addEventListener("click", async () => {
  if (!firebaseReady) {
    showMessage("Firebase is not configured yet. Add your web app values in js/firebase-config.js.");
    return;
  }

  try {
    showMessage("Opening Google sign-in...", true);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await signInWithPopup(auth, provider);
    window.location.href = "dashboard.html";
  } catch (error) {
    showMessage(friendlyError(error));
  }
});

document.querySelector("#reset-password")?.addEventListener("click", async () => {
  const email = String(document.querySelector("#login-email")?.value || "").trim();
  if (!email) {
    showMessage("Enter your email first, then request a reset link.");
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    showMessage("Password reset email sent.", true);
  } catch (error) {
    showMessage(friendlyError(error));
  }
});
