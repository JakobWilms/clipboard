const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const { parseDuration, formatDuration, plainTextToHtml, htmlToPlainText } = require('./text');

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
const DEFAULT_RETENTION = '0'; // keep forever unless RETENTION_TIME is set
const RETENTION_SECONDS = resolveRetention(process.env.RETENTION_TIME);
const PURGE_INTERVAL_MS = positiveInteger(process.env.PURGE_INTERVAL_MS, 60 * 60 * 1000);
const RESTORE_WINDOW_SECONDS = positiveInteger(process.env.RESTORE_WINDOW_SECONDS, 8);
const DELETED_ENTRY_PURGE_SECONDS = 10 * 60; // keep deleted data briefly for cleanup, but restore only during the UI undo window
const ENTRY_COLUMNS = "id, message, mono, strftime('%Y-%m-%dT%H:%M:%SZ', created_at) AS created_at";

function resolveRetention(value) {
  if (value === undefined || String(value).trim() === '') return parseDuration(DEFAULT_RETENTION);
  const seconds = parseDuration(value);
  if (seconds !== null) return seconds;
  console.warn(`Invalid RETENTION_TIME "${value}" (use e.g. 10d, 36h, 90m, 0 to disable); using ${DEFAULT_RETENTION}`);
  return parseDuration(DEFAULT_RETENTION);
}

fs.mkdirSync(path.dirname(dbFilePath), { recursive: true });
if (!fs.existsSync(dbFilePath) && fs.existsSync(LEGACY_DATABASE_PATH)) {
  fs.copyFileSync(LEGACY_DATABASE_PATH, dbFilePath, fs.constants.COPYFILE_EXCL);
}

const db = new sqlite3.Database(dbFilePath);
let writeQueue = Promise.resolve();

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) { if (error) reject(error); else resolve(this); });
  });
}
function get(sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (error, row) => (error ? reject(error) : resolve(row))));
}
function all(sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (error, rows) => (error ? reject(error) : resolve(rows))));
}

async function initDatabase() {
  await run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  const columns = (await all('PRAGMA table_info(messages)')).map((column) => column.name);
  if (!columns.includes('mono')) await run('ALTER TABLE messages ADD COLUMN mono INTEGER NOT NULL DEFAULT 0');
  if (!columns.includes('deleted_at')) await run('ALTER TABLE messages ADD COLUMN deleted_at DATETIME');
}

function enqueueWrite(task) {
  const queued = writeQueue.then(task);
  writeQueue = queued.catch(() => {});
  return queued;
}

function toEntry(row) {
  return { id: row.id, message: row.message, mono: Boolean(row.mono), created_at: row.created_at };
}

function entryId(value) {
  return /^\d+$/.test(value) ? Number(value) : null;
}

// Validates, checks the storage cap inside the serialized write queue, inserts. Returns { status, entry } or { status, error }.
async function insertEntry(html, mono) {
  const entryBytes = Buffer.byteLength(html, 'utf8');
  if (!html.trim()) return { status: 400, error: 'Entry content is required' };
  if (entryBytes > MAX_ENTRY_BYTES) return { status: 413, error: 'Entry is too large' };
  if (hasOversizedImage(html)) return { status: 413, error: 'An embedded image is too large' };
  return enqueueWrite(async () => {
    let currentDatabaseBytes;
    try {
      currentDatabaseBytes = databaseBytes();
    } catch {
      return { status: 500, error: 'Unable to inspect storage' };
    }
    if (currentDatabaseBytes + entryBytes + SQLITE_WRITE_OVERHEAD_BYTES > MAX_DATABASE_BYTES) {
      return { status: 413, error: 'Clipboard storage limit reached' };
    }
    try {
      const result = await run('INSERT INTO messages (message, mono) VALUES (?, ?)', [html, mono ? 1 : 0]);
      return { status: 201, entry: toEntry(await get(`SELECT ${ENTRY_COLUMNS} FROM messages WHERE id = ?`, [result.lastID])) };
    } catch {
      return { status: 500, error: 'Unable to save entry' };
    }
  });
}

// Expired entries (RETENTION_TIME) and soft-deleted entries past the undo window are removed, then the file is compacted.
function purgeExpired() {
  return enqueueWrite(async () => {
    let removed = 0;
    if (RETENTION_SECONDS > 0) {
      removed += (await run("DELETE FROM messages WHERE created_at < datetime('now', ?)", [`-${RETENTION_SECONDS} seconds`])).changes;
    }
    removed += (await run("DELETE FROM messages WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', ?)", [`-${DELETED_ENTRY_PURGE_SECONDS} seconds`])).changes;
    if (removed) {
      await run('VACUUM');
      console.log(`Purged ${removed} expired or deleted entr${removed === 1 ? 'y' : 'ies'}`);
    }
  }).catch((error) => console.error('Purge failed:', error));
}

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
// Plain-text push for terminals:  some-command | curl -sk -T - https://<host>/clipboard/api/text
// Registered before the JSON parser so any Content-Type is taken as raw text.
const textBody = express.text({ type: () => true, limit: MAX_ENTRY_BYTES });
async function pushText(req, res) {
  const text = typeof req.body === 'string' ? req.body : '';
  if (!text.trim()) return res.status(400).type('text/plain').send('Entry content is required\n');
  const result = await insertEntry(plainTextToHtml(text), true);
  if (result.error) return res.status(result.status).type('text/plain').send(`${result.error}\n`);
  return res.status(201).type('text/plain').send(`#${result.entry.id}\n`);
}
app.put('/api/text', textBody, pushText);

