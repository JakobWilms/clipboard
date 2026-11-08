<template>
  <article class="entry-card" :class="{ 'is-mono': mono }">
    <header class="entry-meta">
      <button class="entry-id" type="button" :title="`Copy pull command: ${curlCommand}`" :aria-label="`Entry ${id}: copy curl pull command`" @click="copyCurl">#{{ id }}</button>
      <time v-if="formattedDate" class="entry-time" :datetime="createdAt">{{ formattedDate }}</time>
      <button class="mono-toggle" type="button" :aria-pressed="mono" :title="mono ? 'Monospace on: click for normal text' : 'Show as monospace (CLI output)'" @click="$emit('toggleMono', id, !mono)">
        <i class="bi bi-terminal" aria-hidden="true"></i> Mono
      </button>
      <span v-if="curlCopied" class="meta-flash" aria-hidden="true">curl command copied</span>
    </header>
    <div class="entry-actions">
      <button class="icon-button pin-button" type="button" :aria-label="isPinned ? 'Unpin' : 'Pin'" :title="isPinned ? 'Unpin entry' : 'Pin entry'" @click="$emit('togglePin', id, !isPinned)">
        <i :class="isPinned ? 'bi bi-pin-angle-fill' : 'bi bi-pin-angle'" aria-hidden="true"></i>
      </button>
      <button class="icon-button copy-button" type="button" aria-label="Copy entry" :title="copied ? 'Copied' : 'Copy entry'" @click="copyToClipboard">
        <i :class="copied ? 'bi bi-check-lg' : 'bi bi-copy'" aria-hidden="true"></i>
      </button>
      <button class="icon-button delete-button" type="button" aria-label="Delete entry" title="Delete entry" @click="deleteMessage">
        <i class="bi bi-trash3" aria-hidden="true"></i>
      </button>
    </div>
    <div ref="content" class="entry-content" :class="{ 'is-clamped': !expanded, 'has-more': overflowing && !expanded }" v-html="safeMessage"></div>
    <button v-if="overflowing" class="expand-toggle" type="button" :aria-expanded="expanded" @click="expanded = !expanded">
      <i :class="expanded ? 'bi bi-chevron-up' : 'bi bi-chevron-down'" aria-hidden="true"></i>
      {{ expanded ? 'Show less' : 'Show more' }}
    </button>
    <span class="visually-hidden" role="status" aria-live="polite">{{ copied ? 'Entry copied to clipboard' : curlCopied ? 'curl command copied' : '' }}</span>
  </article>
</template>

<script>
import DOMPurify from 'dompurify';

export default {
  props: {
    message: { type: String, required: true },
    id: { type: Number, required: true },
    createdAt: { type: String, default: '' },
    mono: { type: Boolean, default: false },
    isPinned: { type: Boolean, default: false },
  },
  emits: ['deleteMessage', 'toggleMono', 'togglePin'],
  data() { return { copied: false, curlCopied: false, expanded: false, overflowing: false }; },
  computed: {
    safeMessage() {
      const sanitized = DOMPurify.sanitize(this.message, { ADD_DATA_URI_TAGS: ['img'] });
      const fragment = new DOMParser().parseFromString(sanitized, 'text/html');
      fragment.querySelectorAll('img:not([alt])').forEach((image) => image.setAttribute('alt', ''));
      return fragment.body.innerHTML;
    },
    plainText() {
      const fragment = new DOMParser().parseFromString(this.safeMessage, 'text/html');
      return fragment.body.innerText || fragment.body.textContent || '';
    },
    curlCommand() {
      return `curl -sk ${new URL(`api/messages/${this.id}.txt`, document.baseURI).href}`;
    },
    formattedDate() {
      const date = new Date(this.createdAt);
      return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
    },
  },
  watch: {
    safeMessage() { this.$nextTick(this.measure); },
    mono() { this.$nextTick(this.measure); },
  },
  mounted() {
    this.measure();
    if (window.ResizeObserver) {
      this.resizeObserver = new ResizeObserver(() => this.measure());
      this.resizeObserver.observe(this.$refs.content);
    }
  },
  beforeUnmount() {
    this.resizeObserver?.disconnect();
  },
  methods: {
    // Overflow can only be measured while clamped; once expanded keep the toggle visible.
    measure() {
      const content = this.$refs.content;
      if (!content || this.expanded) return;
      this.overflowing = content.scrollHeight > content.clientHeight + 2;
    },
    async copyCurl() {
      try {
        if (navigator.clipboard?.writeText && window.isSecureContext) {
          await navigator.clipboard.writeText(this.curlCommand);
        } else {
          const area = document.createElement('textarea');
          area.value = this.curlCommand;
          area.setAttribute('readonly', '');
          area.style.position = 'fixed';
          area.style.opacity = '0';
          document.body.appendChild(area);
          area.select();
          document.execCommand('copy');
          area.remove();
        }
        this.curlCopied = true;
        window.setTimeout(() => { this.curlCopied = false; }, 1600);
      } catch (error) { console.error('Unable to copy curl command:', error); }
    },
    // innerText of the rendered entry keeps line breaks (<br>/<div>) and, in mono mode, spacing;
    // an unrendered DOMParser document would flatten everything onto one line.
    renderedText() {
      return this.$refs.content?.innerText || this.plainText;
    },
    deleteMessage() { this.$emit('deleteMessage', this.id); },
    async copyToClipboard() {
      try {
        if (navigator.clipboard?.write && window.ClipboardItem) {
          await navigator.clipboard.write([new ClipboardItem({
            'text/html': new Blob([this.safeMessage], { type: 'text/html' }),
            'text/plain': new Blob([this.renderedText()], { type: 'text/plain' }),
          })]);
        } else {
          const range = document.createRange();
          range.selectNodeContents(this.$el.querySelector('.entry-content'));
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
          document.execCommand('copy');
          selection.removeAllRanges();
        }
        this.copied = true;
        window.setTimeout(() => { this.copied = false; }, 1600);
      } catch (error) { console.error('Unable to copy entry:', error); }
    },
  },
};
</script>

