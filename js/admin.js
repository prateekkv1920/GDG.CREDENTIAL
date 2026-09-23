/**
 * ============================================================
 * DevHack 2026 — Admin Panel Logic (100% Supabase Cloud)
 * ============================================================
 * Exclusively connects to Supabase Cloud:
 * 1. Authenticates admin with SHA-256 passphrase.
 * 2. Parses participant CSV.
 * 3. Matches and processes certificate image files.
 * 4. Permanently writes participant records and certificate data into Supabase PostgreSQL & Storage.
 * ============================================================
 */

import { supabase, isSupabaseConfigured, SUPABASE_URL } from './supabase-config.js';
import { parseCSV, validateCSVData } from './csv-parser.js';

// ============================================================
// 🔒 ADMIN PASSPHRASE HASH (SHA-256)
// ============================================================
const ADMIN_PASSPHRASE_HASH = 'c34b8d4bd56761f623b0dd6b1adc0c3919f10d6ed75383f0c1bb3c79d7ae3919';

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

const skipExistingCheckbox = document.getElementById('skip-existing');

// State: Store collected certificate image files
let selectedImageFiles = [];

// ══════════════════════════════════════════════════════════════
// Auth Gate Logic
// ══════════════════════════════════════════════════════════════

if (sessionStorage.getItem('devhack_admin_auth') === 'true') {
  authGate.classList.add('hidden');
  adminPanel.classList.remove('hidden');
}

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const passphrase = passphraseInput.value.trim();
  const inputHash = await hashPassword(passphrase);

  if (inputHash === ADMIN_PASSPHRASE_HASH) {
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
// Supabase Database Health Check & SQL Setup Helper
// ══════════════════════════════════════════════════════════════

const supabaseStatusDot = document.getElementById('supabase-status-dot');
const supabaseStatusText = document.getElementById('supabase-status-text');
const supabaseSetupAlert = document.getElementById('supabase-setup-alert');
const btnCopySql = document.getElementById('btn-copy-sql');

const SQL_SETUP_CODE = `-- 1. Create the certificates table in Supabase
CREATE TABLE IF NOT EXISTS certificates (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  certificate_url TEXT NOT NULL,
  certificate_filename TEXT NOT NULL,
  event_name TEXT DEFAULT 'DevHack 2026',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable Row Level Security (RLS) on certificates table
ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;

-- 3. Allow public reading of certificates
DROP POLICY IF EXISTS "Allow public read" ON certificates;
CREATE POLICY "Allow public read" ON certificates FOR SELECT TO anon USING (true);

-- 4. Allow public inserting and updating
DROP POLICY IF EXISTS "Allow public insert" ON certificates;
CREATE POLICY "Allow public insert" ON certificates FOR ALL TO anon USING (true);
`;

if (btnCopySql) {
  btnCopySql.addEventListener('click', () => {
    navigator.clipboard.writeText(SQL_SETUP_CODE).then(() => {
      btnCopySql.textContent = '✅ Copied to Clipboard!';
      setTimeout(() => { btnCopySql.textContent = '📋 Copy SQL Script'; }, 2500);
    }).catch(() => {
      prompt('Copy the SQL script below:', SQL_SETUP_CODE);
    });
  });
}

async function checkSupabaseHealth() {
  if (!supabaseStatusDot || !supabaseStatusText) return;

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.from('certificates').select('id').limit(1);

      if (error) {
        console.warn('Supabase table check:', error);
        supabaseStatusDot.className = 'w-2 h-2 rounded-full bg-red-400 animate-pulse';
        supabaseStatusText.textContent = 'Supabase Table Missing';
        if (supabaseSetupAlert) supabaseSetupAlert.classList.remove('hidden');
      } else {
        supabaseStatusDot.className = 'w-2 h-2 rounded-full bg-gdg-green';
        supabaseStatusText.innerHTML = '🟢 Supabase DB Connected &amp; Ready';
        if (supabaseSetupAlert) supabaseSetupAlert.classList.add('hidden');
      }
    } catch (err) {
      supabaseStatusDot.className = 'w-2 h-2 rounded-full bg-red-400';
      supabaseStatusText.textContent = 'Supabase Connection Error';
    }
  } else {
    supabaseStatusDot.className = 'w-2 h-2 rounded-full bg-red-400';
    supabaseStatusText.textContent = 'Supabase Not Configured';
  }
}

checkSupabaseHealth();

// ══════════════════════════════════════════════════════════════
// Certificate Image Selection & Folder Upload Handlers
// ══════════════════════════════════════════════════════════════

const VALID_IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp'];

function isImageFile(filename) {
  const lower = filename.toLowerCase();
  return VALID_IMAGE_EXTS.some(ext => lower.endsWith(ext));
}

function compressCertificateImage(file, maxWidth = 1600, quality = 0.85) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(dataUrl);
        } catch (err) {
          console.warn('Canvas compression error, using raw file data:', err);
          resolve(e.target.result);
        }
      };
      img.onerror = () => resolve(e.target.result);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

