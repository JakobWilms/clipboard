<template>
  <a class="skip-link" href="#saved-entries">Skip to saved entries</a>
  <main class="app-shell">
    <header class="app-header">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true"><i class="bi bi-clipboard2-check"></i></span>
        <div>
          <h1>Clippy</h1>
          <p>Your shared clipboard, ready everywhere.</p>
        </div>
      </div>
      <span class="version-badge" aria-label="Application version">v{{ version }}</span>
      <button class="theme-toggle" type="button" :aria-label="darkMode ? 'Switch to light mode' : 'Switch to dark mode'" @click="toggleTheme">
        <i :class="darkMode ? 'bi bi-sun' : 'bi bi-moon'" aria-hidden="true"></i>
      </button>
    </header>

    <section class="workspace" :class="{ 'composer-collapsed': composerCollapsed }">
      <section id="saved-entries" class="entries-panel" aria-labelledby="entries-title" tabindex="-1">
        <div class="panel-heading">
          <div>
            <span class="eyebrow">Library</span>
            <h2 id="entries-title">Saved entries</h2>
          </div>
          <span class="entry-count" :aria-label="`${messages.length} saved entries`">{{ messages.length }}</span>
        </div>

        <div class="entries-scroll" ref="chatMessages" aria-live="polite">
          <TransitionGroup v-if="messages.length" name="entry-list" tag="div" class="entries-list">
            <ChatMessage
              v-for="message in messages"
              :key="message.id"
              :id="message.id"
              :message="message.message"
              :created-at="message.created_at"
              @deleteMessage="deleteMessage"
            />
          </TransitionGroup>
          <div v-else class="empty-state">
            <span class="empty-illustration" aria-hidden="true"><i class="bi bi-clipboard2-heart"></i></span>
            <h3>No saved entries yet</h3>
            <p>Create one in the composer to get started.</p>
          </div>
        </div>
      </section>

      <aside class="composer-panel" :class="{ 'is-collapsed': composerCollapsed }" aria-label="Entry composer">
        <button
          class="collapse-button"
          type="button"
          :aria-expanded="!composerCollapsed"
          aria-controls="composer-content"
          :aria-label="composerCollapsed ? 'Expand composer' : 'Collapse composer'"
          @click="toggleComposer"
        >
          <i :class="composerCollapsed ? 'bi bi-chevron-left' : 'bi bi-chevron-right'" aria-hidden="true"></i>
        </button>
        <div id="composer-content" class="composer-content" :inert="composerCollapsed" :aria-hidden="composerCollapsed">
          <div class="panel-heading composer-heading">
            <div>
              <span class="eyebrow">New entry</span>
              <h2>Compose</h2>
            </div>
            <span class="heading-icon" aria-hidden="true"><i class="bi bi-stars"></i></span>
          </div>
          <ChatInput @sendMessage="addMessage" />
        </div>
      </aside>
    </section>
  </main>
</template>

<script>
import ChatInput from './components/ChatInput.vue';
import ChatMessage from './components/ChatMessage.vue';

const APP_VERSION = __APP_VERSION__;

