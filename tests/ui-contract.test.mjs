import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8');
const input = readFileSync(new URL('../src/components/ChatInput.vue', import.meta.url), 'utf8');
const message = readFileSync(new URL('../src/components/ChatMessage.vue', import.meta.url), 'utf8');
const guide = readFileSync(new URL('../src/components/UserGuide.vue', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const server = readFileSync(new URL('../src/backend/server.js', import.meta.url), 'utf8');
const vite = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8');
const sqlite = readFileSync(new URL('../src/backend/initSQLite.js', import.meta.url), 'utf8');

test('desktop workspace exposes saved entries beside a collapsible composer', () => {
  assert.match(app, /class="workspace"/);
  assert.match(app, /class="entries-panel"/);
  assert.match(app, /class="composer-panel/);
  assert.match(app, /aria-expanded/);
  assert.match(app, /toggleComposer/);
});

test('version is sourced from package metadata and shown as a badge', () => {
  assert.match(app, /APP_VERSION/);
  assert.match(app, /version-badge/);
  assert.equal(pkg.version, '1.4.0');
});

test('composer is a full-height flex column with a bottom action', () => {
  assert.match(input, /class="composer-editor"/);
  assert.match(input, /class="send-button/);
  assert.match(input, /Send entry/);
});

test('entry actions are accessible icon-only buttons', () => {
  assert.match(message, /aria-label="Copy entry"/);
  assert.match(message, /aria-label="Delete entry"/);
  assert.doesNotMatch(message, />\s*Text Copy\s*</);
  assert.doesNotMatch(message, />\s*Delete\s*</);
});

test('backend uses a configurable durable database path', () => {
  assert.match(server, /process\.env\.DATABASE_PATH/);
  assert.match(sqlite, /process\.env\.DATABASE_PATH/);
  assert.match(server, /\/data\/database\.sqlite/);
  assert.match(server, /LEGACY_DATABASE_PATH/);
  assert.match(server, /copyFileSync/);
});

test('backend enforces bounded image, entry, and database storage', () => {
  assert.match(server, /MAX_IMAGE_BYTES/);
  assert.match(server, /MAX_ENTRY_BYTES/);
  assert.match(server, /MAX_DATABASE_BYTES/);
  assert.match(server, /413/);
});

test('backend sets safe cache policy for HTML and hashed assets', () => {
  assert.match(server, /Cache-Control/);
  assert.match(server, /no-cache/);
  assert.match(server, /immutable/);
});

test('copy writes both rich HTML and plain text to the clipboard', () => {
  assert.match(message, /ClipboardItem/);
  assert.match(message, /text\/html/);
  assert.match(message, /text\/plain/);
  assert.match(message, /navigator\.clipboard\.write/);
});

test('vulnerable Quill packages and runtime are removed', () => {
  assert.equal(pkg.dependencies.quill, undefined);
  assert.equal(pkg.dependencies['vue3-quill'], undefined);
  assert.doesNotMatch(input, /quill-editor|vue3-quill/i);
});

test('native rich editor has an accessible toolbar and live status', () => {
  assert.match(input, /role="toolbar"/);
  assert.match(input, /contenteditable="true"/);
  assert.match(input, /aria-label="Rich text editor"/);
  assert.match(input, /aria-live="polite"/);
  assert.match(input, /@click="applyFormat\(tool\)"/);
  assert.doesNotMatch(input, /@mousedown\.prevent="applyFormat/);
});

test('theme declares color schemes, toggle function, and reduced-motion support', () => {
  assert.match(app, /color-scheme:\s*light/);
  assert.match(app, /color-scheme:\s*dark/);
  assert.match(app, /toggleTheme/);
  assert.match(app, /prefers-reduced-motion:\s*reduce/);
  assert.match(app, /skip-link/);
});

test('entry card is tall enough to contain its stacked action buttons', () => {
  assert.match(message, /\.entry-card \{[^}]*min-height:/);
});

test('saved entries panel has an accessible 3 s auto-refresh toggle', () => {
  assert.match(app, /class="refresh-toggle"/);
  assert.match(app, /:aria-pressed="autoRefresh"/);
  assert.match(app, /AUTO_REFRESH_MS = 3000/);
  assert.match(app, /clearInterval/);
});

test('entries are sorted by pin status and newest first', () => {
  assert.match(server, /ORDER BY is_pinned DESC, id DESC/);
  assert.match(app, /this\.messages\.push\(message\)/);
  assert.match(app, /this\.sortMessages/);
});

test('entry timestamps are returned as explicit UTC ISO strings', () => {
  assert.match(server, /strftime\('%Y-%m-%dT%H:%M:%SZ', created_at\) AS created_at/);
});

test('Ctrl+Enter (Cmd+Enter on macOS) in the editor sends the entry', () => {
  assert.match(input, /@keydown\.enter\.ctrl\.exact\.prevent="sendMessage"/);
  assert.match(input, /@keydown\.enter\.meta\.exact\.prevent="sendMessage"/);
  assert.match(input, /aria-keyshortcuts=/);
});

test('frontend uses relative URLs so it works under a reverse-proxy path prefix', () => {
  assert.match(vite, /base:\s*'\.\/'/);
  for (const source of [app, input]) assert.doesNotMatch(source, /fetch\(\s*['`]\/api/);
});

test('entries show #id with a curl pull command, a mono toggle and a collapse control', () => {
  assert.match(message, /class="entry-id"/);
  assert.match(message, /api\/messages\/\$\{this\.id\}\.txt/);
  assert.match(message, /class="mono-toggle"[^>]*:aria-pressed="mono"/);
  assert.match(message, /class="expand-toggle"[^>]*:aria-expanded="expanded"/);
  assert.match(message, /max-height: 20lh/);
  assert.match(message, /\$refs\.content\?\.innerText/);
});

test('deletes can be undone and new CLI-looking entries are sent as monospace', () => {
  assert.match(app, /class="undo-toast"/);
  assert.match(app, /\/restore`/);
  assert.match(input, /looksLikeCliOutput\(this\.\$refs\.editor\.innerText\)/);
});

test('CLI detection recognises prompts, shell and config but not prose', async () => {
  const { looksLikeCliOutput } = await import('../src/cliDetect.mjs');
  assert.equal(looksLikeCliOutput('A:admin@pe1# show router interface\n===\nInterface Table\n==='), true);
  assert.equal(looksLikeCliOutput('[ex:/configure router "Base"]\n    interface "system" {\n    }'), true);
  assert.equal(looksLikeCliOutput('root@OpenWrt:~# uci show network'), true);
  assert.equal(looksLikeCliOutput('while true; do\n  echo "x" | grep x\ndone'), true);
  assert.equal(looksLikeCliOutput('Hello team,\nplease find the notes below.\nThanks'), false);
  assert.equal(looksLikeCliOutput('good job'), false);
});

test('header Guide button opens a modal user guide with copyable curl commands', () => {
  assert.match(app, /class="guide-button"[^>]*aria-haspopup="dialog"/);
  assert.match(app, /<UserGuide ref="guide"/);
  assert.match(guide, /<dialog/);
  assert.match(guide, /showModal\(\)/);
  assert.match(guide, /aria-label="Close guide"/);
  assert.match(guide, /new URL\('api\/', document\.baseURI\)/);
  assert.match(guide, /latest\.txt/);
});

test('page has the Clippy tab title and favicon', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<title>Clippy<\/title>/);
  assert.match(html, /rel="icon" type="image\/svg\+xml" href="\.\/src\/icons\/favicon\.svg"/);
  assert.match(html, /rel="apple-touch-icon"/);
});