function updateImagesDisplay(files, sourceLabel = '') {
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

if (folderInput) {
  folderInput.addEventListener('change', () => {
    if (folderInput.files.length > 0) {
      const samplePath = folderInput.files[0].webkitRelativePath || '';
      const folderName = samplePath.split('/')[0] || 'Folder';
      updateImagesDisplay(folderInput.files, `📁 ${folderName}`);
    }
  });
}

if (imagesInput) {
  imagesInput.addEventListener('change', () => {
    if (imagesInput.files.length > 0) {
      updateImagesDisplay(imagesInput.files, '🖼️ Selected Files');
    }
  });
}

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

// ── Drag & Drop Traversal ──
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
// Upload & Process Handler — 100% Supabase
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
    alert('Please select or drop certificate images folder/files.');
    return;
  }

  if (!isSupabaseConfigured || !supabase) {
    alert('Supabase is not configured. Please check connection.');
    return;
  }

  // Show Progress Section
  progressSection.classList.remove('hidden');
  progressSection.classList.add('animate-fade-in-up');
  clearLog();

  uploadBtn.disabled = true;
  uploadBtnText.textContent = 'Uploading to Supabase...';
  uploadSpinner.classList.remove('hidden');

  const startTime = performance.now();

  try {
    addLog(`⚡ <strong>Connected to Supabase:</strong> ${SUPABASE_URL}`, 'success');
    addLog('Uploading participant credentials and certificates directly into Supabase Cloud...', 'info');

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
      const baseName = file.name.split('/').pop().split('\\').pop().toLowerCase().trim();
      imageMap[baseName] = file;
    }
    addLog(`Indexed <strong>${Object.keys(imageMap).length}</strong> certificate image(s).`, 'success');

    // ── Check Existing Records if "Skip Already Uploaded" is checked ──
    const shouldSkipExisting = skipExistingCheckbox && skipExistingCheckbox.checked;
    const existingEmailsSet = new Set();

    if (shouldSkipExisting) {
      addLog('Checking Supabase for already uploaded records...', 'info');
      try {
        const { data: existingRecords, error: fetchErr } = await supabase
          .from('certificates')
          .select('email');

        if (!fetchErr && existingRecords) {
          existingRecords.forEach(r => {
            if (r.email) existingEmailsSet.add(r.email.toLowerCase().trim());
          });
          addLog(`Found <strong>${existingEmailsSet.size}</strong> existing record(s) in Supabase. Only missing/failed records will be uploaded.`, 'info');
        }
      } catch (err) {
        console.warn('Could not fetch existing records:', err);
      }
    }

    // ── Step 4: Process Each Row directly into Supabase ──
    addLog('', 'divider');
    addLog(`Starting Supabase upload pipeline for <strong>${csvData.length}</strong> record(s)...`, 'info');
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

      // Skip already uploaded if option is selected
      if (shouldSkipExisting && existingEmailsSet.has(email)) {
        addLog(`Row ${rowNum} (${name}): Already uploaded in Supabase — Skipped.`, 'info');
        skipCount++;
        updateProgress(i + 1, csvData.length);
        continue;
      }

      // Match certificate image
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
        const effectiveCertName = imageFile.name.split('/').pop().split('\\').pop();
        const passwordHash = await hashPassword(password);

        // Compress image on the fly (~50KB WebP/JPEG) for instant upload & 0 database disk bloat
        const downloadURL = await compressCertificateImage(imageFile);

        // Insert / Upsert directly into Supabase Table 'certificates'
        const { error: dbErr } = await supabase
          .from('certificates')
          .upsert({
            name: name,
            email: email,
            password_hash: passwordHash,
            certificate_url: downloadURL,
            certificate_filename: effectiveCertName,
            event_name: eventName
          }, { onConflict: 'email' });
            certificate_url: downloadURL,
            certificate_filename: effectiveCertName,
            event_name: eventName
          }, { onConflict: 'email' });

        if (dbErr) throw dbErr;

        addLog(`Row ${rowNum} (${name}): Saved permanently in Supabase for <strong>${email}</strong>.`, 'success');
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
    addLog(`🎉 <strong>Upload to Supabase Completed in ${duration}s</strong>`, 'success');
    addLog(`&nbsp;&nbsp;• <strong>${successCount}</strong> certificate(s) stored in Supabase`, 'success');
    if (skipCount > 0) addLog(`&nbsp;&nbsp;• <strong>${skipCount}</strong> skipped`, 'warning');
    if (errorCount > 0) addLog(`&nbsp;&nbsp;• <strong>${errorCount}</strong> failed`, 'error');

    if (successCount > 0) {
      addLog(`<div class="mt-2 flex items-center gap-2"><a href="index.html" class="inline-flex items-center gap-1.5 px-3.5 py-2 bg-gdg-blue text-white rounded-lg font-medium hover:bg-blue-600 transition text-xs shadow-lg shadow-blue-500/20">🚀 Open Participant Portal to Test Login →</a></div>`, 'info');
    }

  } catch (error) {
    console.error('Supabase upload pipeline failed:', error);
    addLog(`Pipeline Aborted: ${error.message}`, 'error');
  } finally {
    uploadBtn.disabled = false;
    uploadBtnText.textContent = 'Upload & Process';
    uploadSpinner.classList.add('hidden');
  }
});

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