export default {
  name: 'App',
  components: { ChatInput, ChatMessage },
  data() {
    return { messages: [], composerCollapsed: false, version: APP_VERSION, darkMode: false };
  },
  methods: {
    async fetchMessages() {
      try {
        const response = await fetch('/api/messages');
        if (!response.ok) throw new Error(`Load failed (${response.status})`);
        this.messages = await response.json();
      } catch (error) {
        console.error('Unable to fetch entries:', error);
      }
    },
    addMessage(message) {
      this.messages.push(message);
      this.scrollToBottom();
    },
    async deleteMessage(messageId) {
      try {
        const response = await fetch(`/api/messages/${messageId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error(`Delete failed (${response.status})`);
        this.messages = this.messages.filter((message) => message.id !== messageId);
      } catch (error) {
        console.error('Unable to delete entry:', error);
      }
    },
    toggleComposer() {
      this.composerCollapsed = !this.composerCollapsed;
    },
    scrollToBottom() {
      this.$nextTick(() => {
        const entries = this.$refs.chatMessages;
        if (entries) entries.scrollTo({ top: entries.scrollHeight, behavior: 'smooth' });
      });
    },
    toggleTheme() {
      this.darkMode = !this.darkMode;
      document.documentElement.dataset.theme = this.darkMode ? 'dark' : '';
      localStorage.setItem('theme', this.darkMode ? 'dark' : 'light');
    },
  },
  mounted() {
    this.darkMode = localStorage.getItem('theme') === 'dark'
        || (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (this.darkMode) document.documentElement.dataset.theme = 'dark';
    this.fetchMessages();
  },
};
</script>

<style>
:root {
  color-scheme: light;
  --bg: #effcf8;
  --surface: #ffffff;
  --surface-soft: #f4fbf9;
  --surface-hover: #e9f8f4;
  --border: #b8d8d0;
  --text: #12332e;
  --muted: #476b64;
  --placeholder: #657f79;
  --primary: #087f73;
  --primary-dark: #075e56;
  --primary-soft: #d6f5ec;
  --secondary: #e05a38;
  --secondary-soft: #fff0e9;
  --focus: #075e56;
  --focus-soft: rgba(8,127,115,.18);
  --danger: #b42318;
  --bg-gradient: linear-gradient(145deg, #edfff9 0%, #fff8ed 54%, #e7f7ff 100%);
  --panel-bg: rgba(255,255,255,.94);
  --h1-color: #0b4038;
  --version-badge: #8f321d;
  --shadow-soft: rgba(18,78,66,.06);
  --shadow-medium: rgba(22,88,74,.12);
  --shadow-primary: rgba(13,148,136,.25);
  --shadow-primary-hover: rgba(13,148,136,.32);
  --btn-disabled-bg: #e4e7ec;
  --btn-disabled-text: #667085;
  --pre-bg: #12332e;
  --pre-text: #effcf8;
  --border-highlight: #8bc9bb;
  --scrollbar-thumb: #7bb9ab;
  --editor-highlight: rgba(255,255,255,.75);
  --brand-gradient-end: #24a88f;
  --badge-border: #e8b69f;
  --count-border: #9bd8cb;
  --icon-color: #9a3e26;
}
[data-theme="dark"] {
  color-scheme: dark;
  --bg: #0e1a17;
  --surface: #16241f;
  --surface-soft: #1b2c26;
  --surface-hover: #22362f;
  --border: #2e4a42;
  --text: #e4f2ee;
  --muted: #9dbcb3;
  --placeholder: #6d8a82;
  --primary: #2bb3a3;
  --primary-dark: #7fd8cb;
  --primary-soft: #14332d;
  --secondary: #f08a6b;
  --secondary-soft: #3a211a;
  --focus: #7fd8cb;
  --focus-soft: rgba(43,179,163,.25);
  --danger: #f97066;
  --bg-gradient: linear-gradient(145deg, #0a1412 0%, #121916 54%, #0b1517 100%);
  --panel-bg: rgba(22,36,31,.94);
  --h1-color: #e4f2ee;
  --version-badge: #f08a6b;
  --shadow-soft: rgba(0,0,0,.25);
  --shadow-medium: rgba(0,0,0,.4);
  --shadow-primary: rgba(13,148,136,.15);
  --shadow-primary-hover: rgba(13,148,136,.25);
  --btn-disabled-bg: #22362f;
  --btn-disabled-text: #6d8a82;
  --pre-bg: #0a1412;
  --pre-text: #9dbcb3;
  --border-highlight: #7fd8cb;
  --scrollbar-thumb: #2e4a42;
  --editor-highlight: rgba(255,255,255,.05);
  --brand-gradient-end: #176b5b;
  --badge-border: #5c2415;
  --count-border: #1a423a;
  --icon-color: #f08a6b;
}
* { box-sizing: border-box; }
html, body, #app { width: 100%; height: 100%; margin: 0; overflow: hidden; }
body { background: var(--bg-gradient); color: var(--text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
button { font: inherit; }
button:focus-visible, [contenteditable]:focus-visible, a:focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; }
.skip-link { position: fixed; z-index: 100; top: 8px; left: 8px; padding: 10px 14px; border-radius: 10px; color: #fff; background: var(--primary-dark); transform: translateY(-150%); transition: transform .18s ease; }
.skip-link:focus { transform: translateY(0); }
.app-shell { height: 100dvh; display: flex; flex-direction: column; padding: 18px; gap: 14px; }
.app-header { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; min-height: 58px; padding: 0 4px; }
.brand { display: flex; align-items: center; gap: 13px; min-width: 0; }
.brand-mark { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 14px; color: #fff; background: linear-gradient(145deg, var(--primary), var(--brand-gradient-end)); box-shadow: 0 10px 26px var(--shadow-primary); font-size: 21px; }
h1, h2, h3, p { margin: 0; }
h1 { color: var(--h1-color); font-size: 21px; font-weight: 750; letter-spacing: -.45px; }
.brand p { color: var(--muted); font-size: 13px; margin-top: 2px; }
.version-badge { align-self: flex-start; padding: 6px 10px; border: 1px solid var(--badge-border); border-radius: 999px; background: var(--secondary-soft); color: var(--version-badge); font: 700 11px/1 ui-monospace, monospace; }
.theme-toggle { display: grid; place-items: center; width: 40px; height: 40px; padding: 0; border: 1px solid var(--border); border-radius: 12px; color: var(--primary-dark); background: var(--surface-soft); cursor: pointer; transition: color 0.2s ease, background 0.2s ease, transform 0.2s ease, border-color 0.2s ease; margin-left: auto; }
.theme-toggle:hover { color: #fff; background: var(--primary); border-color: var(--primary); transform: scale(1.05); }
.theme-toggle i { font-size: 1.1rem; }
.workspace { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(360px, 42%); gap: 14px; transition: grid-template-columns .35s cubic-bezier(.2,.8,.2,1); }
.workspace.composer-collapsed { grid-template-columns: minmax(0, 1fr) 56px; }
.entries-panel, .composer-panel { min-width: 0; min-height: 0; border: 1px solid var(--border); border-radius: 20px; background: var(--panel-bg); box-shadow: 0 18px 45px var(--shadow-medium); overflow: hidden; }
.entries-panel { display: flex; flex-direction: column; }
.panel-heading { display: flex; align-items: center; justify-content: space-between; flex: 0 0 auto; min-height: 76px; padding: 15px 20px; border-bottom: 1px solid var(--border); background: linear-gradient(90deg, var(--surface), var(--surface-soft)); }
.panel-heading h2 { font-size: 18px; font-weight: 740; letter-spacing: -.3px; }
.eyebrow { display: block; margin-bottom: 3px; color: var(--primary-dark); font-size: 10px; font-weight: 800; letter-spacing: .13em; text-transform: uppercase; }
.entry-count { display: grid; place-items: center; min-width: 30px; height: 30px; padding: 0 9px; border: 1px solid var(--count-border); border-radius: 999px; background: var(--primary-soft); color: var(--primary-dark); font-size: 12px; font-weight: 800; }
.entries-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 16px; scroll-behavior: smooth; scrollbar-color: var(--scrollbar-thumb) transparent; }
.entries-list { display: grid; gap: 12px; }
.empty-state { height: 100%; min-height: 220px; display: grid; place-content: center; justify-items: center; padding: 24px; text-align: center; color: var(--muted); }
.empty-illustration { display: grid; place-items: center; width: 68px; height: 68px; margin-bottom: 16px; border-radius: 22px; color: var(--primary-dark); background: linear-gradient(145deg, var(--primary-soft), var(--secondary-soft)); font-size: 30px; }
.empty-state h3 { color: var(--text); font-size: 16px; font-weight: 730; }
.empty-state p { margin-top: 6px; font-size: 13px; }
.composer-panel { position: relative; transition: width .35s ease, background-color .2s ease; }
.composer-content { height: 100%; display: flex; flex-direction: column; opacity: 1; transition: opacity .18s ease .12s; }
.composer-panel.is-collapsed .composer-content { opacity: 0; pointer-events: none; transition-delay: 0s; }
.composer-heading { padding-left: 22px; }
.heading-icon { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 11px; color: var(--icon-color); background: var(--secondary-soft); }
.collapse-button { position: absolute; z-index: 5; top: 50%; left: 0; width: 32px; height: 58px; transform: translate(-50%, -50%); display: grid; place-items: center; border: 1px solid #83c5b6; border-radius: 11px; color: var(--primary-dark); background: var(--surface); box-shadow: 0 7px 20px var(--shadow-medium); cursor: pointer; transition: color .2s ease, background .2s ease, transform .2s ease; }
.collapse-button:hover { color: #fff; background: var(--primary); transform: translate(-50%, -50%) scale(1.05); }
.composer-panel.is-collapsed .collapse-button { left: 50%; }
.entry-list-enter-active, .entry-list-leave-active { transition: opacity .22s ease, transform .22s ease; }
.entry-list-enter-from, .entry-list-leave-to { opacity: 0; transform: translateY(8px); }
@media (max-width: 760px) {
  html, body, #app { overflow: auto; }
  .app-shell { min-height: 100dvh; height: auto; padding: 10px; }
  .brand p { display: none; }
  .workspace, .workspace.composer-collapsed { display: flex; flex-direction: column; }
  .entries-panel { min-height: 45dvh; }
  .composer-panel { min-height: 48dvh; }
  .composer-panel.is-collapsed { min-height: 52px; height: 52px; }
  .collapse-button, .composer-panel.is-collapsed .collapse-button { top: 0; left: 50%; width: 58px; height: 32px; transform: translate(-50%, -50%) rotate(90deg); }
  .collapse-button:hover { transform: translate(-50%, -50%) rotate(90deg) scale(1.05); }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; }
}
@media (forced-colors: active) { .brand-mark, .heading-icon, .empty-illustration { forced-color-adjust: none; } }
</style>
