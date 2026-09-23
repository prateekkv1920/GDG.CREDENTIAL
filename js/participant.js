/**
 * ============================================================
 * DevHack 2026 — Participant Portal Logic
 * ============================================================
 * Handles: Login, Supabase / Firestore / Local DB query,
 *          SHA-256 password verification, certificate display,
 *          blob-based download, Web Share, confetti effect
 * ============================================================
 */

import { supabase, isSupabaseConfigured } from './supabase-config.js';
import { db, isConfigured as isFirebaseConfigured } from './firebase-config.js';
import {
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getParticipantByEmailLocal } from './storage-adapter.js';

// ── SHA-256 Password Hashing (Web Crypto API) ──
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── DOM Elements ──
// Login View
const loginView = document.getElementById('login-view');
const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const errorMessage = document.getElementById('error-message');
const errorText = document.getElementById('error-text');
const loginBtn = document.getElementById('login-btn');
const loginBtnText = document.getElementById('login-btn-text');
const loginSpinner = document.getElementById('login-spinner');
const togglePasswordBtn = document.getElementById('toggle-password');
const eyeIcon = document.getElementById('eye-icon');
const eyeOffIcon = document.getElementById('eye-off-icon');

// Dashboard View
const dashboardView = document.getElementById('dashboard-view');
const userNameEl = document.getElementById('user-name');
const eventBadgeText = document.getElementById('event-badge-text');
const certificateImg = document.getElementById('certificate-img');
const certSkeleton = document.getElementById('cert-skeleton');
const downloadBtn = document.getElementById('download-btn');
const downloadBtnText = document.getElementById('download-btn-text');
const shareBtn = document.getElementById('share-btn');
const logoutBtn = document.getElementById('logout-btn');
const confettiContainer = document.getElementById('confetti-container');

// ── State ──
let currentUser = null;

// ── Password Toggle ──
if (togglePasswordBtn) {
  togglePasswordBtn.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    eyeIcon.classList.toggle('hidden', !isPassword);
    eyeOffIcon.classList.toggle('hidden', isPassword);
  });
}

// ── Error Handling ──
function showError(message) {
  errorText.textContent = message;
  errorMessage.classList.remove('hidden');
  errorMessage.classList.remove('animate-slide-down');
  void errorMessage.offsetWidth;
  errorMessage.classList.add('animate-slide-down');

  setTimeout(() => {
    if (!errorMessage.classList.contains('hidden')) {
      errorMessage.classList.add('hidden');
    }
  }, 8000);
}

function hideError() {
  errorMessage.classList.add('hidden');
}

// ── Loading State ──
function setLoading(loading) {
  loginBtn.disabled = loading;
  if (loading) {
    loginBtnText.textContent = 'Verifying...';
    loginSpinner.classList.remove('hidden');
  } else {
    loginBtnText.textContent = 'Access Certificate';
    loginSpinner.classList.add('hidden');
  }
}

// ── View Transitions ──
function showDashboard(user) {
  currentUser = user;

  // Populate dashboard
  userNameEl.textContent = user.name;
  eventBadgeText.textContent = user.eventName || 'DevHack 2026';

  // Show skeleton while image loads
  certSkeleton.classList.remove('hidden');
  certificateImg.classList.add('hidden');

  certificateImg.onload = () => {
    certSkeleton.classList.add('hidden');
    certificateImg.classList.remove('hidden');
    certificateImg.classList.add('animate-scale-in');
  };

  certificateImg.onerror = () => {
    certSkeleton.classList.add('hidden');
    certificateImg.classList.remove('hidden');
    certificateImg.alt = 'Failed to load certificate image';
  };

  certificateImg.src = user.certificateUrl;
  certificateImg.alt = `${user.name}'s DevHack 2026 Certificate`;

  loginView.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
  loginView.style.opacity = '0';
  loginView.style.transform = 'translateY(-20px)';

  setTimeout(() => {
    loginView.classList.add('hidden');
    loginView.style.opacity = '';
    loginView.style.transform = '';

    dashboardView.classList.remove('hidden');
    dashboardView.classList.add('animate-fade-in-up');

    launchConfetti();
  }, 350);
}

function showLogin() {
  currentUser = null;
  certificateImg.src = '';
  loginForm.reset();
  hideError();

  dashboardView.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
  dashboardView.style.opacity = '0';
  dashboardView.style.transform = 'translateY(20px)';

  setTimeout(() => {
    dashboardView.classList.add('hidden');
    dashboardView.style.opacity = '';
    dashboardView.style.transform = '';

    loginView.classList.remove('hidden');
    loginView.classList.add('animate-fade-in-up');
    emailInput.focus();
  }, 350);
}

