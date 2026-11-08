<template>
  <div class="chat-input">
    <div class="composer-editor">
      <div class="editor-toolbar" role="toolbar" aria-label="Text formatting">
        <button v-for="tool in tools" :key="tool.command" class="tool-button" type="button" :aria-label="tool.label" :title="tool.label" @click="applyFormat(tool)">
          <i :class="tool.icon" aria-hidden="true"></i>
        </button>
        <span class="toolbar-divider" aria-hidden="true"></span>
        <button class="tool-button" type="button" aria-label="Insert link" title="Insert link" @click="insertLink">
          <i class="bi bi-link-45deg" aria-hidden="true"></i>
        </button>
        <button class="tool-button" type="button" aria-label="Insert image" title="Insert image" @click="openImagePicker">
          <i class="bi bi-image" aria-hidden="true"></i>
        </button>
        <button class="tool-button" type="button" aria-label="Clear formatting" title="Clear formatting" @click="applyFormat({ command: 'removeFormat' })">
          <i class="bi bi-eraser" aria-hidden="true"></i>
        </button>
        <input ref="imageInput" class="visually-hidden" type="file" accept="image/*" tabindex="-1" aria-hidden="true" @change="insertImage">
      </div>
      <div
        ref="editor"
        class="rich-editor"
        contenteditable="true"
        role="textbox"
        aria-label="Rich text editor"
        aria-multiline="true"
        data-placeholder="Paste or type anything…"
        @input="syncContent"
        @keyup="saveSelection"
        @mouseup="saveSelection"
        @paste="handlePaste"
        @keydown.enter.ctrl.exact.prevent="sendMessage"
        @keydown.enter.meta.exact.prevent="sendMessage"
      ></div>
    </div>
    <div class="composer-actions">
      <span class="composer-hint"><i class="bi bi-image" aria-hidden="true"></i> Text, formatting &amp; images · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> to send</span>
      <span class="visually-hidden" role="status" aria-live="polite">{{ statusMessage }}</span>
      <button class="send-button" type="button" aria-keyshortcuts="Control+Enter Meta+Enter" title="Send entry (Ctrl+Enter)" :disabled="sending || !hasContent" @click="sendMessage">
        <i :class="sending ? 'bi bi-arrow-repeat spin' : 'bi bi-send-fill'" aria-hidden="true"></i>
        {{ sending ? 'Saving…' : 'Send entry' }}
      </button>
    </div>
  </div>
</template>

<script>
import DOMPurify from 'dompurify';
import { looksLikeCliOutput } from '../cliDetect.mjs';

export default {
  emits: ['sendMessage'],
  data() {
    return {
      message: '',
      sending: false,
      statusMessage: '',
      savedRange: null,
      tools: [
        { command: 'bold', label: 'Bold', icon: 'bi bi-type-bold' },
        { command: 'italic', label: 'Italic', icon: 'bi bi-type-italic' },
        { command: 'underline', label: 'Underline', icon: 'bi bi-type-underline' },
        { command: 'insertUnorderedList', label: 'Bulleted list', icon: 'bi bi-list-ul' },
        { command: 'insertOrderedList', label: 'Numbered list', icon: 'bi bi-list-ol' },
      ],
    };
  },
  computed: {
    hasContent() {
      const text = this.message.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, '').trim();
      return Boolean(text || /<img\b/i.test(this.message));
    },
  },
  methods: {
    syncContent() {
      this.message = this.$refs.editor.innerHTML;
      this.saveSelection();
    },
    saveSelection() {
      const selection = window.getSelection();
      if (!selection?.rangeCount) return;
      const range = selection.getRangeAt(0);
      if (this.$refs.editor.contains(range.commonAncestorContainer)) {
        this.savedRange = range.cloneRange();
      }
    },
    restoreSelection() {
      if (!this.savedRange) return;
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(this.savedRange);
    },
    applyFormat(tool) {
      this.$refs.editor.focus();
      this.restoreSelection();
      document.execCommand(tool.command, false, null);
      this.syncContent();
    },
    insertLink() {
      const url = window.prompt('Enter a secure link (https://)');
      if (!url || !/^https:\/\//i.test(url)) return;
      this.$refs.editor.focus();
      this.restoreSelection();
      document.execCommand('createLink', false, url);
      this.syncContent();
    },
    openImagePicker() {
      this.saveSelection();
      this.$refs.imageInput.click();
    },
    insertImage(event) {
      const [file] = event.target.files || [];
      if (!file || !file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = () => {
        this.$refs.editor.focus();
        this.restoreSelection();
        document.execCommand('insertImage', false, reader.result);
        this.syncContent();
        this.statusMessage = 'Image inserted';
      };
      reader.readAsDataURL(file);
      event.target.value = '';
    },
    handlePaste(event) {
      const image = Array.from(event.clipboardData?.items || []).find((item) => item.type.startsWith('image/'));
      if (!image) return;
      event.preventDefault();
      const file = image.getAsFile();
      if (!file) return;
      this.saveSelection();
      const reader = new FileReader();
      reader.onload = () => {
        this.$refs.editor.focus();
        this.restoreSelection();
        document.execCommand('insertImage', false, reader.result);
        this.syncContent();
        this.statusMessage = 'Image pasted';
      };
      reader.readAsDataURL(file);
    },
    async sendMessage() {
      if (!this.hasContent || this.sending) return;
      this.sending = true;
      this.statusMessage = 'Saving entry';
      try {
        const response = await fetch('api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: DOMPurify.sanitize(this.message, { ADD_DATA_URI_TAGS: ['img'] }),
            mono: !/<img\b/i.test(this.message) && looksLikeCliOutput(this.$refs.editor.innerText),
          }),
        });
        if (!response.ok) throw new Error(`Save failed (${response.status})`);
        const data = await response.json();
        this.$emit('sendMessage', data);
        this.message = '';
        this.$refs.editor.innerHTML = '';
        this.statusMessage = 'Entry saved';
      } catch (error) {
        console.error('Unable to save entry:', error);
        this.statusMessage = 'Unable to save entry';
      } finally {
        this.sending = false;
      }
    },
  },
};
</script>

