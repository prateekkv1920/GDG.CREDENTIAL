/**
 * ============================================================
 * DevHack 2026 — Admin Panel Logic
 * ============================================================
 * Handles: Passphrase authentication, CSV parsing,
 *          Folder / multi-image upload & Drag-and-Drop,
 *          Firebase Storage/Firestore upload with automatic Local
 *          IndexedDB fallback for testing, real-time progress tracking
 * ============================================================
 */

import { db, storage, isConfigured } from './firebase-config.js';
import {
  collection,
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import { parseCSV, validateCSVData } from './csv-parser.js';
import { saveParticipantLocal, fileToDataURL } from './storage-adapter.js';

// ============================================================
// 🔑 ADMIN PASSPHRASE
// ============================================================
const ADMIN_PASSPHRASE = 'devhack2026admin';

// ── SHA-256 Password Hashing (Web Crypto API) ──
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ══════════════════════════════════════════════════════════════
// DOM Elements
// ══════════════════════════════════════════════════════════════

// Auth Gate
const authGate = document.getElementById('auth-gate');
const adminPanel = document.getElementById('admin-panel');
const authForm = document.getElementById('auth-form');
const authError = document.getElementById('auth-error');
const authErrorText = document.getElementById('auth-error-text');
const passphraseInput = document.getElementById('passphrase');
const adminLogout = document.getElementById('admin-logout');

// Upload Form
const eventNameInput = document.getElementById('event-name');
const csvInput = document.getElementById('csv-file');
const imagesInput = document.getElementById('cert-images');
const folderInput = document.getElementById('cert-folder');
const certDropzone = document.getElementById('cert-dropzone');
const btnSelectFolder = document.getElementById('btn-select-folder');
const btnSelectFiles = document.getElementById('btn-select-files');

const uploadForm = document.getElementById('upload-form');
const uploadBtn = document.getElementById('upload-btn');
const uploadBtnText = document.getElementById('upload-btn-text');
const uploadSpinner = document.getElementById('upload-spinner');
const resetBtn = document.getElementById('reset-btn');

// File name displays
const csvFileName = document.getElementById('csv-file-name');
const imagesFileName = document.getElementById('images-file-name');

// Progress section
const progressSection = document.getElementById('progress-section');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const statusLog = document.getElementById('status-log');

// State: Store collected certificate image files
let selectedImageFiles = [];

// ══════════════════════════════════════════════════════════════
// Auth Gate Logic
// ══════════════════════════════════════════════════════════════

if (sessionStorage.getItem('devhack_admin_auth') === 'true') {
  authGate.classList.add('hidden');
  adminPanel.classList.remove('hidden');
}

authForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const passphrase = passphraseInput.value.trim();

  if (passphrase === ADMIN_PASSPHRASE) {
    sessionStorage.setItem('devhack_admin_auth', 'true');
    authError.classList.add('hidden');

    authGate.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
    authGate.style.opacity = '0';
    authGate.style.transform = 'translateY(-20px)';

    setTimeout(() => {
      authGate.classList.add('hidden');
      authGate.style.opacity = '';
      authGate.style.transform = '';

      adminPanel.classList.remove('hidden');
      adminPanel.classList.add('animate-fade-in-up');
    }, 350);
  } else {
    authErrorText.textContent = 'Invalid passphrase. Access denied.';
    authError.classList.remove('hidden');
    authError.classList.remove('animate-slide-down');
    void authError.offsetWidth;
    authError.classList.add('animate-slide-down');
    passphraseInput.value = '';
    passphraseInput.focus();
  }
});

if (adminLogout) {
  adminLogout.addEventListener('click', () => {
    sessionStorage.removeItem('devhack_admin_auth');
    location.reload();
  });
}

// ══════════════════════════════════════════════════════════════
// Certificate Image Selection & Folder Upload Handlers
// ══════════════════════════════════════════════════════════════

const VALID_IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp'];

