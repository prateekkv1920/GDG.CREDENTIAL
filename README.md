# 🎓 DevHack 2026 — Certificate Distribution & Verification Portal

A modern, secure, full-stack certificate distribution and verification portal built for **DevHack 2026**, hosted by **Google Developer Groups (GDG) on Campus IIMT Meerut**.

---

## ✨ Features

- 🎨 **Google Developer Groups Branding**: Tailored color palette (Blue, Red, Yellow, Green), dark-mode admin panel, animated gradient background, and micro-interactions.
- 🔐 **Secure Participant Access**: Passwords hashed with SHA-256 via the Web Crypto API; verified access only.
- 📁 **Folder & Multi-File Upload**: Upload whole directories of certificates or select multiple files with intelligent file-matching.
- 📊 **Smart CSV Parsing**: Automatically maps columns (`Name`, `Email`, `Password`, `Certificate Filename`) with fuzzy header detection and default fallback passwords.
- 📥 **Direct Certificate Download & Web Share**: Download high-resolution PNG certificates and share achievements with one click.
- ☁️ **Firebase & Local Storage Support**: Seamlessly works with Firebase (Cloud Firestore & Storage) and includes built-in offline/local testing support via IndexedDB.

---

## 🚀 Getting Started

### 1. Run Locally
Open `index.html` (Participant Portal) or `admin.html` (Admin Panel) via a local server (e.g., Live Server or Vite/Node).

- **Participant Portal:** `http://localhost:3000`
- **Admin Panel:** `http://localhost:3000/admin.html`
- **Default Admin Passphrase:** `devhack2026admin`

### 2. Connect Firebase (Optional)
To connect live Firebase cloud storage and database:
1. Open `js/firebase-config.js`
2. Paste your Firebase project configuration object.
3. Enable Firestore and Firebase Storage in your Firebase Console.

---

## 📬 Contact & Support

For queries or event support, contact: **[gdg@iimtindia.net](mailto:gdg@iimtindia.net)**  
**GDG on Campus IIMT Meerut**