<style>
.chat-input { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 16px; gap: 14px; }
.visually-hidden { position: absolute !important; width: 1px !important; height: 1px !important; padding: 0 !important; margin: -1px !important; overflow: hidden !important; clip: rect(0, 0, 0, 0) !important; white-space: nowrap !important; border: 0 !important; }
.composer-editor { flex: 1; min-height: 0; display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: 16px; overflow: hidden; background: var(--surface); box-shadow: inset 0 1px 0 var(--editor-highlight); }
.editor-toolbar { flex: 0 0 auto; display: flex; align-items: center; flex-wrap: wrap; gap: 4px; padding: 9px; border-bottom: 1px solid var(--border); background: var(--surface-soft); }
.tool-button { display: grid; place-items: center; width: 36px; height: 36px; padding: 0; border: 0; border-radius: 9px; color: var(--muted); background: transparent; cursor: pointer; transition: color .18s ease, background .18s ease, transform .18s ease; }
.tool-button:hover { color: var(--primary-dark); background: var(--primary-soft); transform: translateY(-1px); }
.toolbar-divider { width: 1px; height: 24px; margin: 0 4px; background: var(--border); }
.rich-editor { flex: 1; min-height: 160px; overflow-y: auto; padding: 18px; color: var(--text); font-size: 15px; line-height: 1.65; outline: none; }
.rich-editor:empty::before { content: attr(data-placeholder); color: var(--placeholder); pointer-events: none; }
.rich-editor:focus { box-shadow: inset 0 0 0 3px var(--focus-soft); }
.rich-editor img { display: block; max-width: 100%; height: auto; margin: 10px 0; border-radius: 12px; }
.composer-actions { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.composer-hint { color: var(--muted); font-size: 12px; }
.composer-hint i { margin-right: 6px; color: var(--secondary); }
.composer-hint kbd { padding: 1px 5px; border: 1px solid var(--border); border-bottom-width: 2px; border-radius: 5px; background: var(--surface-soft); color: var(--text); font: 600 11px/1.4 ui-monospace, monospace; }
.send-button { display: inline-flex; align-items: center; justify-content: center; gap: 9px; min-width: 136px; min-height: 44px; padding: 0 18px; border: 0; border-radius: 12px; color: #fff; background: linear-gradient(135deg, var(--primary), var(--secondary)); font-size: 14px; font-weight: 700; box-shadow: 0 10px 24px var(--shadow-primary); cursor: pointer; transition: transform .18s ease, box-shadow .18s ease, filter .18s ease; }
.send-button:hover:not(:disabled) { color: #fff; filter: saturate(1.1) brightness(.97); transform: translateY(-2px); box-shadow: 0 14px 28px var(--shadow-primary-hover); }
.send-button:disabled { color: var(--btn-disabled-text); background: var(--btn-disabled-bg); box-shadow: none; cursor: not-allowed; }
.spin { animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 480px) { .composer-hint { display: none; } .send-button { width: 100%; } }
</style>
