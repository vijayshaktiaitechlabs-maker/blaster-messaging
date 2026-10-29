/* WhatsApp Blaster console: start-up in LIVE mode, and Meta's Embedded Signup pop-up.

   Demo mode (WB_CONFIG.demo true): nothing here runs; index.html loads demo-data.js, app.js and app-views.js as today.

   Live mode, the order index.html loads things in (see docs/BACKEND.md, "Console in live mode"):
     supabase-js v2 (pinned, jsDelivr) -> auth.js -> data-live.js -> boot.js
   and boot.js then:
     1. checks the session (no session: login.html) and picks the login's workspace;
     2. builds the live store (data-live.js) and waits for its first load;
     3. hands it to the console: window.WB_STORE (the store app.js should use instead of its demo store) and
        window.DEMO (the same data in demo-data.js shape, so app.js renders it even before it reads WB_STORE);
     4. loads app.js and app-views.js.
   A workspace-less login (signed up but the workspace step did not run) gets a small "name your business" prompt.

   window.WB_ES.launch() opens Meta's Embedded Signup with this installation's app id and configuration id
   (WB_CONFIG.metaAppId, WB_CONFIG.metaConfigId), waits for both halves Meta sends back (the session info message
   with waba_id and phone_number_id, and the login callback with the one-time code) and returns them; the caller
   passes them to store.connectNumber(), which calls the wa-signup workflow (the code is exchanged on the server). */
