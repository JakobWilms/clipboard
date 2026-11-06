import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { createRequire } from 'node:module';

const requireCjs = createRequire(import.meta.url);
const textHelpers = requireCjs('../src/backend/text.js');

const projectRoot = path.resolve(import.meta.dirname, '..');

async function startServer(extraEnv = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'clippy-backend-'));
  const dist = path.join(root, 'dist');
  mkdirSync(dist);
  const port = 4300 + Math.floor(Math.random() * 500);
  const child = spawn(process.execPath, ['src/backend/server.js'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: path.join(root, 'database.sqlite'),
      DIST_PATH: dist,
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const baseURL = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${baseURL}/healthz`);
      if (response.ok) return { baseURL, child, root };
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  child.kill();
  throw new Error(`Backend did not start: ${stderr}`);
}

async function stopServer(server) {
  server.child.kill('SIGTERM');
  await new Promise((resolve) => server.child.once('exit', resolve));
  rmSync(server.root, { recursive: true, force: true });
}

async function post(baseURL, text) {
  return fetch(`${baseURL}/api/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
}

test('rejects oversized quoted and unquoted embedded images', async () => {
  const server = await startServer({ MAX_IMAGE_BYTES: '10' });
  try {
    const payload = 'data:image/png;base64,AAAAAAAAAAAAAAAAAAAA';
    assert.equal((await post(server.baseURL, `<img src="${payload}">`)).status, 413);
    assert.equal((await post(server.baseURL, `<img src=${payload}>`)).status, 413);
    assert.equal((await post(server.baseURL, '<img src="data&#58;image/png;base64,AAAAAAAAAAAAAAAAAAAA">')).status, 413);
    assert.equal((await post(server.baseURL, '<img src="data&colon;image/png;base64,AAAAAAAAAAAAAAAAAAAA">')).status, 413);
  } finally {
    await stopServer(server);
  }
});

test('serializes concurrent writes so the database capacity is not overrun', async () => {
  const server = await startServer({
    MAX_ENTRY_BYTES: '30000',
    MAX_DATABASE_BYTES: '110000',
  });
  try {
    const payload = `<p>${'x'.repeat(22000)}</p>`;
    const statuses = await Promise.all([
      post(server.baseURL, payload),
      post(server.baseURL, payload),
    ]).then((responses) => responses.map((response) => response.status).sort());
    assert.deepEqual(statuses, [201, 413]);
  } finally {
    await stopServer(server);
  }
});

test('RETENTION_TIME accepts units, bare days and 0', () => {
  const { parseDuration, formatDuration } = textHelpers;
  assert.equal(parseDuration('10d'), 864000);
  assert.equal(parseDuration('36h'), 129600);
  assert.equal(parseDuration('90m'), 5400);
  assert.equal(parseDuration('2w'), 1209600);
  assert.equal(parseDuration('10'), 864000);
  assert.equal(parseDuration('0'), 0);
  assert.equal(parseDuration('ten days'), null);
  assert.equal(formatDuration(864000), '10d');
  assert.equal(formatDuration(0), 'off');
});

test('HTML from the rich editor converts to plain text with line breaks', () => {
  const { htmlToPlainText } = textHelpers;
  assert.equal(htmlToPlainText('first<div>second</div><div><br></div><div>x&nbsp;&amp;&lt;y&gt;</div>'), 'first\nsecond\n\nx &<y>');
  assert.equal(htmlToPlainText('<b>bold</b> <img src="data:x">'), 'bold [image]');
});

test('plain-text push and .txt pull round-trip CLI output as monospace', async () => {
  const server = await startServer();
  try {
    const body = 'A:admin@pe1# show router interface\n  system      10.0.0.1/32   Up\n  to-pe2 <&> 192.0.2.1/31  Up\n';
    const pushed = await fetch(`${server.baseURL}/api/text`, { method: 'PUT', body });
    assert.equal(pushed.status, 201);
    const id = (await pushed.text()).trim();
    assert.match(id, /^#\d+$/);
    assert.equal(await (await fetch(`${server.baseURL}/api/latest.txt`)).text(), body);
    assert.equal(await (await fetch(`${server.baseURL}/api/messages/${id.slice(1)}.txt`)).text(), body);
    const [entry] = await (await fetch(`${server.baseURL}/api/messages`)).json();
    assert.equal(entry.mono, true);
    assert.equal((await fetch(`${server.baseURL}/api/messages/999.txt`)).status, 404);
  } finally {
    await stopServer(server);
  }
});

test('delete is soft and can be restored; mono can be toggled', async () => {
  const server = await startServer();
  try {
    const created = await (await post(server.baseURL, '<p>keep me</p>')).json();
    assert.equal(created.mono, false);
    const patched = await fetch(`${server.baseURL}/api/messages/${created.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mono: true }),
    });
    assert.equal((await patched.json()).mono, true);
    assert.equal((await fetch(`${server.baseURL}/api/messages/${created.id}`, { method: 'DELETE' })).status, 204);
    assert.deepEqual(await (await fetch(`${server.baseURL}/api/messages`)).json(), []);
    assert.equal((await fetch(`${server.baseURL}/api/latest.txt`)).status, 404);
    const restored = await fetch(`${server.baseURL}/api/messages/${created.id}/restore`, { method: 'POST' });
    assert.equal(restored.status, 200);
    assert.equal((await restored.json()).id, created.id);
    assert.equal((await (await fetch(`${server.baseURL}/api/messages`)).json()).length, 1);
    assert.equal((await fetch(`${server.baseURL}/api/messages/${created.id}/restore`, { method: 'POST' })).status, 404);
  } finally {
    await stopServer(server);
  }
});

test('entries older than RETENTION_TIME are purged', async () => {
  const server = await startServer({ RETENTION_TIME: '1s', PURGE_INTERVAL_MS: '300' });
  try {
    assert.equal((await (await fetch(`${server.baseURL}/api/config`)).json()).retention, '1s');
    assert.equal((await post(server.baseURL, '<p>short-lived</p>')).status, 201);
    await new Promise((resolve) => setTimeout(resolve, 2600));
    assert.deepEqual(await (await fetch(`${server.baseURL}/api/messages`)).json(), []);
  } finally {
    await stopServer(server);
  }
});