function isImageFile(filename) {
  const lower = filename.toLowerCase();
  return VALID_IMAGE_EXTS.some(ext => lower.endsWith(ext));
}

function updateImagesDisplay(files, sourceLabel = '') {
  // Filter out system files or non-images
  const filtered = Array.from(files).filter(f => isImageFile(f.name));
  selectedImageFiles = filtered;

  if (selectedImageFiles.length > 0) {
    let totalBytes = 0;
    for (const f of selectedImageFiles) totalBytes += f.size;
    const sizeMB = (totalBytes / (1024 * 1024)).toFixed(1);
    const count = selectedImageFiles.length;

    imagesFileName.innerHTML = `
      <span class="inline-flex items-center gap-1.5 text-gdg-green text-xs font-mono bg-gdg-green/10 border border-gdg-green/20 px-3 py-1.5 rounded-full">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
        ${sourceLabel ? `${sourceLabel}: ` : ''}<strong>${count}</strong> certificate image${count > 1 ? 's' : ''} loaded (${sizeMB} MB)
      </span>
    `;
  } else {
    imagesFileName.innerHTML = `
      <span class="text-gdg-yellow text-xs font-mono">No valid image files (.png, .jpg, .webp) found in selection.</span>
    `;
  }
}

// Button click triggers
if (btnSelectFolder && folderInput) {
  btnSelectFolder.addEventListener('click', (e) => {
    e.preventDefault();
    folderInput.click();
  });
}

if (btnSelectFiles && imagesInput) {
  btnSelectFiles.addEventListener('click', (e) => {
    e.preventDefault();
    imagesInput.click();
  });
}

// Folder input change
if (folderInput) {
  folderInput.addEventListener('change', () => {
    if (folderInput.files.length > 0) {
      // Find folder name if available
      const samplePath = folderInput.files[0].webkitRelativePath || '';
      const folderName = samplePath.split('/')[0] || 'Folder';
      updateImagesDisplay(folderInput.files, `📁 ${folderName}`);
    }
  });
}

// Multi-file input change
if (imagesInput) {
  imagesInput.addEventListener('change', () => {
    if (imagesInput.files.length > 0) {
      updateImagesDisplay(imagesInput.files, '🖼️ Selected Files');
    }
  });
}

// CSV input display
csvInput.addEventListener('change', () => {
  if (csvInput.files[0]) {
    const file = csvInput.files[0];
    csvFileName.innerHTML = `
      <span class="inline-flex items-center gap-1.5 text-gdg-green text-xs font-mono bg-gdg-green/10 border border-gdg-green/20 px-2.5 py-1 rounded-full">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
        ${file.name} (${(file.size / 1024).toFixed(1)} KB)
      </span>
    `;
  } else {
    csvFileName.innerHTML = '';
  }
});

// ── Drag & Drop with Recursive Directory Traversal ──
if (certDropzone) {
  ['dragenter', 'dragover'].forEach(eventName => {
    certDropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      certDropzone.classList.add('border-gdg-green', 'bg-gdg-green/5');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    certDropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      certDropzone.classList.remove('border-gdg-green', 'bg-gdg-green/5');
    });
  });

  certDropzone.addEventListener('drop', async (e) => {
    const items = e.dataTransfer.items;
    const droppedFiles = [];

    if (items) {
      const queue = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.webkitGetAsEntry) {
          const entry = item.webkitGetAsEntry();
          if (entry) queue.push(traverseFileTree(entry));
        } else {
          const file = item.getAsFile();
          if (file && isImageFile(file.name)) droppedFiles.push(file);
        }
      }

      if (queue.length > 0) {
        const nestedFiles = await Promise.all(queue);
        nestedFiles.flat().forEach(f => droppedFiles.push(f));
      }
    } else if (e.dataTransfer.files) {
      Array.from(e.dataTransfer.files).forEach(f => {
        if (isImageFile(f.name)) droppedFiles.push(f);
      });
    }

    if (droppedFiles.length > 0) {
      updateImagesDisplay(droppedFiles, '📥 Dropped Folder/Files');
    }
  });
}

