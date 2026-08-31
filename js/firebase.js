import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  browserLocalPersistence,
  setPersistence
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const missingConfig = Object.values(firebaseConfig).some((value) => String(value).startsWith("YOUR_"));

if (missingConfig) {
  console.warn("Firebase is using placeholder configuration. Add your real web app config in js/firebase-config.js.");
}

export const firebaseReady = !missingConfig;
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

setPersistence(auth, browserLocalPersistence);
