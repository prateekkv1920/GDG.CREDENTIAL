/**
 * ============================================================
 * Smart Vanilla JavaScript CSV Parser
 * ============================================================
 * Features:
 * - Precise and prioritized column mapping
 * - Prevents false matches (e.g., "team name" won't match "name")
 * - Auto-generates default password if column omitted (#devhack@1, #devhack@2)
 * - Auto-generates certificate filename if omitted (1.png, 2.png)
 * - Supports comma-separated, quoted fields, and tab-separated values
 * ============================================================
 */

function normalizeHeader(str) {
  return str
    .toLowerCase()
    .replace(/^\uFEFF/, '') // remove BOM
    .replace(/[^a-z0-9]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

// Priority patterns (checked in exact order)
const NAME_PATTERNS = [
  /^candidate s name$/,
  /^candidate name$/,
  /^participant s name$/,
  /^participant name$/,
  /^student s name$/,
  /^student name$/,
  /^full name$/,
  /^fullname$/,
  /^member name$/,
  /^name$/,
  /name$/ // ending with name (e.g. "user name", "first name", but not "team name" if filtered)
];

const EMAIL_PATTERNS = [
  /^candidate s email$/,
  /^candidate email$/,
  /^participant s email$/,
  /^participant email$/,
  /^student email$/,
  /^email address$/,
  /^e mail address$/,
  /^email$/,
  /^gmail$/,
  /^mail$/,
  /email/
];

const PASSWORD_PATTERNS = [
  /^password$/,
  /^pass$/,
  /^passcode$/,
  /^pin$/,
  /^access code$/,
  /^secret$/
];

const CERT_PATTERNS = [
  /^certificate filename$/,
  /^certificate_filename$/,
  /^certificate file$/,
  /^cert filename$/,
  /^cert_filename$/,
  /^certificate$/,
  /^cert$/,
  /^filename$/,
  /^file name$/,
  /^image$/
];

function findBestColumnMatch(headers, patterns, excludeWords = []) {
  for (const pattern of patterns) {
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i];
      if (excludeWords.some(w => h.includes(w))) continue;
      if (pattern.test(h)) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * Parse a CSV/TSV string into an array of standardized participant records.
 *
 * @param {string} csvText - Raw CSV text content
 * @returns {Object[]} Standardized array of row objects
 */
export function parseCSV(csvText) {
  const text = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

  if (!text) {
    throw new Error('CSV file is empty.');
  }

  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"' && currentField === '') {
        inQuotes = true;
      } else if (char === ',' || char === '\t') {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\n') {
        currentRow.push(currentField.trim());
        if (currentRow.length > 0 && currentRow.some(f => f !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }

  currentRow.push(currentField.trim());
  if (currentRow.length > 0 && currentRow.some(f => f !== '')) {
    rows.push(currentRow);
  }

  if (rows.length < 2) {
    throw new Error('CSV must contain a header row and at least one participant row.');
  }

  const rawHeaders = rows[0];
  const normalizedHeaders = rawHeaders.map(h => normalizeHeader(h));

  // Find column indexes with exclusion of ambiguous fields like "team name" or "project name"
  const nameCol = findBestColumnMatch(normalizedHeaders, NAME_PATTERNS, ['team', 'college', 'school', 'project', 'event']);
  const emailCol = findBestColumnMatch(normalizedHeaders, EMAIL_PATTERNS);
  const passCol = findBestColumnMatch(normalizedHeaders, PASSWORD_PATTERNS);
  const certCol = findBestColumnMatch(normalizedHeaders, CERT_PATTERNS);

  if (nameCol === -1) {
    throw new Error(
      `Could not identify the Participant Name column.\n` +
      `Found columns: ${rawHeaders.map(h => `"${h}"`).join(', ')}.\n` +
      `Please ensure one column is named "Name" or "Candidate's Name".`
    );
  }

  if (emailCol === -1) {
    throw new Error(
      `Could not identify the Email column.\n` +
      `Found columns: ${rawHeaders.map(h => `"${h}"`).join(', ')}.\n` +
      `Please ensure one column is named "Gmail" or "Candidate's Email".`
    );
  }

  // Build standardized participant objects
  const data = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const name = (nameCol !== -1 && row[nameCol]) ? row[nameCol].trim() : '';
    const email = (emailCol !== -1 && row[emailCol]) ? row[emailCol].trim() : '';

    let password = (passCol !== -1 && row[passCol]) ? row[passCol].trim() : '';
    if (!password) {
      password = `#devhack@${i}`;
    }

    let certFilename = (certCol !== -1 && row[certCol]) ? row[certCol].trim() : '';
    if (!certFilename) {
      certFilename = `${i}.png`;
    }

    if (name || email) {
      data.push({
        name,
        gmail: email,
        password,
        certificate_filename: certFilename,
        _rowIndex: i + 1
      });
    }
  }

  return data;
}

/**
 * Validate parsed CSV data for completeness and email format.
 *
 * @param {Object[]} data - Parsed CSV data
 * @returns {string[]} Array of error messages (empty if all valid)
 */
export function validateCSVData(data) {
  const errors = [];
  const emails = new Set();

  data.forEach((row) => {
    const rowNum = row._rowIndex || '?';

    if (!row.name) {
      errors.push(`Row ${rowNum}: Missing participant name.`);
    }

    if (!row.gmail) {
      errors.push(`Row ${rowNum}: Missing email address.`);
    } else {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(row.gmail)) {
        errors.push(`Row ${rowNum}: Invalid email format "${row.gmail}".`);
      }

      const normalizedEmail = row.gmail.toLowerCase();
      if (emails.has(normalizedEmail)) {
        errors.push(`Row ${rowNum}: Duplicate email "${row.gmail}".`);
      }
      emails.add(normalizedEmail);
    }
  });

  return errors;
}