function traverseFileTree(item) {
  return new Promise((resolve) => {
    if (item.isFile) {
      item.file((file) => {
        if (isImageFile(file.name)) resolve([file]);
        else resolve([]);
      });
    } else if (item.isDirectory) {
      const dirReader = item.createReader();
      const readAllEntries = () => {
        dirReader.readEntries(async (entries) => {
          if (entries.length === 0) {
            resolve([]);
          } else {
            const nested = await Promise.all(entries.map(traverseFileTree));
            resolve(nested.flat());
          }
        });
      };
      readAllEntries();
    } else {
      resolve([]);
    }
  });
}

// ══════════════════════════════════════════════════════════════
// Logging System
// ══════════════════════════════════════════════════════════════

function addLog(message, type = 'info') {
  const entry = document.createElement('div');
  entry.className = 'flex items-start gap-2 py-1 font-mono text-xs leading-relaxed animate-fade-in-up';

  const time = new Date();
  const timestamp = time.toTimeString().split(' ')[0] + '.' + String(time.getMilliseconds()).padStart(3, '0');

  let icon = '';
  let textColor = 'text-white/70';

  switch (type) {
    case 'success':
      icon = '<span class="text-gdg-green font-bold">✓</span>';
      textColor = 'text-gdg-green';
      break;
    case 'error':
      icon = '<span class="text-gdg-red font-bold">✗</span>';
      textColor = 'text-gdg-red';
      break;
    case 'warning':
      icon = '<span class="text-gdg-yellow font-bold">⚠</span>';
      textColor = 'text-gdg-yellow';
      break;
    case 'divider':
      entry.className = 'border-t border-white/5 my-2';
      statusLog.appendChild(entry);
      return;
    default:
      icon = '<span class="text-gdg-blue font-bold">ℹ</span>';
      textColor = 'text-white/70';
  }

  entry.innerHTML = `
    <span class="text-white/30 select-none flex-shrink-0">${timestamp}</span>
    <span class="flex-shrink-0">${icon}</span>
    <span class="${textColor} flex-1 break-words">${message}</span>
  `;

  statusLog.appendChild(entry);
  statusLog.scrollTop = statusLog.scrollHeight;
}

function updateProgress(current, total) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;
  progressBar.style.width = `${percent}%`;
  progressText.textContent = `${current} / ${total} (${percent}%)`;
}

function clearLog() {
  statusLog.innerHTML = '';
  progressBar.style.width = '0%';
  progressText.textContent = '0 / 0';
}

// ══════════════════════════════════════════════════════════════
// Upload & Process Handler
// ══════════════════════════════════════════════════════════════

uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const eventName = eventNameInput.value.trim();
  const csvFile = csvInput.files[0];
  const imageFiles = selectedImageFiles;

  // Validation
  if (!eventName) {
    alert('Please enter an event name.');
    eventNameInput.focus();
    return;
  }

  if (!csvFile) {
    alert('Please select a CSV file.');
    return;
  }

  if (!csvFile.name.toLowerCase().endsWith('.csv')) {
    alert('Please select a valid CSV file (.csv extension).');
    return;
  }

  if (imageFiles.length === 0) {
    alert('Please select or drop a certificate images folder/files.');
    return;
  }

  // Show Progress Section
  progressSection.classList.remove('hidden');
  progressSection.classList.add('animate-fade-in-up');
  clearLog();

  // Disable form
  uploadBtn.disabled = true;
  uploadBtnText.textContent = 'Processing...';
  uploadSpinner.classList.remove('hidden');

  const startTime = performance.now();

  try {
    const isFirebaseActive = isConfigured && db && storage;
    if (isFirebaseActive) {
      addLog('🔥 Connected to Firebase (Cloud Firestore & Storage).', 'success');
    } else {
      addLog('⚡ Running in Local Storage Mode (IndexedDB) for instant local testing.', 'warning');
      addLog('Participant certificates are processed and stored locally in your browser.', 'info');
    }

    // ── Step 1: Parse CSV ──
    addLog('Reading CSV file...', 'info');
    const csvText = await csvFile.text();
    const csvData = parseCSV(csvText);
    addLog(`Parsed <strong>${csvData.length}</strong> participant record(s) from CSV.`, 'success');

    // ── Step 2: Validate CSV Data ──
    addLog('Validating participant records...', 'info');
    const validationErrors = validateCSVData(csvData);

    if (validationErrors.length > 0) {
      addLog(`Found <strong>${validationErrors.length}</strong> validation error(s):`, 'error');
      validationErrors.forEach(err => addLog(`&nbsp;&nbsp;• ${err}`, 'error'));
      throw new Error('CSV validation failed. Please fix the errors and try again.');
    }
    addLog('CSV validation passed. All participant rows are valid.', 'success');

    // ── Step 3: Build Image Map ──
    addLog('Indexing uploaded certificate images...', 'info');
    const imageMap = {};
    for (const file of imageFiles) {
      // Store under basename (handling subfolder paths if any)
      const baseName = file.name.split('/').pop().split('\\').pop().toLowerCase().trim();
      imageMap[baseName] = file;
    }
    addLog(`Indexed <strong>${Object.keys(imageMap).length}</strong> certificate image(s).`, 'success');

    // ── Step 4: Process Each Row ──
    addLog('', 'divider');
    addLog(`Starting upload pipeline for <strong>${csvData.length}</strong> record(s)...`, 'info');
    addLog('', 'divider');

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (let i = 0; i < csvData.length; i++) {
      const row = csvData[i];
      const rowNum = i + 2;
      const name = row.name.trim();
      const email = row.gmail.trim().toLowerCase();
      const password = row.password.trim();
      const certFilename = (row.certificate_filename || '').trim();

      // Smart image lookup:
      // 1. Direct filename match (1.png, 2.png)
      // 2. Base filename without ext
      // 3. Name-based match (km_chanchal.png, jyoti_hansdah.jpg)
      // 4. Sequential index fallback (1st image -> 1st participant)
      const cleanCert = certFilename.toLowerCase().replace(/\.[^/.]+$/, "");
      const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '_');

      let imageFile = imageMap[certFilename.toLowerCase()] ||
                      imageMap[`${cleanCert}.png`] ||
                      imageMap[`${cleanCert}.jpg`] ||
                      imageMap[`${cleanCert}.jpeg`] ||
                      imageMap[`${cleanCert}.webp`];

      if (!imageFile) {
        for (const [key, file] of Object.entries(imageMap)) {
          if (key.includes(cleanName) || cleanName.includes(key.replace(/\.[^/.]+$/, ""))) {
            imageFile = file;
            break;
          }
        }
      }

      if (!imageFile && imageFiles[i]) {
        imageFile = imageFiles[i];
      }

      if (!imageFile) {
        addLog(`Row ${rowNum} (${name}): Skipped — No certificate image found.`, 'warning');
        skipCount++;
        updateProgress(i + 1, csvData.length);
        continue;
      }

      try {
        let downloadURL = '';
        const effectiveCertName = imageFile.name.split('/').pop().split('\\').pop();

        if (isFirebaseActive) {
          const storagePath = `certificates/${eventName}/${effectiveCertName}`;
          const storageRef = ref(storage, storagePath);
          addLog(`Row ${rowNum} (${name}): Uploading "${effectiveCertName}" to Firebase Storage...`, 'info');

          await uploadBytes(storageRef, imageFile);
          downloadURL = await getDownloadURL(storageRef);
          addLog(`Row ${rowNum} (${name}): Image uploaded to Cloud Storage.`, 'success');

          const passwordHash = await hashPassword(password);
          const docRef = doc(db, 'certificates', email);
          await setDoc(docRef, {
            name: name,
            email: email,
            passwordHash: passwordHash,
            certificateUrl: downloadURL,
            certificateFilename: effectiveCertName,
            eventName: eventName,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });

          addLog(`Row ${rowNum} (${name}): Firestore document created for <strong>${email}</strong>.`, 'success');
        } else {
          addLog(`Row ${rowNum} (${name}): Processing certificate "${effectiveCertName}"...`, 'info');
          const dataUrl = await fileToDataURL(imageFile);
          const passwordHash = await hashPassword(password);

          await saveParticipantLocal({
            name: name,
            email: email,
            passwordHash: passwordHash,
            certificateUrl: dataUrl,
            certificateFilename: effectiveCertName,
            eventName: eventName,
            createdAt: new Date().toISOString()
          });

          addLog(`Row ${rowNum} (${name}): Saved locally with SHA-256 password hash.`, 'success');
        }

        successCount++;
      } catch (rowError) {
        console.error(`Error processing row ${rowNum}:`, rowError);
        addLog(`Row ${rowNum} (${name}): Failed — ${rowError.message}`, 'error');
        errorCount++;
      }

      updateProgress(i + 1, csvData.length);
    }

    // ── Step 5: Summary ──
    const duration = ((performance.now() - startTime) / 1000).toFixed(1);
    addLog('', 'divider');
    addLog(`🎉 <strong>Pipeline Completed in ${duration}s</strong>`, 'success');
    addLog(`&nbsp;&nbsp;• <strong>${successCount}</strong> certificate(s) processed successfully`, 'success');
    if (skipCount > 0) addLog(`&nbsp;&nbsp;• <strong>${skipCount}</strong> skipped`, 'warning');
    if (errorCount > 0) addLog(`&nbsp;&nbsp;• <strong>${errorCount}</strong> failed`, 'error');

    if (successCount > 0) {
      addLog(`<div class="mt-2 flex items-center gap-2"><a href="index.html" class="inline-flex items-center gap-1.5 px-3.5 py-2 bg-gdg-blue text-white rounded-lg font-medium hover:bg-blue-600 transition text-xs shadow-lg shadow-blue-500/20">🚀 Open Participant Portal to Test Login →</a></div>`, 'info');
    }

  } catch (error) {
    console.error('Upload pipeline failed:', error);
    addLog(`Pipeline Aborted: ${error.message}`, 'error');
  } finally {
    uploadBtn.disabled = false;
    uploadBtnText.textContent = 'Upload & Process';
    uploadSpinner.classList.add('hidden');
  }
});