(function () {
  'use strict';
  const CFG = window.WB_CONFIG || {};
  const GRAPH_VERSION = 'v26.0';
  const SDK_URL = 'https://connect.facebook.net/en_US/sdk.js';

  // ---------- Embedded Signup ----------
  /* env lets the bench replace the browser pieces: { win, loadSdk, timeoutMs } */
  function loadFbSdk(win, appId) {
    if (win.FB && win.FB.login) return Promise.resolve(win.FB);
    if (win.__wbFbLoading) return win.__wbFbLoading;
    win.__wbFbLoading = new Promise((resolve, reject) => {
      win.fbAsyncInit = function () { try { win.FB.init({ appId, autoLogAppEvents: false, xfbml: false, version: GRAPH_VERSION }); resolve(win.FB); } catch (e) { reject(e); } };
      const s = win.document.createElement('script');
      s.src = SDK_URL; s.async = true; s.defer = true; s.crossOrigin = 'anonymous';
      s.onerror = () => { win.__wbFbLoading = null; reject(new Error('Could not load Facebook\'s sign-in. Check that nothing blocks connect.facebook.net and try again.')); };
      win.document.head.appendChild(s);
    });
    return win.__wbFbLoading;
  }
  /* Meta's session-info message: {type:'WA_EMBEDDED_SIGNUP', event:'FINISH'|'FINISH_ONLY_WABA'|'CANCEL'|'ERROR', data:{...}} from a facebook.com origin */
  function parseSessionMessage(ev) {
    let host = ''; try { host = new URL(ev.origin).hostname; } catch (e) { return null; }
    if (!(host === 'facebook.com' || host.endsWith('.facebook.com'))) return null;   // anything else is ignored (no spoofing from other frames)
    let d = ev.data; if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { return null; } }
    if (!d || d.type !== 'WA_EMBEDDED_SIGNUP') return null;
    return d;
  }
  function launch(opts, env) {
    opts = opts || {}; env = env || {};
    const win = env.win || window;
    const appId = String(opts.appId || CFG.metaAppId || ''), configId = String(opts.configId || CFG.metaConfigId || '');
    if (!/^\d{5,}$/.test(appId) || !/^\d{5,}$/.test(configId)) return Promise.reject(new Error('Embedded Signup is not configured (metaAppId / metaConfigId missing in WB_CONFIG).'));
    const timeoutMs = env.timeoutMs || 15 * 60 * 1000;
    return (env.loadSdk || loadFbSdk)(win, appId).then((FB) => new Promise((resolve, reject) => {
      let info = null, code = null, done = false;
      const finish = (err, val) => { if (done) return; done = true; win.removeEventListener('message', onMsg); clearTimeout(timer); if (err) reject(err); else resolve(val); };
      const tryResolve = () => { if (info && code) finish(null, { code, waba_id: info.waba_id, phone_number_id: info.phone_number_id, business_id: info.business_id || null }); };
      function onMsg(ev) {
        const d = parseSessionMessage(ev); if (!d) return;
        if (d.event === 'CANCEL') return finish(Object.assign(new Error('The connection was cancelled' + (d.data && d.data.current_step ? ' at "' + d.data.current_step + '"' : '') + '. Nothing was changed.'), { cancelled: true }));
        if (d.event === 'ERROR') return finish(new Error('Meta reported a problem: ' + String((d.data && d.data.error_message) || 'unknown error')));
        if (/^FINISH/.test(String(d.event || ''))) {
          const x = d.data || {};
          if (!x.waba_id) return finish(new Error('Meta did not return a WhatsApp Business Account. Try again.'));
          if (!x.phone_number_id) return finish(new Error('No phone number was added in the pop-up. Open it again and add your number.'));
          info = x; tryResolve();
        }
      }
      win.addEventListener('message', onMsg);
      const timer = setTimeout(() => finish(new Error('The Meta pop-up was open too long. Start again.')), timeoutMs);
      FB.login((resp) => {
        const c = resp && resp.authResponse && resp.authResponse.code;
        if (!c) return finish(Object.assign(new Error('The Meta pop-up was closed before it finished. Nothing was changed.'), { cancelled: true }));
        code = c;
        /* the message usually arrives first; give it a moment if the callback won the race */
        if (!info) setTimeout(() => { if (!info) finish(new Error('Meta did not say which number was connected. Try again.')); }, env.messageWaitMs || 8000);
        tryResolve();
      /* featureType 'whatsapp_business_app_onboarding' is what lets a business connect a number that is ALREADY
         running in the WhatsApp Business app, instead of being told to delete that account first. Meta converts the
         existing account into a backward-compatible Messaging account, keeps the same waba_id, and the Business app
         goes on working afterwards. It needs a Tech Provider (we are one), Embedded Signup with session logging
         (sessionInfoVersion below), and the customer on Business app 2.24.17 or newer. It is implied on
         sessionInfoVersion 5, but we are on 3, where it must be asked for explicitly -- leaving it '' is what made
         "delete your WhatsApp account first" look like a Meta rule when it was our own parameter.
         Trade-offs Meta applies to a number used on both: broadcast lists off, disappearing and view-once off for
         1:1, companion apps unlinked during onboarding, and a 20 messages/second cap. */
      }, { config_id: configId, response_type: 'code', override_default_response_type: true, extras: { setup: {}, featureType: 'whatsapp_business_app_onboarding', sessionInfoVersion: '3' } });
    }));
  }
  /* the whole button: pop-up, then the server step; asks for the number's existing two-step PIN when Meta needs it */
  async function connectWithFacebook(store, o) {
    o = o || {};
    const got = await launch(o, o.env);
    try { return await store.connectNumber(got); }
    catch (e) {
      if (e.needPin && typeof o.askPin === 'function') { const pin = await o.askPin(); if (pin) return store.connectNumber(Object.assign({}, got, { pin })); }
      throw e;
    }
  }

  // ---------- live start-up ----------
  function loadScript(src, doc) {
    doc = doc || document;
    return new Promise((resolve, reject) => { const s = doc.createElement('script'); s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Could not load ' + src)); doc.body.appendChild(s); });
  }
  /* the live data in demo-data.js shape (what app.js deep-copies at start) */
  function demoShape(store) {
    return { contacts: store.contacts(), templates: store.templates(), campaigns: store.campaigns(), conversations: store.conversations(), events: store.events(), daily: store.daily(),
      team: store.team(), activity: store.activity(), settings: store.settings(), tags: store.tags(), generatedAt: new Date().toISOString(), live: true };
  }
  function message(doc, html) { const m = doc.createElement('div'); m.className = 'boot-msg'; m.setAttribute('role', 'status'); m.innerHTML = html; doc.body.prepend(m); return m; }
  async function start(env) {
    env = env || {};
    const doc = env.doc || document;
    if (CFG.demo) return null;
    const A = window.WB_AUTH, L = window.WB_LIVE;
    if (!A || !L) throw new Error('auth.js and data-live.js must load before boot.js');
    const gate = await A.requireSession();
    if (!gate) return null;   // redirected to the login page
    let ws = gate.workspace;
    if (!ws) {
      const name = env.askBusiness ? await env.askBusiness() : (window.prompt ? window.prompt('Name your business to create your workspace') : '');
      if (!name) { message(doc, 'This login has no workspace yet. Reload the page to create one.'); return null; }
      await A.createWorkspace(name);
      ws = (await A.requireSession()).workspace;
    }
    const store = L.createStore({ client: A.client(), workspaceId: ws.id, slug: ws.slug, config: CFG });
    await store.ready;
    window.WB_STORE = store;
    window.WB_STORE.connectWithFacebook = (o) => connectWithFacebook(store, o);
    window.WB_STORE.signOut = A.signOut;
    window.WB_STORE.workspaces = () => gate.workspaces;
    window.WB_STORE.switchWorkspace = (id) => { A.pickWorkspace(id); location.reload(); };
    window.DEMO = demoShape(store);
    if (env.loadConsole !== false) { await loadScript('app.js', doc); await loadScript('app-views.js', doc); }
    return store;
  }

  window.WB_ES = { launch, parseSessionMessage, connectWithFacebook, GRAPH_VERSION };
  window.WB_BOOT = { start, demoShape };
  /* a live page starts itself; a page that includes boot.js in demo mode is unaffected */
  if (!CFG.demo && !window.WB_BOOT_MANUAL && typeof document !== 'undefined') {
    const go = () => start().catch((e) => { console.error(e);
      /* the stored token can still look valid locally while the server rejects it (user removed, sessions revoked,
         JWT secret rotated). Going straight to login.html would bounce back here, because the login page only checks
         local expiry. Sign out first so the stale session is cleared. */
      if (window.WB_LIVE && window.WB_LIVE.isAuthError(e && e.message)) {
        if (window.WB_AUTH && window.WB_AUTH.signOut) window.WB_AUTH.signOut().catch(() => { location.href = 'login.html'; });
        else location.href = 'login.html';
        return; } message(document, 'The console could not start: ' + String(e.message || e).replace(/[<>&]/g, '') + ' <a href="login.html">Sign in again</a>'); });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  }
})();
