const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const app = express();
const port = positiveInteger(process.env.PORT, 3000);
const dbFilePath = process.env.DATABASE_PATH || '/data/database.sqlite';
const LEGACY_DATABASE_PATH = process.env.LEGACY_DATABASE_PATH || '/database.sqlite';
const packagedDistPath = path.resolve(__dirname, '../dist');
const sourceDistPath = path.resolve(__dirname, '../../dist');
const distPath = process.env.DIST_PATH || (fs.existsSync(packagedDistPath) ? packagedDistPath : sourceDistPath);

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const MAX_IMAGE_BYTES = positiveInteger(process.env.MAX_IMAGE_BYTES, 5 * 1024 * 1024);
const MAX_ENTRY_BYTES = positiveInteger(process.env.MAX_ENTRY_BYTES, 10 * 1024 * 1024);
const MAX_DATABASE_BYTES = positiveInteger(process.env.MAX_DATABASE_BYTES, 250 * 1024 * 1024);
const SQLITE_WRITE_OVERHEAD_BYTES = 64 * 1024;

fs.mkdirSync(path.dirname(dbFilePath), { recursive: true });
if (!fs.existsSync(dbFilePath) && fs.existsSync(LEGACY_DATABASE_PATH)) {
  fs.copyFileSync(LEGACY_DATABASE_PATH, dbFilePath, fs.constants.COPYFILE_EXCL);
}

const db = new sqlite3.Database(dbFilePath);
let writeQueue = Promise.resolve();
db.run(`CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

function decodedDataUriBytes(payload) {
  const comma = payload.indexOf(',');
  if (comma < 0) return Number.POSITIVE_INFINITY;
  const metadata = payload.slice(0, comma);
  const data = payload.slice(comma + 1);
  if (/;base64$/i.test(metadata)) {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data) || data.length % 4 === 1) return Number.POSITIVE_INFINITY;
    const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
    return Math.floor((data.length * 3) / 4) - padding;
  }
  try {
    return Buffer.byteLength(decodeURIComponent(data), 'utf8');
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function decodeHtmlCharacterReferences(value) {
  return value
    .replace(/&#(?:x([0-9a-f]+)|([0-9]+));?/gi, (match, hex, decimal) => {
      const codePoint = Number.parseInt(hex || decimal, hex ? 16 : 10);
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return match;
      }
    })
    .replace(/&colon;/gi, ':');
}

function hasOversizedImage(text) {
  const imageTags = text.match(/<img\b[^>]*>/gi) || [];
  return imageTags.some((tag) => {
    const sourceMatch = tag.match(/\bsrc\s*=\s*(?:(["'])(.*?)\1|([^\s>]+))/i);
    const source = decodeHtmlCharacterReferences(sourceMatch?.[2] || sourceMatch?.[3] || '');
    return source.toLowerCase().startsWith('data:image/') && decodedDataUriBytes(source) > MAX_IMAGE_BYTES;
  });
}

function databaseBytes() {
  return ['', '-wal', '-shm'].reduce((total, suffix) => {
    try {
      return total + fs.statSync(`${dbFilePath}${suffix}`).size;
    } catch (error) {
      if (error.code === 'ENOENT') return total;
      throw error;
    }
  }, 0);
}

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  });
  next();
});
app.use(express.json({ limit: MAX_ENTRY_BYTES }));
app.use(express.static(distPath, {
  setHeaders(response, filePath) {
    if (filePath.endsWith('.html')) response.setHeader('Cache-Control', 'no-cache');
    else if (filePath.includes(`${path.sep}assets${path.sep}`)) response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  },
}));

app.get('/healthz', (req, res) => res.json({ status: 'ok' }));

app.get('/api/messages', (req, res) => {
  db.all('SELECT * FROM messages ORDER BY id DESC', [], (error, rows) => {
    if (error) return res.status(500).json({ error: 'Unable to load entries' });
    return res.json(rows);
  });
});

app.post('/api/messages', (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text : '';
  const entryBytes = Buffer.byteLength(text, 'utf8');
  if (!text.trim()) return res.status(400).json({ error: 'Entry content is required' });
  if (entryBytes > MAX_ENTRY_BYTES) return res.status(413).json({ error: 'Entry is too large' });
  if (hasOversizedImage(text)) return res.status(413).json({ error: 'An embedded image is too large' });

  const queuedWrite = writeQueue.then(() => new Promise((resolve) => {
    let currentDatabaseBytes;
    try {
      currentDatabaseBytes = databaseBytes();
    } catch {
      res.status(500).json({ error: 'Unable to inspect storage' });
      resolve();
      return;
    }
    if (currentDatabaseBytes + entryBytes + SQLITE_WRITE_OVERHEAD_BYTES > MAX_DATABASE_BYTES) {
      res.status(413).json({ error: 'Clipboard storage limit reached' });
      resolve();
      return;
    }

    db.run('INSERT INTO messages (message) VALUES (?)', [text], function onInsert(error) {
      if (error) res.status(500).json({ error: 'Unable to save entry' });
      else res.status(201).json({ id: this.lastID, message: text, created_at: new Date().toISOString() });
      resolve();
    });
  }));
  writeQueue = queuedWrite.catch(() => {});
  return queuedWrite;
});

app.delete('/api/messages/:id', (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Invalid entry id' });
  db.run('DELETE FROM messages WHERE id = ?', [req.params.id], function onDelete(error) {
    if (error) return res.status(500).json({ error: 'Unable to delete entry' });
    if (!this.changes) return res.status(404).json({ error: 'Entry not found' });
    return res.status(204).send();
  });
});

app.use((error, req, res, next) => {
  if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'Entry is too large' });
  return next(error);
});

app.get('*path', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  return res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(port, () => console.log(`Clippy listening on port ${port}`));
