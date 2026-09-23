// ============================================================
// 🔥 FIREBASE CONFIGURATION
// ============================================================
// HOW TO USE:
// 1. Go to https://console.firebase.google.com
// 2. Create a project (or select existing)
// 3. Go to Project Settings → General → Your Apps → Web App
// 4. Copy the config object and paste below
// 5. Enable Firestore Database & Storage in Firebase Console
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// ⬇️ PASTE YOUR FIREBASE CONFIG HERE ⬇️
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
// ⬆️ PASTE YOUR FIREBASE CONFIG HERE ⬆️

// Check if Firebase has been configured
export const isConfigured = !firebaseConfig.apiKey.startsWith('YOUR_');

let app = null;
let db = null;
let storage = null;

if (isConfigured) {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    storage = getStorage(app);
    console.log('✅ Firebase initialized successfully');
  } catch (error) {
    console.error('❌ Firebase initialization error:', error);
  }
} else {
  console.warn(
    '⚠️ Firebase not configured!\n' +
    'Open js/firebase-config.js and paste your Firebase project config.\n' +
    'See: https://console.firebase.google.com'
  );
}

export { app, db, storage };