<style>
.entry-card { position: relative; min-height: 68px; padding: 17px 135px 14px 17px; border: 1px solid var(--border); border-radius: 15px; background: var(--surface); color: var(--text); text-align: left; box-shadow: 0 5px 14px var(--shadow-soft); transition: background .2s ease, border-color .2s ease, transform .2s ease, box-shadow .2s ease; overflow-wrap: anywhere; }
.entry-card:hover { background: var(--surface-hover); border-color: var(--border-highlight); transform: translateY(-2px); box-shadow: 0 10px 24px var(--shadow-medium); }
.entry-content { min-height: 22px; font-size: 14px; line-height: 1.6; }
.entry-content > :last-child { margin-bottom: 0; }
.entry-content a { color: var(--primary-dark); text-decoration-thickness: 2px; text-underline-offset: 2px; }
.entry-content img { display: block; max-width: 100%; height: auto; margin: 8px 0; border-radius: 10px; }
.entry-content pre { max-width: 100%; overflow: auto; padding: 12px; border-radius: 9px; color: var(--pre-text); background: var(--pre-bg); }
.entry-actions { position: absolute; top: 10px; right: 10px; display: flex; flex-direction: row; gap: 7px; }
.icon-button { display: grid; place-items: center; width: 36px; height: 36px; padding: 0; border: 1px solid var(--border); border-radius: 10px; color: var(--primary-dark); background: var(--surface-soft); cursor: pointer; transition: color .18s ease, background .18s ease, transform .18s ease; }
.icon-button:hover { color: #fff; background: var(--primary); transform: scale(1.05); }
.copy-button:has(.bi-check-lg) { color: #fff; background: var(--primary); }
.delete-button { color: var(--danger); }
.delete-button:hover { color: #fff; background: var(--danger); }
.entry-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; min-height: 22px; margin: -5px 0 9px; color: var(--muted); font-size: 11px; }
.entry-id { padding: 1px 8px; border: 1px solid #9bd8cb; border-radius: 999px; color: var(--primary-dark); background: var(--primary-soft); font: 800 11px/1.5 ui-monospace, monospace; cursor: pointer; transition: color .18s ease, background .18s ease; }
.entry-id:hover { color: #fff; background: var(--primary); }
.entry-time { color: var(--muted); font-size: 11px; }
.mono-toggle { display: inline-flex; align-items: center; gap: 4px; padding: 1px 8px; border: 1px solid var(--border); border-radius: 999px; color: var(--muted); background: transparent; font-size: 11px; font-weight: 700; line-height: 1.5; cursor: pointer; transition: color .18s ease, background .18s ease, border-color .18s ease; }
.mono-toggle:hover { color: var(--primary-dark); border-color: #83c5b6; }
.mono-toggle[aria-pressed="true"] { color: #fff; border-color: #12332e; background: #12332e; }
.meta-flash { color: var(--primary-dark); font-weight: 700; }
.entry-content.is-clamped { max-height: 32em; max-height: 20lh; overflow: hidden; }
.entry-content.has-more { -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 3em), transparent); mask-image: linear-gradient(to bottom, #000 calc(100% - 3em), transparent); }
.entry-card.is-mono .entry-content { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; font-size: 13px; line-height: 1.5; white-space: pre-wrap; tab-size: 4; }
.expand-toggle { display: inline-flex; align-items: center; gap: 5px; margin-top: 8px; padding: 3px 10px; border: 1px solid var(--border); border-radius: 999px; color: var(--primary-dark); background: var(--surface-soft); font-size: 12px; font-weight: 700; cursor: pointer; }
.expand-toggle:hover { color: #fff; background: var(--primary); border-color: var(--primary); }
.pin-button:has(.bi-pin-angle-fill) { color: #fff; background: var(--primary); }
</style>
