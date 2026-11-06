<template>
  <article class="entry-card">
    <div class="entry-actions">
      <button class="icon-button copy-button" type="button" aria-label="Copy entry" :title="copied ? 'Copied' : 'Copy entry'" @click="copyToClipboard">
        <i :class="copied ? 'bi bi-check-lg' : 'bi bi-copy'" aria-hidden="true"></i>
      </button>
      <button class="icon-button delete-button" type="button" aria-label="Delete entry" title="Delete entry" @click="deleteMessage">
        <i class="bi bi-trash3" aria-hidden="true"></i>
      </button>
    </div>
    <div ref="content" class="entry-content" v-html="safeMessage"></div>
    <time v-if="formattedDate" class="entry-time" :datetime="createdAt">{{ formattedDate }}</time>
    <span class="visually-hidden" role="status" aria-live="polite">{{ copied ? 'Entry copied to clipboard' : '' }}</span>
  </article>
</template>

<script>
import DOMPurify from 'dompurify';

export default {
  props: {
    message: { type: String, required: true },
    id: { type: Number, required: true },
    createdAt: { type: String, default: '' },
  },
  emits: ['deleteMessage'],
  data() { return { copied: false }; },
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
    formattedDate() {
      const date = new Date(this.createdAt);
      return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
    },
  },
  methods: {
    // innerText of the rendered entry keeps line breaks (<br>/<div>);
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
.entry-card { position: relative; min-height: calc(10px + 36px + 7px + 36px + 10px + 2px); padding: 17px 58px 14px 17px; border: 1px solid var(--border); border-radius: 15px; background: var(--surface); color: var(--text); text-align: left; box-shadow: 0 5px 14px rgba(18,78,66,.06); transition: background .2s ease, border-color .2s ease, transform .2s ease, box-shadow .2s ease; overflow-wrap: anywhere; }
.entry-card:hover { background: #fbfffd; border-color: #8bc9bb; transform: translateY(-2px); box-shadow: 0 10px 24px rgba(18,78,66,.1); }
.entry-content { min-height: 22px; font-size: 14px; line-height: 1.6; }
.entry-content > :last-child { margin-bottom: 0; }
.entry-content a { color: var(--primary-dark); text-decoration-thickness: 2px; text-underline-offset: 2px; }
.entry-content img { display: block; max-width: 100%; height: auto; margin: 8px 0; border-radius: 10px; }
.entry-content pre { max-width: 100%; overflow: auto; padding: 12px; border-radius: 9px; color: #effcf8; background: #12332e; }
.entry-actions { position: absolute; top: 10px; right: 10px; display: flex; flex-direction: column; gap: 7px; }
.icon-button { display: grid; place-items: center; width: 36px; height: 36px; padding: 0; border: 1px solid var(--border); border-radius: 10px; color: var(--primary-dark); background: var(--surface-soft); cursor: pointer; transition: color .18s ease, background .18s ease, transform .18s ease; }
.icon-button:hover { color: #fff; background: var(--primary); transform: scale(1.05); }
.copy-button:has(.bi-check-lg) { color: #fff; background: var(--primary); }
.delete-button { color: var(--danger); }
.delete-button:hover { color: #fff; background: var(--danger); }
.entry-time { display: block; margin-top: 11px; color: var(--muted); font-size: 11px; }
</style>
