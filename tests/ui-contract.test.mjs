import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8');
const input = readFileSync(new URL('../src/components/ChatInput.vue', import.meta.url), 'utf8');
const message = readFileSync(new URL('../src/components/ChatMessage.vue', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const server = readFileSync(new URL('../src/backend/server.js', import.meta.url), 'utf8');
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
  assert.equal(pkg.version, '1.2.0');
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

test('theme declares a light color scheme and reduced-motion support', () => {
  assert.match(app, /color-scheme:\s*light/);
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

test('newest entries are listed first', () => {
  assert.match(server, /ORDER BY id DESC/);
  assert.match(app, /this\.messages\.unshift\(message\)/);
  assert.doesNotMatch(app, /this\.messages\.push\(message\)/);
});