// ── Confetti Animation ──
function launchConfetti() {
  confettiContainer.innerHTML = '';
  confettiContainer.classList.remove('hidden');

  const colors = ['#4285F4', '#EA4335', '#FBBC05', '#34A853', '#FFFFFF', '#A855F7'];
  const count = 75;

  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';

    const color = colors[Math.floor(Math.random() * colors.length)];
    const left = Math.random() * 100;
    const duration = 2.5 + Math.random() * 2.5;
    const delay = Math.random() * 1.5;
    const size = 6 + Math.random() * 8;
    const isCircle = Math.random() > 0.5;

    piece.style.cssText = `
      left: ${left}%;
      width: ${size}px;
      height: ${isCircle ? size : size * 1.6}px;
      background-color: ${color};
      border-radius: ${isCircle ? '50%' : '2px'};
      animation-duration: ${duration}s;
      animation-delay: ${delay}s;
    `;

    confettiContainer.appendChild(piece);
  }

  setTimeout(() => {
    confettiContainer.classList.add('hidden');
    confettiContainer.innerHTML = '';
  }, 5000);
}

// ── Download Handler ──
async function handleDownload() {
  if (!currentUser || !currentUser.certificateUrl) {
    showError('No certificate available for download.');
    return;
  }

  downloadBtn.disabled = true;
  downloadBtnText.textContent = 'Downloading...';

  try {
    const response = await fetch(currentUser.certificateUrl);
    if (!response.ok) throw new Error('Failed to fetch certificate image');

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    const safeName = currentUser.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${safeName}_DevHack2026_Certificate.png`;

    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  } catch (error) {
    console.error('Download error:', error);
    const a = document.createElement('a');
    a.href = currentUser.certificateUrl;
    a.target = '_blank';
    a.download = `${currentUser.name}_Certificate.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    downloadBtn.disabled = false;
    downloadBtnText.textContent = 'Download Certificate';
  }
}

// ── Share Handler ──
async function handleShare() {
  if (!currentUser) return;

  const shareData = {
    title: `${currentUser.name} — DevHack 2026 Certificate`,
    text: `Proud to share my certificate from DevHack 2026, hosted by GDG on Campus IIMT Meerut! 🚀`,
    url: window.location.href
  };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
    } catch (err) {
      if (err.name !== 'AbortError') {
        copyShareLink();
      }
    }
  } else {
    copyShareLink();
  }
}

function copyShareLink() {
  navigator.clipboard.writeText(window.location.href).then(() => {
    const origText = shareBtn.querySelector('span').textContent;
    shareBtn.querySelector('span').textContent = 'Link Copied!';
    setTimeout(() => {
      shareBtn.querySelector('span').textContent = origText;
    }, 2000);
  }).catch(() => {
    alert('Certificate portal URL: ' + window.location.href);
  });
}

// ══════════════════════════════════════════════════════════════
// Login Form Submission
// ══════════════════════════════════════════════════════════════

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError();

  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value.trim();

  if (!email || !password) {
    showError('Please fill in both email and password.');
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    showError('Please enter a valid email address.');
    return;
  }

  setLoading(true);

  try {
    const inputHash = await hashPassword(password);
    let userData = null;

    // 1. Check Supabase (Primary Cloud Database)
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('certificates')
        .select('*')
        .eq('email', email)
        .maybeSingle();

      if (data) {
        userData = {
          name: data.name,
          email: data.email,
          passwordHash: data.password_hash,
          certificateUrl: data.certificate_url,
          certificateFilename: data.certificate_filename,
          eventName: data.event_name
        };
      }
    }

    // 2. Check Firebase if configured
    if (!userData && isFirebaseConfigured && db) {
      const q = query(
        collection(db, 'certificates'),
        where('email', '==', email)
      );
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        userData = querySnapshot.docs[0].data();
      }
    }

    // 3. Check Local IndexedDB (fallback / offline test)
    if (!userData) {
      const localData = await getParticipantByEmailLocal(email);
      if (localData) {
        userData = localData;
      }
    }

    // Verification
    if (!userData) {
      showError('No certificate found for this email address. Please verify your email or contact the event organizers.');
      setLoading(false);
      return;
    }

    if (userData.passwordHash !== inputHash) {
      showError('Incorrect password. Please check your credentials and try again.');
      setLoading(false);
      return;
    }

    // Success — Show Certificate Dashboard
    showDashboard(userData);

  } catch (error) {
    console.error('Login error:', error);
    showError('An error occurred while accessing your certificate. Please try again.');
  } finally {
    setLoading(false);
  }
});

// ── Event Listeners ──
downloadBtn.addEventListener('click', handleDownload);
shareBtn.addEventListener('click', handleShare);
logoutBtn.addEventListener('click', showLogin);