app.use(express.json({ limit: MAX_ENTRY_BYTES }));
app.use(express.static(distPath, {
  setHeaders(response, filePath) {
    if (filePath.endsWith('.html')) response.setHeader('Cache-Control', 'no-cache');
    else if (filePath.includes(`${path.sep}assets${path.sep}`)) response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  },
}));

app.get('/healthz', (req, res) => res.json({ status: 'ok' }));

app.get('/api/config', (req, res) => res.json({ retentionSeconds: RETENTION_SECONDS, retention: formatDuration(RETENTION_SECONDS) }));

app.get('/api/messages', async (req, res) => {
  try {
    const rows = await all(`SELECT ${ENTRY_COLUMNS} FROM messages WHERE deleted_at IS NULL ORDER BY id DESC`);
    return res.json(rows.map(toEntry));
  } catch {
    return res.status(500).json({ error: 'Unable to load entries' });
  }
});

app.post('/api/messages', async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text : '';
  const result = await insertEntry(text, req.body?.mono === true);
  if (result.error) return res.status(result.status).json({ error: result.error });
  return res.status(result.status).json(result.entry);
});

// Plain-text pull:  curl -sk https://<host>/clipboard/api/latest.txt   or   .../api/messages/<id>.txt
async function sendEntryText(res, sql, params) {
  try {
    const row = await get(sql, params);
    res.set('Cache-Control', 'no-store');
    if (!row) return res.status(404).type('text/plain').send('Entry not found\n');
    return res.type('text/plain').send(`${htmlToPlainText(row.message)}\n`);
  } catch {
    return res.status(500).type('text/plain').send('Unable to load entry\n');
  }
}
app.get('/api/latest.txt', (req, res) => sendEntryText(res, 'SELECT message FROM messages WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 1', []));
app.get('/api/messages/:file', (req, res, next) => {
  const match = /^(\d+)\.txt$/.exec(req.params.file);
  if (!match) return next();
  return sendEntryText(res, 'SELECT message FROM messages WHERE id = ? AND deleted_at IS NULL', [Number(match[1])]);
});

app.patch('/api/messages/:id', async (req, res) => {
  const id = entryId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid entry id' });
  if (typeof req.body?.mono !== 'boolean') return res.status(400).json({ error: 'Expected { "mono": true|false }' });
  try {
    const result = await run('UPDATE messages SET mono = ? WHERE id = ? AND deleted_at IS NULL', [req.body.mono ? 1 : 0, id]);
    if (!result.changes) return res.status(404).json({ error: 'Entry not found' });
    return res.json(toEntry(await get(`SELECT ${ENTRY_COLUMNS} FROM messages WHERE id = ?`, [id])));
  } catch {
    return res.status(500).json({ error: 'Unable to update entry' });
  }
});

// Soft delete: the entry disappears immediately but can be restored during the undo window.
app.delete('/api/messages/:id', async (req, res) => {
  const id = entryId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid entry id' });
  try {
    const result = await run("UPDATE messages SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND deleted_at IS NULL", [id]);
    if (!result.changes) return res.status(404).json({ error: 'Entry not found' });
    return res.status(204).send();
  } catch {
    return res.status(500).json({ error: 'Unable to delete entry' });
  }
});

app.put('/api/messages/:id/restore', async (req, res) => {
  const id = entryId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid entry id' });
  try {
    const result = await run(
      "UPDATE messages SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL AND julianday(deleted_at) > julianday('now', ?)",
      [id, `-${RESTORE_WINDOW_SECONDS} seconds`],
    );
    if (!result.changes) return res.status(404).json({ error: 'Entry not found' });
    return res.json(toEntry(await get(`SELECT ${ENTRY_COLUMNS} FROM messages WHERE id = ?`, [id])));
  } catch {
    return res.status(500).json({ error: 'Unable to restore entry' });
  }
});

app.use((error, req, res, next) => {
  if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'Entry is too large' });
  return next(error);
});

app.get('*path', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  return res.sendFile(path.join(distPath, 'index.html'));
});

initDatabase()
  .then(async () => {
    await purgeExpired();
    setInterval(purgeExpired, PURGE_INTERVAL_MS).unref();
    app.listen(port, () => console.log(`Clippy listening on port ${port} (retention ${formatDuration(RETENTION_SECONDS)})`));
  })
  .catch((error) => {
    console.error('Unable to initialise the database:', error);
    process.exit(1);
  });