// ══════════════════════════════════════════════════════════════
// ⚡ One-Click Sample Test Upload Handler
// ══════════════════════════════════════════════════════════════

const btnQuickSample = document.getElementById('btn-quick-sample');

if (btnQuickSample) {
  btnQuickSample.addEventListener('click', async () => {
    eventNameInput.value = 'DevHack 2026';
    progressSection.classList.remove('hidden');
    progressSection.classList.add('animate-fade-in-up');
    clearLog();

    uploadBtn.disabled = true;
    btnQuickSample.disabled = true;
    uploadSpinner.classList.remove('hidden');

    addLog('⚡ <strong>Loading sample test dataset (DevHack 2026)...</strong>', 'info');

    try {
      // Fetch sample CSV & images
      const [csvResp, img1Resp, img2Resp] = await Promise.all([
        fetch('/sample-data/test.csv'),
        fetch('/sample-data/1.png'),
        fetch('/sample-data/2.png')
      ]);

      const csvText = await csvResp.text();
      const blob1 = await img1Resp.blob();
      const blob2 = await img2Resp.blob();

      const file1 = new File([blob1], '1.png', { type: 'image/png' });
      const file2 = new File([blob2], '2.png', { type: 'image/png' });

      selectedImageFiles = [file1, file2];
      updateImagesDisplay(selectedImageFiles, '⚡ Preloaded Sample Images');

      csvFileName.innerHTML = `
        <span class="inline-flex items-center gap-1.5 text-gdg-green text-xs font-mono bg-gdg-green/10 border border-gdg-green/20 px-2.5 py-1 rounded-full">
          ✓ test.csv (Preloaded)
        </span>
      `;

      addLog('Sample dataset loaded successfully.', 'success');
      addLog('Parsing 2 sample participant records...', 'info');

      const csvData = parseCSV(csvText);
      const isFirebaseActive = isConfigured && db && storage;

      const imageMap = {
        '1.png': file1,
        '2.png': file2
      };

      let successCount = 0;

      for (let i = 0; i < csvData.length; i++) {
        const row = csvData[i];
        const rowNum = i + 2;
        const name = row.name.trim();
        const email = row.gmail.trim().toLowerCase();
        const password = row.password.trim();
        const certFilename = row.certificate_filename.trim();
        const imageFile = imageMap[certFilename.toLowerCase()] || selectedImageFiles[i];

        addLog(`Row ${rowNum} (${name}): Processing certificate "${certFilename}"...`, 'info');

        if (isFirebaseActive) {
          const storagePath = `certificates/DevHack 2026/${certFilename}`;
          const storageRef = ref(storage, storagePath);
          await uploadBytes(storageRef, imageFile);
          const downloadURL = await getDownloadURL(storageRef);
          const passwordHash = await hashPassword(password);
          await setDoc(doc(db, 'certificates', email), {
            name, email, passwordHash, certificateUrl: downloadURL,
            certificateFilename: certFilename, eventName: 'DevHack 2026',
            createdAt: serverTimestamp(), updatedAt: serverTimestamp()
          });
          addLog(`Row ${rowNum} (${name}): Uploaded to Firebase for <strong>${email}</strong>`, 'success');
        } else {
          const dataUrl = await fileToDataURL(imageFile);
          const passwordHash = await hashPassword(password);
          await saveParticipantLocal({
            name, email, passwordHash, certificateUrl: dataUrl,
            certificateFilename: certFilename, eventName: 'DevHack 2026',
            createdAt: new Date().toISOString()
          });
          addLog(`Row ${rowNum} (${name}): Saved locally with password <code>${password}</code>`, 'success');
        }

        successCount++;
        updateProgress(i + 1, csvData.length);
      }

      addLog('', 'divider');
      addLog(`🎉 <strong>Sample Data Ready! ${successCount} certificates registered.</strong>`, 'success');
      addLog(`&nbsp;&nbsp;• <strong>KM chanchal</strong>: <code>chanchalkadem@gmail.com</code> / <code>#devhack@1</code>`, 'info');
      addLog(`&nbsp;&nbsp;• <strong>Jyoti Hansdah</strong>: <code>jyotiriya26@gmail.com</code> / <code>#devhack@2</code>`, 'info');
      addLog(`<div class="mt-2.5"><a href="index.html" class="inline-flex items-center gap-1.5 px-4 py-2 bg-gdg-blue text-white rounded-xl font-semibold hover:bg-blue-600 transition text-xs shadow-lg shadow-blue-500/20">🚀 Go to Participant Portal &amp; Log In →</a></div>`, 'info');

    } catch (err) {
      console.error('Quick sample upload error:', err);
      addLog(`Quick sample failed: ${err.message}`, 'error');
    } finally {
      uploadBtn.disabled = false;
      btnQuickSample.disabled = false;
      uploadSpinner.classList.add('hidden');
    }
  });
}

// ══════════════════════════════════════════════════════════════
// Reset Handler
// ══════════════════════════════════════════════════════════════

resetBtn.addEventListener('click', () => {
  uploadForm.reset();
  selectedImageFiles = [];
  csvFileName.innerHTML = '';
  imagesFileName.innerHTML = 'No folder or files chosen';
  progressSection.classList.add('hidden');
  clearLog();
});

