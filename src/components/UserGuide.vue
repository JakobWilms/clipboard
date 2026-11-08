<template>
  <dialog ref="dialog" class="guide-dialog" aria-labelledby="guide-title" @click="closeOnBackdrop">
    <div class="guide-panel">
      <header class="guide-header">
        <div>
          <span class="eyebrow">Help</span>
          <h2 id="guide-title">User guide</h2>
        </div>
        <button class="guide-close" type="button" aria-label="Close guide" @click="close"><i class="bi bi-x-lg" aria-hidden="true"></i></button>
      </header>

      <div class="guide-body">
        <section>
          <h3><i class="bi bi-pencil-square" aria-hidden="true"></i> Save an entry</h3>
          <ul>
            <li>Paste or type in <strong>Compose</strong>, then click <strong>Send entry</strong> or press <kbd>Ctrl</kbd>+<kbd>Enter</kbd> (<kbd>⌘</kbd>+<kbd>Enter</kbd> on macOS).</li>
            <li>Formatting and pasted images are kept (images up to 5 MB).</li>
            <li>Text that looks like CLI output (prompts, configs, shell, aligned columns) is saved in <strong>monospace</strong> automatically.</li>
          </ul>
        </section>

        <section>
          <h3><i class="bi bi-collection" aria-hidden="true"></i> Saved entries</h3>
          <ul>
            <li>Newest entries are on top. <strong>Auto-refresh</strong> reloads the list every 3 s so entries from other machines appear; your browser remembers the setting.</li>
            <li>Entries longer than about 20 lines are collapsed: use <strong>Show more</strong> / <strong>Show less</strong>.</li>
            <li v-if="retention && retention !== 'off'">Entries are deleted automatically after <strong>{{ retention }}</strong>.</li>
            <li v-else-if="retention === 'off'">Entries are kept until you delete them.</li>
          </ul>
        </section>

        <section>
          <h3><i class="bi bi-card-text" aria-hidden="true"></i> On each entry</h3>
          <dl class="guide-controls">
            <dt><span class="chip chip-id">#12</span></dt><dd>Entry number. Click it to copy the <code>curl</code> command that prints this entry in a terminal.</dd>
            <dt><span class="chip"><i class="bi bi-terminal" aria-hidden="true"></i> Mono</span></dt><dd>Switch between monospace (CLI output) and normal text. Shared with everyone.</dd>
            <dt><span class="chip chip-icon"><i class="bi bi-pin-angle" aria-hidden="true"></i></span></dt><dd>Pin the entry: Keeps this entry at the top of the list.</dd>
            <dt><span class="chip chip-icon"><i class="bi bi-copy" aria-hidden="true"></i></span></dt><dd>Copy the entry: formatted for documents and mail, plain text with line breaks for terminals.</dd>
            <dt><span class="chip chip-icon chip-danger"><i class="bi bi-trash3" aria-hidden="true"></i></span></dt><dd>Delete. Click <strong>Undo</strong> in the message at the bottom within 8 s to bring it back.</dd>
          </dl>
        </section>

        <section>
          <h3><i class="bi bi-terminal" aria-hidden="true"></i> From a terminal</h3>
          <p class="guide-note">Works from any Linux box, router shell or CPE with <code>curl</code>. <code>-k</code> accepts the lab certificate.</p>
          <div v-for="command in commands" :key="command.label" class="guide-command">
            <span class="command-label">{{ command.label }}</span>
            <div class="command-line">
              <code>{{ command.text }}</code>
              <button class="command-copy" type="button" :aria-label="`Copy: ${command.label}`" @click="copy(command)">
                <i :class="copiedLabel === command.label ? 'bi bi-check-lg' : 'bi bi-copy'" aria-hidden="true"></i>
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  </dialog>
</template>

