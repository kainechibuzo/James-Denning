import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import './styles/app.css'
import './styles/true-black-theme.css'
import App from './App.jsx'

// ── Native platform bootstrap ─────────────────────────────────────────────────
// These calls are safe no-ops on the web; they only activate inside the
// Android (or iOS) WebView.  SplashScreen auto-hides via capacitor.config.ts
// (launchAutoHide: true, launchShowDuration: 2000ms).
if (Capacitor.isNativePlatform()) {
  // Navy status bar, light (white) icons, does NOT overlay the WebView
  // setOverlaysWebView(false) is the key fix — pushes app content below the bar
  StatusBar.setStyle({ style: Style.Dark }).catch(() => {})
  StatusBar.setBackgroundColor({ color: '#000000' }).catch(() => {})
  StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {})
}

// ── Service Worker (PWA — web only, not Capacitor) ────────────────────────────
// Only register on web PRODUCTION builds. Capacitor Android bundles assets
// natively and doesn't need a SW. In dev the SW caches /src/*.jsx modules
// stale, breaking HMR and serving old code — never register it there.
if (import.meta.env.PROD && !Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(reg  => console.log('[SW] registered, scope:', reg.scope))
      .catch(err => console.warn('[SW] registration failed:', err));

    // Auto-recover from stale-build MIME errors: the SW posts this when a
    // hashed JS/CSS request returns HTML (SPA fallback for a missing file).
    let _reloading = false;
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'RELOAD_FOR_NEW_BUILD' && !_reloading) {
        _reloading = true;
        console.warn('[SW] new build detected, reloading…');
        location.reload();
      }
    });
  });
}

// ── React mount ───────────────────────────────────────────────────────────────
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
