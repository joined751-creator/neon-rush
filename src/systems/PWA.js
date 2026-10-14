import { eventBus, Events } from '../core/EventBus.js';

/**
 * Installable app (GitHub Pages build): registers the offline service worker and
 * drives the "Установить на телефон" button (Android prompt / iOS instructions).
 * Silently does nothing inside the single-file / artifact builds (no manifest there).
 */
export function setupPWA(menus) {
  const hasManifest = !!document.querySelector('link[rel="manifest"]');
  const btn = document.getElementById('install-btn');
  const secure = location.protocol === 'https:' || location.hostname === 'localhost';
  if (hasManifest && secure && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline cache is optional */ });
  }
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (standalone) document.body.classList.add('standalone');
  if (!btn || !hasManifest || standalone) return;

  let deferred = null;
  const iOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; btn.hidden = false; });
  window.addEventListener('appinstalled', () => { btn.hidden = true; deferred = null; });
  if (iOS) btn.hidden = false;

  eventBus.on(Events.UI_ACTION, ({ action }) => {
    if (action !== 'install') return;
    if (deferred) {
      deferred.prompt();
      deferred.userChoice.finally(() => { deferred = null; btn.hidden = true; });
    } else {
      menus.back = 'title';
      menus.show('install');
    }
  });
}