<script>
export default {
  props: {
    retention: { type: String, default: '' },
  },
  data() { return { copiedLabel: '' }; },
  computed: {
    apiBase() {
      return new URL('api/', document.baseURI).href;
    },
    commands() {
      return [
        { label: 'Send command output', text: `some-command | curl -sk -T - ${this.apiBase}text` },
        { label: 'Send a file', text: `curl -sk -T show-output.txt ${this.apiBase}text` },
        { label: 'Print the newest entry', text: `curl -sk ${this.apiBase}latest.txt` },
        { label: 'Print entry #12', text: `curl -sk ${this.apiBase}messages/12.txt` },
      ];
    },
  },
  methods: {
    open() {
      if (!this.$refs.dialog.open) this.$refs.dialog.showModal();
    },
    close() {
      this.$refs.dialog.close();
    },
    closeOnBackdrop(event) {
      if (event.target === this.$refs.dialog) this.close();
    },
    async copy(command) {
      try {
        if (navigator.clipboard?.writeText && window.isSecureContext) {
          await navigator.clipboard.writeText(command.text);
        } else {
          const area = document.createElement('textarea');
          area.value = command.text;
          area.setAttribute('readonly', '');
          area.style.position = 'fixed';
          area.style.opacity = '0';
          this.$refs.dialog.appendChild(area);
          area.select();
          document.execCommand('copy');
          area.remove();
        }
        this.copiedLabel = command.label;
        window.setTimeout(() => { if (this.copiedLabel === command.label) this.copiedLabel = ''; }, 1600);
      } catch (error) { console.error('Unable to copy command:', error); }
    },
  },
};
</script>

<style>
.guide-dialog { width: min(760px, calc(100vw - 24px)); max-height: calc(100dvh - 40px); padding: 0; border: 1px solid var(--border); border-radius: 20px; color: var(--text); background: var(--surface); box-shadow: 0 30px 80px rgba(18,51,46,.35); }
.guide-dialog::backdrop { background: rgba(18,51,46,.45); backdrop-filter: blur(2px); }
.guide-panel { display: flex; flex-direction: column; max-height: calc(100dvh - 42px); }
.guide-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border); background: linear-gradient(90deg, var(--surface), var(--surface-soft)); }
.guide-header h2 { font-size: 18px; font-weight: 740; letter-spacing: -.3px; }
.guide-close { display: grid; place-items: center; width: 34px; height: 34px; border: 1px solid var(--border); border-radius: 10px; color: var(--muted); background: var(--surface-soft); cursor: pointer; }
.guide-close:hover { color: #fff; background: var(--primary); }
.guide-body { overflow-y: auto; padding: 6px 22px 20px; font-size: 14px; line-height: 1.55; }
.guide-body section { padding: 14px 0; border-bottom: 1px dashed var(--border); }
.guide-body section:last-child { border-bottom: 0; }
.guide-body h3 { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; color: var(--h1-color); font-size: 15px; font-weight: 740; }
.guide-body h3 i { color: var(--primary); }
.guide-body ul { margin: 0; padding-left: 20px; }
.guide-body li + li { margin-top: 4px; }
.guide-body kbd { padding: 1px 5px; border: 1px solid var(--border); border-bottom-width: 2px; border-radius: 5px; background: var(--surface-soft); font: 600 12px/1.4 ui-monospace, monospace; }
.guide-body code { font: 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.guide-controls { display: grid; grid-template-columns: auto 1fr; gap: 9px 14px; align-items: center; margin: 0; }
.guide-controls dd { margin: 0; }
.chip { display: inline-flex; align-items: center; justify-content: center; gap: 4px; min-width: 30px; padding: 1px 8px; border: 1px solid var(--border); border-radius: 999px; color: var(--muted); font-size: 11px; font-weight: 700; line-height: 1.6; }
.chip-id { border-color: #9bd8cb; color: var(--primary-dark); background: var(--primary-soft); font-family: ui-monospace, monospace; font-weight: 800; }
.chip-icon { border-radius: 8px; color: var(--primary-dark); background: var(--surface-soft); }
.chip-danger { color: var(--danger); }
.guide-note { margin-bottom: 10px; color: var(--muted); font-size: 13px; }
.guide-command + .guide-command { margin-top: 10px; }
.command-label { display: block; margin-bottom: 4px; color: var(--muted); font-size: 12px; font-weight: 700; }
.command-line { display: flex; align-items: center; gap: 8px; padding: 8px 8px 8px 12px; border-radius: 10px; background: #12332e; }
.command-line code { flex: 1; min-width: 0; overflow-x: auto; color: #d6f5ec; white-space: nowrap; }
.command-copy { flex: 0 0 auto; display: grid; place-items: center; width: 30px; height: 30px; border: 0; border-radius: 8px; color: #b8d8d0; background: rgba(255,255,255,.08); cursor: pointer; }
.command-copy:hover { color: #12332e; background: #d6f5ec; }
</style>
