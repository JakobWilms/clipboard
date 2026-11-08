// Pure helpers shared by the backend: durations and HTML <-> plain-text conversion.

const DURATION_UNITS = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };

// "10d", "36h", "90m", "45s", "2w"; a bare number means days; "0" disables. Returns seconds or null.
function parseDuration(value) {
  const match = String(value ?? '').trim().match(/^(\d+(?:\.\d+)?)\s*([smhdw]?)$/i);
  if (!match) return null;
  return Math.round(Number(match[1]) * DURATION_UNITS[(match[2] || 'd').toLowerCase()]);
}

function formatDuration(seconds) {
  if (!seconds) return 'off';
  for (const [unit, size] of [['w', 604800], ['d', 86400], ['h', 3600], ['m', 60]]) {
    if (seconds % size === 0) return `${seconds / size}${unit}`;
  }
  return `${seconds}s`;
}

function escapeHtml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Terminal output -> stored HTML: escaped, one <br> per line break (spaces kept; shown with white-space: pre-wrap).
function plainTextToHtml(text) {
  return text.replace(/\r\n?/g, '\n').replace(/\s+$/, '').split('\n').map(escapeHtml).join('<br>');
}

const NAMED_ENTITIES = { nbsp: ' ', lt: '<', gt: '>', quot: '"', apos: "'", colon: ':', amp: '&' };

function decodeEntities(value) {
  return value.replace(/&(?:#x([0-9a-f]+)|#(\d+)|([a-z]+));/gi, (match, hex, decimal, name) => {
    if (name) return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, name.toLowerCase()) ? NAMED_ENTITIES[name.toLowerCase()] : match;
    try {
      return String.fromCodePoint(Number.parseInt(hex || decimal, hex ? 16 : 10));
    } catch {
      return match;
    }
  });
}

const BLOCK = '(?:div|p|li|h[1-6]|pre|tr|blockquote|ul|ol|table)';

// Stored HTML (rich editor or plainTextToHtml) -> plain text for the .txt endpoints.
function htmlToPlainText(html) {
  const text = html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<img\b[^>]*>/gi, '[image]')
    .replace(new RegExp(`<br\\s*/?>\\s*(?=</${BLOCK}>)`, 'gi'), '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(new RegExp(`<${BLOCK}\\b[^>]*>`, 'gi'), '\n')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(text)
    .replace(/ /g, ' ')
    .replace(/^\n+/, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+$/, '');
}

module.exports = { parseDuration, formatDuration, escapeHtml, plainTextToHtml, htmlToPlainText, decodeEntities };
