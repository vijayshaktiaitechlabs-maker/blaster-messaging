/* WhatsApp Blaster console. Plain JavaScript, no framework.
   Data comes from a "store". Demo mode: an in-memory copy of demo-data.js, changed only by the demo store's
   write methods. Live mode: boot.js builds window.WB_STORE (app/data-live.js: Supabase and the n8n workflows)
   before this file runs. The views read through the store's getters and write through the same method names
   in both modes (the "ops" below); a live method returns a promise, a demo one returns at once.
   Part 1 (this file): helpers, icons, store, routing, search palette, dashboard, inbox, contacts, campaigns.
   Part 2 (app-views.js): templates, reports, team, billing, settings, and the hidden bot page. */
(function () {
  'use strict';
  const CFG = window.WB_CONFIG || { demo: true };
  // live mode: wait for boot.js, which runs this file again once the signed-in workspace is loaded
  if (CFG.demo === false && !window.WB_STORE) return;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = (iso, o = {}) => iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', ...(o.time === false ? {} : { hour: '2-digit', minute: '2-digit' }), ...o }) : '';
  const fmtTime = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const ago = (iso) => { const m = Math.round((Date.now() - new Date(iso)) / 60000); if (m < 1) return 'just now'; if (m < 60) return m + ' min ago'; const h = Math.round(m / 60); if (h < 24) return h + ' h ago'; const d = Math.round(h / 24); return d + (d === 1 ? ' day ago' : ' days ago'); };
  /* letters and digits only: a name like "<img onerror=...>" cannot put markup into an avatar */
  const initials = (n) => String(n || '?').split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')[0] || '').filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
  /* a datetime-local field shows the user's own clock; stored times are ISO (UTC): convert both ways here */
  const toLocalInput = (iso) => { const d = iso ? new Date(iso) : null; if (!d || isNaN(d)) return ''; const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  const uid = () => 'x' + Math.random().toString(36).slice(2, 9);
  const plural = (n, w) => n.toLocaleString('en-IN') + ' ' + w + (n === 1 ? '' : 's');
  const inr = (n) => '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: n < 100 ? 2 : 0 });
  const digitsOf = (p) => String(p || '').replace(/\D/g, '');

  // ---------- hand-drawn icon set (20px grid, 1.75 stroke) ----------
  const ICONS = {
    home: '<path d="M3.5 9.5 10 4l6.5 5.5V16a1 1 0 0 1-1 1h-3.5v-4.5h-4V17H4.5a1 1 0 0 1-1-1z"/>',
    inbox: '<path d="M3 11.5h4l1.5 2h3l1.5-2h4"/><path d="M4.5 4.5h11l1.5 7v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-4z"/>',
    contacts: '<circle cx="8" cy="7" r="3"/><path d="M2.5 16.5c.5-3 2.5-4.5 5.5-4.5s5 1.5 5.5 4.5"/><path d="M13.5 4.5a3 3 0 0 1 0 5"/><path d="M15 12.2c1.6.6 2.4 1.9 2.6 4.3"/>',
    campaign: '<path d="M3 8.5v3h2.5l6 3.5V5l-6 3.5z"/><path d="M14.5 7.5a3.5 3.5 0 0 1 0 5"/><path d="M5.5 11.5 6.5 16h2"/>',
    template: '<rect x="4" y="3" width="12" height="14" rx="1.5"/><path d="M7 7h6M7 10h6M7 13h3.5"/>',
    reports: '<path d="M3.5 16.5h13"/><path d="M5.5 13.5v-4M9 13.5V6.5M12.5 13.5v-2.5M16 13.5V4.5"/>',
    team: '<circle cx="7" cy="7.5" r="2.5"/><circle cx="13.5" cy="8.5" r="2"/><path d="M2.5 16c.4-2.8 2-4.2 4.5-4.2s4.1 1.4 4.5 4.2"/><path d="M12 12.4c2.2.1 3.5 1.2 3.9 3.6"/>',
    billing: '<rect x="3" y="5" width="14" height="10" rx="1.5"/><path d="M3 8.5h14"/><path d="M6 12.5h3"/>',
    settings: '<circle cx="10" cy="10" r="2.5"/><path d="M10 3v2M10 15v2M3 10h2M15 10h2M5.1 5.1l1.4 1.4M13.5 13.5l1.4 1.4M5.1 14.9l1.4-1.4M13.5 6.5l1.4-1.4"/>',
    search: '<circle cx="9" cy="9" r="5.5"/><path d="m13.2 13.2 3.3 3.3"/>',
    menu: '<path d="M3.5 6h13M3.5 10h13M3.5 14h13"/>',
    theme: '<circle cx="10" cy="10" r="7"/><path d="M10 3a7 7 0 0 0 0 14z" fill="currentColor" stroke="none"/>',
    help: '<circle cx="10" cy="10" r="7"/><path d="M7.8 8a2.2 2.2 0 1 1 3.2 2c-.7.4-1 .8-1 1.5"/><path d="M10 14.2v.1"/>',
    check: '<path d="m4.5 10.5 3.5 3.5 7.5-8"/>',
    x: '<path d="m5.5 5.5 9 9M14.5 5.5l-9 9"/>',
    plus: '<path d="M10 4v12M4 10h12"/>',
    warn: '<path d="M10 3.5 17 16H3z"/><path d="M10 8v4M10 14v.1"/>',
    info: '<circle cx="10" cy="10" r="7"/><path d="M10 9v5M10 6.5v.1"/>',
    lock: '<rect x="5" y="9" width="10" height="8" rx="1.5"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/>',
    clock: '<circle cx="10" cy="10" r="7"/><path d="M10 6v4l2.5 1.5"/>',
    download: '<path d="M10 3.5v9M6.5 9.5l3.5 3.5 3.5-3.5"/><path d="M4 16.5h12"/>',
    upload: '<path d="M10 12.5v-9M6.5 7l3.5-3.5L13.5 7"/><path d="M4 16.5h12"/>',
    back: '<path d="M12.5 4.5 7 10l5.5 5.5"/>',
    more: '<circle cx="5" cy="10" r="1.2" fill="currentColor"/><circle cx="10" cy="10" r="1.2" fill="currentColor"/><circle cx="15" cy="10" r="1.2" fill="currentColor"/>',
    phone: '<rect x="6" y="2.5" width="8" height="15" rx="1.5"/><path d="M9 15h2"/>',
    image: '<rect x="3" y="4" width="14" height="12" rx="1.5"/><circle cx="7.5" cy="8" r="1.3"/><path d="m3.5 14 4-4 3 3 2.5-2.5 3.5 3.5"/>',
    doc: '<path d="M6 2.5h5.5L15 6v10.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1z"/><path d="M11 2.5V6h4M8 10h4M8 13h4"/>',
    tick1: '<path d="m4 10.5 3 3 7-7"/>',
    tick2: '<path d="m2.5 10.5 3 3 6-6"/><path d="m9 13.5 7-7"/>',
    send: '<path d="M3.5 10 16.5 3.5 13 16.5l-3-5z"/><path d="M10 11.5l6.5-8"/>',
    note: '<path d="M4 4.5h12v8l-3.5 3.5H4z"/><path d="M12.5 16v-3.5H16M7 8h6M7 11h3"/>',
    tag: '<path d="M3.5 10.5V4.5h6l7 7-6 6z"/><circle cx="7" cy="8" r="1"/>',
    link: '<path d="M8.5 11.5a3 3 0 0 0 4.2 0l2.3-2.3a3 3 0 0 0-4.2-4.2L9.6 6.2"/><path d="M11.5 8.5a3 3 0 0 0-4.2 0L5 10.8a3 3 0 0 0 4.2 4.2l1.2-1.2"/>',
    reply: '<path d="M8 5 3.5 9.5 8 14"/><path d="M4 9.5h7a5 5 0 0 1 5 5v1"/>',
    call: '<path d="M5 3.5h3l1.5 3.5-2 1.5a9 9 0 0 0 4 4l1.5-2 3.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5A12 12 0 0 1 3.5 5 1.5 1.5 0 0 1 5 3.5z"/>',
    filter: '<path d="M3.5 5h13l-5 6v4.5l-3 1.5V11z"/>',
    group: '<rect x="3" y="4" width="14" height="4" rx="1"/><rect x="3" y="12" width="14" height="4" rx="1"/>',
    pause: '<path d="M7.5 4.5v11M12.5 4.5v11"/>',
    play: '<path d="M6.5 4.5 15.5 10l-9 5.5z"/>',
    refresh: '<path d="M16 9A6 6 0 0 0 5.5 6"/><path d="M4 11a6 6 0 0 0 10.5 3"/><path d="M4.5 3.5v3h3M15.5 16.5v-3h-3"/>',
    mail: '<rect x="3" y="5" width="14" height="10" rx="1.5"/><path d="m3.5 6 6.5 5 6.5-5"/>',
    external: '<path d="M11 4h5v5M16 4l-7 7"/><path d="M14 11.5v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7.5a1 1 0 0 1 1-1h4"/>',
    trash: '<path d="M4 6h12M8 6V4h4v2M6.5 6l.7 10h5.6l.7-10"/>',
    shield: '<path d="M10 2.5 16 5v5c0 3.5-2.5 6-6 7.5C6.5 16 4 13.5 4 10V5z"/><path d="m7.5 10 2 2 3.5-4"/>',
    arcs: '<path d="M11 7.5q1.3 2.5 0 5" class="a1"/><path d="M13.5 5.5q2.3 4.5 0 9" class="a2"/><path d="M16 3.5q3.3 6.5 0 13" class="a3"/><path d="M4 8v4h2l3 2V6L6 8z" fill="currentColor" stroke="none"/>',
    meta: '<path d="M3.5 13.5c0-3.5 1.5-7 3.5-7s3 3 3 3 1-3 3-3 3.5 3.5 3.5 7"/><path d="M3.5 13.5c0 1.5.8 2.5 2 2.5 1.5 0 2.5-2 4.5-6 2 4 3 6 4.5 6 1.2 0 2-1 2-2.5"/>',
    paper: '<path d="M4.5 4.5h11v11h-11z"/><path d="M7.5 8h5M7.5 11h5"/>',
  };
  const icon = (n, cls = '') => `<svg class="ico${cls ? ' ' + cls : ''}" viewBox="0 0 20 20" aria-hidden="true">${ICONS[n] || ''}</svg>`;
  $$('[data-icon]').forEach((el) => { const n = el.dataset.icon; if (el.tagName === 'svg') { el.outerHTML = icon(n); } else el.insertAdjacentHTML('afterbegin', icon(n)); });

  // ---------- notifications and dialogs ----------
  function toast(msg, kind = '') { const t = document.createElement('div'); t.className = 'toast ' + kind; t.innerHTML = icon(kind === 'bad' ? 'warn' : kind === 'good' ? 'check' : 'info') + '<span></span>'; t.lastChild.textContent = msg; $('#toasts').appendChild(t); setTimeout(() => t.remove(), 4200); }
  let lastFocus = null;
  function modal(html, { wide = false, narrow = false, onOpen } = {}) {
    lastFocus = document.activeElement;
    const host = $('#modalHost'); host.innerHTML = `<div class="modal-bg"><div class="modal${wide ? ' wide' : ''}${narrow ? ' narrow' : ''}" role="dialog" aria-modal="true">${html}</div></div>`;
    const bg = host.firstElementChild; bg.addEventListener('mousedown', (e) => { if (e.target === bg) closeModal(); });
    document.addEventListener('keydown', modalKeys); if (onOpen) onOpen(bg);
    focusFirst(bg); return bg;
  }
  // a dialog with the standard head / body / foot structure
  function dialog({ title, sub = '', body = '', foot = '', wide = false, narrow = false, onOpen }) {
    return modal(`<div class="m-head"><div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div><button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div><div class="m-body">${body}</div>${foot ? `<div class="foot">${foot}</div>` : ''}`, { wide, narrow, onOpen: (bg) => { $('[data-close]', bg).onclick = closeModal; if (onOpen) onOpen(bg); } });
  }
  // first focus: the first field in the body, else the primary action, else anything focusable (the close button last)
  // wizards redraw their content, so they call this again after each step
  function focusFirst(bg) { const m = $('.modal', bg); if (!m) return; const f = $('.m-body input:not([type=hidden]):not([disabled]):not([type=checkbox]), .m-body select:not([disabled]), .m-body textarea:not([disabled])', m) || $('.foot .btn.primary:not([disabled])', m) || $('.foot .btn', m) || $('button', m); if (f) f.focus(); }
  function closeModal() { $('#modalHost').innerHTML = ''; document.removeEventListener('keydown', modalKeys); if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  function modalKeys(e) {
    if (e.key === 'Escape') { closeModal(); return; }
    if (e.key !== 'Tab') return;
    const m = $('#modalHost .modal'); if (!m) return;
    const f = $$('a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])', m).filter((x) => x.offsetParent !== null);
    if (!f.length) return; const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  function confirmDialog(title, text, okLabel = 'Confirm', danger = false) {
    return new Promise((resolve) => {
      const host = $('#modalHost');
      if ($('.modal', host)) {   // over an open dialog (the campaign wizard, the template editor): a layer, not a replacement
        const back = document.activeElement;
        const layer = document.createElement('div'); layer.className = 'confirm-layer';
        layer.innerHTML = `<div class="modal-bg"><div class="modal narrow" role="alertdialog" aria-modal="true"><div class="m-head"><div><h2>${esc(title)}</h2></div></div><div class="m-body"><p>${esc(text)}</p></div><div class="foot"><button class="btn" data-x="no">Cancel</button><button class="btn ${danger ? 'danger solid' : 'primary'}" data-x="yes">${esc(okLabel)}</button></div></div></div>`;
        host.appendChild(layer);
        const done = (v) => { layer.remove(); if (back && back.focus && document.contains(back)) back.focus(); resolve(v); };
        /* a click on the dark area does nothing (a double-click on the button underneath used to close everything) */
        layer.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } else if (e.key === 'Tab') { e.preventDefault(); const bs = $$('button', layer); const i = bs.indexOf(document.activeElement); bs[(i + (e.shiftKey ? bs.length - 1 : 1)) % bs.length].focus(); } });
        $('[data-x="no"]', layer).onclick = () => done(false); $('[data-x="yes"]', layer).onclick = () => done(true);
        $(danger ? '[data-x="no"]' : '[data-x="yes"]', layer).focus();
        return;
      }
      const bg = dialog({ title: esc(title), body: `<p>${esc(text)}</p>`, narrow: true, foot: `<button class="btn" data-x="no">Cancel</button><button class="btn ${danger ? 'danger solid' : 'primary'}" data-x="yes">${esc(okLabel)}</button>` });
      $('[data-close]', bg).onclick = () => { closeModal(); resolve(false); };
      $('[data-x="no"]', bg).onclick = () => { closeModal(); resolve(false); }; $('[data-x="yes"]', bg).onclick = () => { closeModal(); resolve(true); };
      $(danger ? '[data-x="no"]' : '[data-x="yes"]', bg).focus();  // a destructive confirm starts on Cancel so Enter cannot delete by accident
    });
  }

  // ---------- store ----------
  const LIVE = window.WB_STORE || null;
  // Demo: a deep copy of window.DEMO, changed in place by the demo write methods. Live: the live store's own data object
  // (its arrays are replaced on every reload, so views always read D.contacts etc. at the moment they draw).
  const D = LIVE ? LIVE.data : JSON.parse(JSON.stringify(window.DEMO));
  if (!LIVE) D.team.forEach((u) => { if (u.role === 'manager') u.role = 'admin'; });  // v1 roles are owner, admin, agent
  // Console-side extensions (groups, saved filters, labels, quick replies, invites, billing, profile): in demo they live
  // here in memory; live, the live store provides the same shapes through ui().
  const byTag = (t) => D.contacts.filter((c) => c.tags.includes(t)).map((c) => c.id);
  const X = LIVE ? LIVE.ui() : (D.ui = {
    groups: [
      { id: 'g1', name: 'VIP customers', contactIds: byTag('vip'), createdAt: new Date(Date.now() - 20 * 864e5).toISOString() },
      { id: 'g2', name: 'October renewals', contactIds: byTag('renewal-due'), createdAt: new Date(Date.now() - 6 * 864e5).toISOString() },
      { id: 'g3', name: 'Open house invitees', contactIds: byTag('event-2026'), createdAt: new Date(Date.now() - 3 * 864e5).toISOString() },
    ],
    savedFilters: [
      { id: 'f1', name: 'Opted in, Pune', q: '', tag: '', city: 'Pune', optIn: 'true' },
      { id: 'f2', name: 'Leads, any city', q: '', tag: 'lead', city: '', optIn: '' },
    ],
    labels: ['Booking', 'Payment', 'Complaint', 'Question'],
    convLabels: { c2: ['Booking'], c7: ['Payment'], c5: ['Complaint'], c11: ['Question'], c22: ['Question'] },
    quickReplies: [
      { id: 'q1', title: 'Opening hours', text: 'We are open Monday to Saturday, 9 am to 7 pm, and closed on Sundays.' },
      { id: 'q2', title: 'How to pay', text: 'You can pay by UPI, card or bank transfer. We send a receipt by email.' },
      { id: 'q3', title: 'Reschedule', text: 'Sure, tell us your preferred day and time and we will move the appointment.' },
      { id: 'q4', title: 'Will call back', text: 'Thanks for writing in. A team member will call you back today.' },
    ],
    invites: [{ id: 'i1', email: 'rohan@example.com', role: 'agent', sentAt: new Date(Date.now() - 2 * 864e5).toISOString() }],
    billing: {
      plan: 'growth', since: '2026-08-12', renewsAt: '2026-11-12',
      invoices: [
        { id: 'INV-2026-0912', date: '2026-10-12', amount: 2999, status: 'paid' },
        { id: 'INV-2026-0811', date: '2026-09-12', amount: 2999, status: 'paid' },
        { id: 'INV-2026-0710', date: '2026-08-12', amount: 1499, status: 'paid' },
      ],
    },
    notifications: { campaignDone: true, newChat: true, templateStatus: true, qualityDrop: true, weekly: false, email: D.team[0].email },
    waProfile: { description: 'Repairs, maintenance plans and home visits in Pune.', address: D.settings.business.address, email: D.settings.business.email, website: D.settings.business.website, photo: '' },
    webhookOk: true,
    checklistDismissed: false,
  });
  const DEMO_PLANS = [
    { id: 'starter', name: 'Starter', price: 1499, users: 2, contacts: 2000, blurb: 'One number, a small team, your first campaigns.' },
    { id: 'growth', name: 'Growth', price: 2999, users: 5, contacts: 10000, blurb: 'For teams that message every week and share an inbox.' },
    { id: 'business', name: 'Business', price: 5999, users: 10, contacts: 50000, blurb: 'Larger lists, more agents, priority support.' },
  ];
  const PLANS = LIVE && LIVE.plans().length ? LIVE.plans() : DEMO_PLANS;
  /* a workspace on the trial (or a plan not in the list) still gets its limits, from the live usage figures when known */
  function planOf(id) {
    const p = PLANS.find((x) => x.id === id); if (p) return p;
    const u = LIVE && LIVE.settings().usage && LIVE.settings().usage.plan;
    return { id: id || 'trial', name: id === 'trial' || !id ? 'Trial' : id, price: 0, users: (u && u.max_users) || 2, contacts: (u && u.max_contacts) || 500, blurb: '' };
  }
  const DEMO_ONLY = 'Demo: nothing is sent or saved outside this page.';
  const me = () => LIVE ? (D.team.find((u) => u.id === LIVE.me().id) || D.team[0] || { id: '', name: 'You', email: '', role: 'agent', lastActive: new Date().toISOString() }) : D.team[0];
  const nowIso = () => new Date().toISOString();
  const convOf = (c) => D.conversations.find((x) => x.contactId === c.contactId) || c;
  // the read side, the same in both modes
  const getters = LIVE ? {
    contacts: () => LIVE.contacts(), contact: (id) => LIVE.contact(id), templates: () => LIVE.templates(), template: (id) => LIVE.template(id),
    campaigns: () => LIVE.campaigns(), campaign: (id) => LIVE.campaign(id), conversations: () => LIVE.conversations(), events: () => LIVE.events(), daily: () => LIVE.daily(),
    team: () => LIVE.team(), activity: () => LIVE.activity(), settings: () => LIVE.settings(), tags: () => LIVE.tags(), log: (a, d) => LIVE.log(a, d),
    ui: () => X, groups: () => LIVE.groups(), group: (id) => LIVE.group(id), savedFilters: () => LIVE.savedFilters(), plans: () => PLANS,
  } : {
    contacts: () => D.contacts, contact: (id) => D.contacts.find((c) => c.id === id),
    templates: () => D.templates, template: (id) => D.templates.find((t) => t.id === id),
    campaigns: () => D.campaigns, campaign: (id) => D.campaigns.find((b) => b.id === id),
    conversations: () => D.conversations, events: () => D.events, daily: () => D.daily, team: () => D.team, activity: () => D.activity, settings: () => D.settings, tags: () => D.tags,
    log(action, detail) { D.activity.unshift({ who: D.team[0].name, action, detail, at: nowIso() }); },
    ui: () => X, groups: () => X.groups, group: (id) => X.groups.find((g) => g.id === id), savedFilters: () => X.savedFilters, plans: () => PLANS,
  };
  /* the write side. Demo: in memory, returns at once. Live: the live store (Supabase, workflows), returns a promise.
     Arguments are what the views hold (a conversation, a contact, a campaign or template object). */
  const notYet = (what) => { throw new Error(what + ' is not available yet in this version.'); };
  const demoOps = {
    dismissChecklist() { X.checklistDismissed = true; },
    readConv(c) { convOf(c).unread = 0; },
    assign(c, name) { convOf(c).assignee = name || null; },
    setConvStatus(c, st) { convOf(c).status = st; },
    reply(c, body, extra = {}) { const x = convOf(c); x.messages.push({ id: uid(), dir: 'out', body, at: nowIso(), status: 'sent', sender: 'staff', staff: me().name, ...extra }); x.botPaused = true; },
    replyTemplate(c, t, vals) { demoOps.reply(c, fillTemplate(t, vals), { template: t.name }); },
    note(c, text) { convOf(c).messages.push({ id: uid(), dir: 'out', body: 'Note: ' + text, note: true, at: nowIso(), status: 'read', sender: 'staff', staff: me().name }); },
    setLabels(c, labels) { X.convLabels[c.contactId] = labels; },
    ensureConversation(id) { if (!D.conversations.some((x) => x.contactId === id)) D.conversations.push({ contactId: id, status: 'open', assignee: null, unread: 0, botPaused: false, messages: [] }); },
    saveFilter(f) { X.savedFilters.push(f); },
    createGroup(name, ids) { const g = { id: uid(), name, contactIds: (ids || []).slice(), createdAt: nowIso() }; X.groups.push(g); return g; },
    renameGroup(g, name) { const x = getters.group(g.id); if (x) x.name = name; return x; },
    deleteGroup(id) { X.groups = X.groups.filter((x) => x.id !== id); },
    addToGroup(id, ids) { const g = getters.group(id); (ids || []).forEach((i) => { if (!g.contactIds.includes(i)) g.contactIds.push(i); }); },
    deleteContacts(ids) { D.contacts = D.contacts.filter((c) => !ids.includes(c.id)); D.conversations = D.conversations.filter((c) => !ids.includes(c.contactId)); X.groups.forEach((g) => { g.contactIds = g.contactIds.filter((i) => !ids.includes(i)); }); },
    setOptIn(ids, on) { ids.forEach((i) => { const c = getters.contact(i); if (c) c.optIn = !!on; }); },
    addTag(ids, t) { if (!D.tags.includes(t)) D.tags.push(t); ids.forEach((i) => { const c = getters.contact(i); if (c && !c.tags.includes(t)) c.tags.push(t); }); },
    saveContact(c, fields, groupIds, isNew) {
      Object.assign(c, fields);
      X.groups.forEach((g) => { const has = g.contactIds.includes(c.id); if (groupIds.includes(g.id) && !has) g.contactIds.push(c.id); if (!groupIds.includes(g.id) && has) g.contactIds = g.contactIds.filter((i) => i !== c.id); });
      if (isNew) D.contacts.unshift(c); return c;
    },
    /* rows: [{name, phone (digits with country code), email, city, tags}] already checked by the view */
    importRows(rows, { optIn = true, groupId = '', tags = ['imported'] } = {}) {
      const existing = new Set(D.contacts.map((c) => digitsOf(c.phone))); let added = 0, dup = 0; const g = getters.group(groupId); const ids = [];
      rows.forEach((r) => { if (existing.has(r.phone)) { dup++; return; } existing.add(r.phone); const c = { id: uid(), name: r.name || 'Contact ' + r.phone.slice(-4), phone: r.phone.slice(0, 2) + ' ' + r.phone.slice(2), email: r.email || '', city: r.city || '', optIn, tags: [...new Set([...tags, ...(r.tags || [])])], createdAt: nowIso(), note: '' }; D.contacts.unshift(c); if (g) g.contactIds.push(c.id); ids.push(c.id); added++; });
      tags.forEach((t) => { if (added && !D.tags.includes(t)) D.tags.push(t); });
      return { added, dup, ids };
    },
    /* a pasted sheet: every row's contact (existing ones are matched by number), new ones added opted in with the tag "sheet" */
    contactsFromRows(rows) {
      const ids = []; let added = 0;
      rows.forEach((r) => { let c = D.contacts.find((x) => digitsOf(x.phone) === r.phone); if (!c) { c = { id: uid(), name: r.name || 'Contact ' + r.phone.slice(-4), phone: r.phone.slice(0, 2) + ' ' + r.phone.slice(2), email: '', city: '', optIn: true, tags: ['sheet'], createdAt: nowIso(), note: '' }; D.contacts.unshift(c); added++; } ids.push(c.id); });
      if (added && !D.tags.includes('sheet')) D.tags.push('sheet');
      return { ids, added };
    },
    duplicateCampaign(src) { const copy = { ...JSON.parse(JSON.stringify(src)), id: uid(), name: src.name + ' (copy)', status: 'draft', sentAt: undefined, scheduledAt: undefined, recipients: [], createdBy: me().name }; D.campaigns.unshift(copy); return copy; },
    stageCampaign(b) { D.campaigns.unshift(b); },
    /* Save draft always makes a draft (a scheduled campaign stops being scheduled; its time is kept) */
    saveCampaign(b, isNew) { if (isNew && !D.campaigns.includes(b)) D.campaigns.unshift(b); if (b.status === 'scheduled') b.recipients = []; b.status = 'draft'; return b; },
    unschedule(b) { b.status = 'draft'; b.recipients = []; return b; },
    launchCampaign(b, isNew, aud) {
      if (isNew && !D.campaigns.includes(b)) D.campaigns.unshift(b);
      b.recipients = aud.map((c) => ({ contactId: c.id, status: 'queued' }));
      if (b.when === 'later') { b.status = 'scheduled'; b.scheduledAt = new Date(b.scheduledAt).toISOString(); getters.log('scheduled campaign', b.name); }
      else { b.status = 'sending'; b.sentAt = nowIso(); getters.log('sent campaign', b.name); simulateSend(b); }
      return b;
    },
    pauseCampaign(b) { b.status = b.status === 'paused' ? 'sending' : 'paused'; return b; },
    testSend() { return true; },
    saveTemplate(t) { t.status = 'DRAFT'; t.updatedAt = nowIso(); upsertTpl(t); return t; },
    submitTemplate(t) { t.status = 'PENDING'; t.rejectedReason = undefined; t.updatedAt = nowIso(); upsertTpl(t); return t; },
    deleteTemplate(t) { D.templates = D.templates.filter((x) => x.id !== t.id); },
    withdrawTemplate(t) { t.status = 'DRAFT'; upsertTpl(t); return t; },
    /* demo: Meta "approves" the oldest template in review; returns its name, or null when nothing changed */
    syncTemplates() { const p = D.templates.find((t) => t.status === 'PENDING'); if (!p) return null; p.status = 'APPROVED'; p.updatedAt = nowIso(); return p.name; },
    setRole(u, role) { u.role = role; },
    removeMember(u) { D.team = D.team.filter((x) => x.id !== u.id); },
    /* the demo accepts the invitation at once so the new member is visible; live keeps it pending until they sign up */
    invite(name, email, role) { D.team.push({ id: uid(), name, email, role, lastActive: nowIso() }); },
    resendInvite(i) { i.sentAt = nowIso(); },
    cancelInvite(i) { X.invites = X.invites.filter((x) => x.id !== i.id); },
    changePlan(p) { X.billing.plan = p.id; },
    saveProfile(fields) { Object.assign(D.settings.business, fields); },
    saveWaProfile(fields) { Object.assign(X.waProfile, fields); },
    saveNotifications() {},
    refreshNumber() { D.settings.whatsapp.lastEventAt = nowIso(); },
    disconnectNumber() { D.settings.whatsapp.connected = false; },
    connectManual(v) { const w = D.settings.whatsapp; Object.assign(w, { connected: true, phoneNumberId: v.phoneNumberId, wabaId: v.wabaId, verifyToken: v.verifyToken, displayName: v.displayName || w.displayName || D.settings.business.name, phone: w.phone || '+91 98765 00000', quality: w.quality || 'GREEN', tier: w.tier || '250 per day', tokenSaved: w.tokenSaved || !!v.token, appSecretSaved: w.appSecretSaved || !!v.appSecret, lastEventAt: nowIso() }); },
    deleteWorkspace() { return true; },
    connectSimulated() { const w = D.settings.whatsapp; Object.assign(w, { connected: true, displayName: w.displayName || D.settings.business.name, phone: w.phone || '+91 98765 00000', phoneNumberId: w.phoneNumberId || '1000000000000', wabaId: w.wabaId || '2000000000000', quality: 'GREEN', tier: w.tier || '1K per day', tokenSaved: true, appSecretSaved: true, lastEventAt: nowIso() }); X.webhookOk = true; },
  };
  function upsertTpl(t) { const i = D.templates.findIndex((x) => x.id === t.id); if (i >= 0) D.templates[i] = t; else D.templates.unshift(t); }
  const keyOf = (c) => c.phoneKey || digitsOf(c.phone || (getters.contact(c.contactId) || {}).phone);
  const liveOps = LIVE && {
    dismissChecklist: () => LIVE.dismissChecklist(),
    readConv: (c) => LIVE.markRead(keyOf(c)),
    assign: (c, name) => { const u = D.team.find((x) => x.name === name); return LIVE.assign(keyOf(c), name ? (u && u.id) : null); },
    setConvStatus: (c, st) => st === 'resolved' ? LIVE.resolve(keyOf(c)) : LIVE.reopen(keyOf(c)),
    reply: (c, body, extra = {}) => extra.media ? Promise.reject(new Error('Sending files from the inbox is not available yet in this version. Paste a link in the message instead.')) : LIVE.reply(keyOf(c), body),
    replyTemplate: (c, t, vals) => LIVE.replyTemplate(keyOf(c), t.name, vals),
    note: (c, text) => LIVE.note(keyOf(c), text),
    setLabels: (c, labels) => LIVE.setConvLabels(keyOf(c), labels),
    /* a contact without a chat yet: a local stand-in so the thread opens; the first template creates the real chat */
    ensureConversation(id) { if (D.conversations.some((x) => x.contactId === id)) return; const c = getters.contact(id); if (c) D.conversations.push({ contactId: id, phoneKey: c.phoneKey, phone: c.phone, status: 'open', assignee: null, unread: 0, botPaused: false, labels: [], messages: [] }); },
    saveFilter: (f) => LIVE.saveFilter(f),
    createGroup: (name, ids) => LIVE.createGroup(name, ids),
    renameGroup: (g, name) => LIVE.renameGroup(g.id, name).then(() => LIVE.group(g.id)),
    deleteGroup: (id) => LIVE.deleteGroup(id),
    addToGroup: (id, ids) => LIVE.addToGroup(id, ids),
    deleteContacts: (ids) => LIVE.deleteContacts(ids),
    setOptIn: (ids, on) => LIVE.setOptIn(ids, on),
    addTag: (ids, t) => LIVE.addTag(ids, t),
    async saveContact(c, fields, groupIds, isNew) {
      const saved = isNew ? await LIVE.addContact(Object.assign({}, fields, { phone: digitsOf(fields.phone) })) : await LIVE.updateContact(c.id, Object.assign({}, fields, { phone: digitsOf(fields.phone) }));
      for (const g of LIVE.groups()) { const has = g.contactIds.includes(saved.id), want = groupIds.includes(g.id); if (want && !has) await LIVE.addToGroup(g.id, [saved.id]); if (!want && has) await LIVE.removeFromGroup(g.id, [saved.id]); }
      return saved;
    },
    async importRows(rows, { optIn = true, groupId = '', tags = ['imported'] } = {}) { const r = await LIVE.importContacts(rows, { optIn, tags }); if (groupId && r.ids.length) await LIVE.addToGroup(groupId, r.ids); return r; },
    async contactsFromRows(rows) { const r = await LIVE.importContacts(rows, { optIn: true, tags: ['sheet'] }); return { ids: r.matched, added: r.added }; },
    duplicateCampaign: (src) => LIVE.createCampaign({ name: src.name + ' (copy)', templateId: src.templateId, audience: src.audience, vars: src.vars, throttle: src.throttle, when: 'now' }),
    stageCampaign() {},
    saveCampaign: (b) => (LIVE.campaign(b.id) ? LIVE.updateCampaign(b.id, Object.assign({}, b, { asDraft: true })) : LIVE.createCampaign(Object.assign({}, b, { asDraft: true }))),
    unschedule: (b) => LIVE.updateCampaign(b.id, Object.assign({}, b, { asDraft: true })),
    /* schedule: saved with its time (the scheduler sends it). Send now: saved, then sent in batches; resolves when done */
    async launchCampaign(b) {
      const saved = LIVE.campaign(b.id) ? await LIVE.updateCampaign(b.id, b) : await LIVE.createCampaign(b);
      if (b.when === 'later') { LIVE.log('scheduled campaign', b.name); return saved; }
      LIVE.log('sent campaign', b.name);
      await LIVE.sendCampaign(saved.id);
      return LIVE.campaign(saved.id);
    },
    pauseCampaign: () => Promise.reject(new Error('Pausing a campaign while it sends is not available yet in this version.')),
    testSend: (t, vals) => LIVE.testSend(t.id, vals, (getters.settings().business || {}).phone),
    saveTemplate: (t) => LIVE.saveTemplate(t),
    submitTemplate: (t) => LIVE.submitTemplate(t),
    deleteTemplate: (t) => LIVE.deleteTemplate(LIVE.template(t.id) || t),
    withdrawTemplate: () => Promise.reject(new Error('A template in review cannot be withdrawn at Meta. Wait for Meta\'s decision, or delete it and write a new one.')),
    syncTemplates: () => LIVE.syncTemplates().then(() => null),
    setRole: (u, role) => LIVE.setRole(u.id, role),
    removeMember: (u) => LIVE.removeMember(u.id),
    invite: (name, email, role) => LIVE.invite(email, role),
    resendInvite: (i) => LIVE.invite(i.email, i.role),
    cancelInvite: (i) => LIVE.cancelInvite(i.email),
    changePlan: () => Promise.reject(new Error('Changing the plan online comes with card payments in a later release. Write to support and we change it for you.')),
    saveProfile: (fields) => LIVE.updateSettings({ business: Object.assign({}, getters.settings().business, fields), ...(fields.name ? { name: fields.name } : {}) }),
    saveWaProfile: (fields) => LIVE.saveWaProfile(fields),
    saveNotifications: (nf) => LIVE.saveNotifications(nf),
    refreshNumber: () => LIVE.reload.workspace(),
    disconnectNumber: () => LIVE.disconnectNumber(),
    connectManual: (v) => LIVE.connectNumberManual(v),
    connectSimulated: () => notYet('A simulated connection'),
    deleteWorkspace: (name) => LIVE.requestDeletion(name),
  };
  const store = Object.assign({}, getters, LIVE ? liveOps : demoOps);
  /* runs a store write: a demo write returns at once and ok runs straight away (the demo behaves as before); a live
     write returns a promise, and a failure shows the database's or workflow's own message */
  function act(p, ok, onFail) {
    const fail = (e) => {
      const m = (e && e.message) || String(e);
      /* live: an expired session or a refused call is not a database error to show raw; sign in again */
      const rls = /row-level security|permission denied/i.test(m);
      if (isLive && window.WB_LIVE && (rls || window.WB_LIVE.isAuthError(m))) {
        /* a refused write is either an ended session or a role that may not do this: ask the server which */
        LIVE.sessionAlive().then((alive) => {
          if (alive) toast(rls ? 'Your role does not allow this.' : m, 'bad');
          else { toast('Your session ended. Sign in again.', 'bad'); setTimeout(() => { const so = LIVE.signOut; if (so) so(); else location.href = 'login.html'; }, 1500); }
        });
      } else toast(m, 'bad');
      if (onFail) onFail(e);
    };
    let v; try { v = typeof p === 'function' ? p() : p; } catch (e) { fail(e); return; }
    if (v && typeof v.then === 'function') return v.then((x) => { if (ok) ok(x); return x; }, fail);
    if (ok) ok(v); return v;
  }
  const isLive = !!LIVE;

  // ---------- routing ----------
  const VIEWS = { dash: renderDash, inbox: renderInbox, contacts: renderContacts, campaigns: renderCampaigns };
  let current = 'dash';
  function skeleton(el) { el.innerHTML = `<div class="sk-page"><div class="skeleton" style="width:220px;height:22px"></div><div class="skeleton" style="width:360px;height:14px;margin-bottom:24px"></div><div class="skeleton" style="height:64px"></div><div class="skeleton" style="height:120px"></div><div class="skeleton" style="height:260px"></div></div>`; }
  function go(view, arg) {
    if (!VIEWS[view]) view = 'dash';
    const changed = view !== current; current = view;
    $$('.nav').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'v-' + view));
    closeRail();
    const el = $('#v-' + view);
    if (changed && el.innerHTML === '') { skeleton(el); setTimeout(() => VIEWS[view](el, arg), 40); } else VIEWS[view](el, arg);
    try { history.replaceState(null, '', '#' + view); } catch {}
    window.scrollTo({ top: 0 });
  }
  $$('.nav').forEach((b) => b.addEventListener('click', () => go(b.dataset.view)));
  function closeRail() { $('#rail').classList.remove('open'); $('#menuBtn').setAttribute('aria-expanded', 'false'); }
  $('#menuBtn').addEventListener('click', () => { const open = $('#rail').classList.toggle('open'); $('#menuBtn').setAttribute('aria-expanded', String(open)); });
  $('#scrim').addEventListener('click', closeRail);
  $('#themeBtn').addEventListener('click', () => {
    const r = document.documentElement; const cur = r.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark'; r.setAttribute('data-theme', next);
    try { localStorage.setItem('wb_theme', next); } catch {}
  });
  $('#helpBtn').addEventListener('click', () => dialog({ title: 'Help and shortcuts', body: `<dl class="kv"><dt><kbd>Ctrl K</kbd></dt><dd>Search contacts, campaigns, templates and pages</dd><dt><kbd>Esc</kbd></dt><dd>Close a dialog or the menu</dd><dt><kbd>Enter</kbd></dt><dd>Send a reply in the Inbox (Shift+Enter for a new line)</dd></dl>${CFG.demo ? '<p class="small muted" style="margin-top:14px">This is a demo workspace with sample data. Nothing is sent to WhatsApp and nothing is stored on a server. Reload the page to reset it.</p>' : ''}`, foot: `<button class="btn primary" data-close2>Close</button>`, narrow: true, onOpen: (bg) => { $('[data-close2]', bg).onclick = closeModal; } }));

  // ---------- search palette ----------
  const PAGES = [['dash', 'Dashboard'], ['inbox', 'Inbox'], ['contacts', 'Contacts'], ['campaigns', 'Campaigns'], ['templates', 'Templates'], ['reports', 'Reports'], ['team', 'Team'], ['billing', 'Billing'], ['settings', 'Settings']];
  const gs = $('#globalSearch'), pal = $('#palette'); let palIdx = 0;
  // the long placeholder is cut off on phones; a short one reads better there
  const narrow = matchMedia('(max-width: 760px)'); const setPh = () => { gs.placeholder = narrow.matches ? 'Search' : 'Search contacts, campaigns, templates, pages'; }; setPh(); narrow.addEventListener('change', setPh);
  function palette(q) {
    q = q.trim().toLowerCase(); if (!q) { pal.hidden = true; return; }
    const hit = (s) => String(s || '').toLowerCase().includes(q);
    const groups = [
      ['Pages', PAGES.filter(([, n]) => hit(n)).map(([v, n]) => ({ icon: 'home', label: n, go: [v] }))],
      ['Contacts', store.contacts().filter((c) => hit(c.name) || hit(c.phone) || hit(c.email)).slice(0, 5).map((c) => ({ icon: 'contacts', label: c.name, meta: '+' + c.phone, go: ['contacts', c.id] }))],
      ['Campaigns', store.campaigns().filter((b) => hit(b.name)).slice(0, 4).map((b) => ({ icon: 'campaign', label: b.name, meta: b.status, go: ['campaigns', b.status === 'sent' || b.status === 'sending' ? { report: b.id } : { edit: b.id }] }))],
      ['Templates', store.templates().filter((t) => hit(t.name) || hit(t.body)).slice(0, 4).map((t) => ({ icon: 'template', label: t.name, meta: t.status.toLowerCase(), go: ['templates', { open: t.id }] }))],
    ].filter(([, items]) => items.length);
    const flat = groups.flatMap(([, i]) => i); palIdx = 0;
    pal.innerHTML = flat.length ? groups.map(([g, items]) => `<div class="grp">${g}</div>` + items.map((i) => `<button class="hit" data-i="${flat.indexOf(i)}" role="option">${icon(i.icon)}<span>${esc(i.label)}</span>${i.meta ? `<span class="muted">${esc(i.meta)}</span>` : ''}</button>`).join('')).join('') : `<div class="none">Nothing matches "${esc(q)}".</div>`;
    pal.hidden = false; pal._flat = flat; markPal();
    $$('.hit', pal).forEach((b) => b.onmousedown = (e) => { e.preventDefault(); pick(flat[Number(b.dataset.i)]); });
  }
  function markPal() { $$('.hit', pal).forEach((b, i) => b.classList.toggle('on', i === palIdx)); }
  function pick(h) { if (!h) return; pal.hidden = true; gs.value = ''; go(h.go[0], h.go[1]); gs.blur(); }
  gs.addEventListener('input', () => palette(gs.value));
  gs.addEventListener('focus', () => palette(gs.value));
  gs.addEventListener('blur', () => setTimeout(() => { pal.hidden = true; }, 120));
  gs.addEventListener('keydown', (e) => { const f = pal._flat || []; if (e.key === 'ArrowDown') { palIdx = Math.min(f.length - 1, palIdx + 1); markPal(); e.preventDefault(); } else if (e.key === 'ArrowUp') { palIdx = Math.max(0, palIdx - 1); markPal(); e.preventDefault(); } else if (e.key === 'Enter') { if (f.length) pick(f[palIdx]); else if (gs.value.trim()) { go('contacts', { q: gs.value.trim() }); gs.blur(); } } else if (e.key === 'Escape') { gs.value = ''; pal.hidden = true; gs.blur(); } });
  document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); gs.focus(); gs.select(); } });

  // ---------- shared pieces ----------
  const pillFor = (s) => ({ good: 'good', warn: 'warn', bad: 'bad', info: 'info', muted: 'muted', sent: 'info', delivered: 'good', read: 'good', failed: 'bad', queued: 'muted', scheduled: 'info', sending: 'warn', draft: 'muted', paused: 'warn', APPROVED: 'good', PENDING: 'warn', REJECTED: 'bad', DRAFT: 'muted', PAUSED: 'bad', open: 'info', resolved: 'muted', paid: 'good', due: 'warn', yes: 'good', no: 'muted', GREEN: 'good', YELLOW: 'warn', RED: 'bad' }[s] || 'muted');
  const pill = (s, label) => `<span class="pill ${pillFor(s)}">${esc(label || s)}</span>`;
  const statusLabel = { paid: 'Paid', due: 'Due', GREEN: 'Green', YELLOW: 'Yellow', RED: 'Red', APPROVED: 'Approved', PENDING: 'Pending review', REJECTED: 'Rejected', DRAFT: 'Draft', PAUSED: 'Paused by Meta', sent: 'Sent', sending: 'Sending', scheduled: 'Scheduled', draft: 'Draft', paused: 'Paused', delivered: 'Delivered', read: 'Read', failed: 'Failed', queued: 'Queued' };
  const spill = (s) => pill(s, statusLabel[s] || s);
  function head(title, sub, actions = '', crumb = '') { return `<div class="page-head"><div>${crumb}<h1>${esc(title)}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div>${actions ? `<div class="actions">${actions}</div>` : ''}</div>`; }
  function panel(title, body, { actions = '', sub = '', tight = false, foot = '', id = '' } = {}) { return `<section class="panel"${id ? ` id="${id}"` : ''}>${title !== null ? `<header class="panel-head"><h2>${title}${sub ? `<span class="sub">${sub}</span>` : ''}</h2>${actions}</header>` : ''}<div class="panel-body${tight ? ' tight' : ''}">${body}</div>${foot ? `<div class="panel-foot">${foot}</div>` : ''}</section>`; }
  function empty(title, text, action = '', ico = 'inbox') { return `<div class="empty">${icon(ico)}<b>${esc(title)}</b>${esc(text)}${action ? `<div>${action}</div>` : ''}</div>`; }
  function notice(kind, text, ico) { return `<div class="notice ${kind}">${icon(ico || { info: 'info', warn: 'warn', bad: 'warn', good: 'check', plain: 'info' }[kind])}<div>${text}</div></div>`; }
  const varCount = (t) => (String(t.body || '').match(/\{\{\d+\}\}/g) || []).length;
  function fillTemplate(t, vals) { let s = t.body || ''; (vals || t.examples || []).forEach((v, i) => { s = s.split('{{' + (i + 1) + '}}').join(v); }); return s; }
  const BTN_ICON = { quick_reply: 'reply', url: 'external', call: 'call' };
  function waBubble(t, vals, out = true) {
    const ht = t.headerType || (t.header ? 'text' : 'none');
    const hdr = ht === 'text' && t.header ? `<span class="hdr">${esc(fillTemplate({ body: t.header, examples: t.examples }, vals))}</span>` : ht === 'image' ? `<div class="mediabox image">${icon('image')}<span>Image header</span></div>` : ht === 'document' ? `<div class="mediabox">${icon('doc')}<span>${esc(t.headerFile || 'document.pdf')}</span></div>` : '';
    const btns = (t.buttons || []).filter((b) => b.text).map((b) => `<span>${icon(BTN_ICON[b.type] || 'reply')}${esc(b.text)}</span>`).join('');
    return `<div class="bubble ${out ? 'out' : 'in'}">${hdr}${esc(fillTemplate(t, vals))}${t.footer ? `<span class="ftr">${esc(t.footer)}</span>` : ''}<span class="meta">${fmtTime(new Date().toISOString())} ${icon('tick2', 'read')}</span>${btns ? `<div class="btnrow">${btns}</div>` : ''}</div>`;
  }
  function phone(bodyHtml, name) {
    const s = store.settings();
    return `<div class="phone" aria-label="WhatsApp preview"><div class="screen"><div class="ph"><span class="avatar sm">${esc(initials(name || s.business.name))}</span><div><div>${esc(name || s.business.name)}</div><small>Business account</small></div></div><div class="body">${bodyHtml}</div></div></div>`;
  }
  function recipientStats(b) {
    const r = b.recipients || []; const c = (f) => r.filter(f).length;
    const sent = c((x) => ['sent', 'delivered', 'read'].includes(x.status)), delivered = c((x) => ['delivered', 'read'].includes(x.status)), read = c((x) => x.status === 'read');
    return { total: r.length, queued: c((x) => x.status === 'queued'), sent, delivered, read, replied: c((x) => x.replied), failed: c((x) => x.status === 'failed') };
  }
  function applyFilter(list, f) {
    const q = (f.q || '').toLowerCase();
    return list.filter((c) => (!q || (c.name + ' ' + c.phone + ' ' + c.email + ' ' + c.city).toLowerCase().includes(q)) && (!f.tag || c.tags.includes(f.tag)) && (!f.city || c.city === f.city) && (!f.optIn || String(c.optIn) === f.optIn) && (!f.group || (store.group(f.group) || { contactIds: [] }).contactIds.includes(c.id)));
  }
  function audienceContacts(a) {
    const all = store.contacts().filter((c) => c.optIn);
    if (!a || a.kind === 'all') return all;
    if (a.kind === 'tag') return all.filter((c) => c.tags.includes(a.tag));
    if (a.kind === 'group') { const g = store.group(a.groupId); return g ? all.filter((c) => g.contactIds.includes(c.id)) : []; }
    if (a.kind === 'filter') { const f = X.savedFilters.find((x) => x.id === a.filterId); return f ? applyFilter(all, f) : []; }
    if (a.kind === 'ids' || a.kind === 'sheet') return all.filter((c) => (a.ids || []).includes(c.id));
    return all;
  }
  // Meta's error codes in plain words
  const FAIL_WORDS = [[/131026/, 'Number is not on WhatsApp'], [/131049/, 'Person has reached Meta\'s limit for marketing messages'], [/131050/, 'Person stopped marketing messages from this business'], [/131047/, 'More than 24 hours since the person last wrote; only a template can be sent'], [/132015|132012/, 'Template was paused or has a problem at Meta'], [/130472/, 'Person is part of a Meta experiment and did not receive it']];
  const failWords = (e) => { const m = FAIL_WORDS.find(([re]) => re.test(e || '')); return m ? m[1] : (e || 'Unknown reason'); };
  // approximate Meta rates per delivered message in India, shown as an estimate only
  const META_RATE = { MARKETING: 0.86, UTILITY: 0.115, AUTHENTICATION: 0.115 };
  // tiny SVG line chart: series = [{name, color, values}], labels = []
  function lineChart(series, labels) {
    const W = 600, Hh = 200, px = 36, py = 14, max = Math.max(1, ...series.flatMap((s) => s.values));
    const x = (i) => px + (i / Math.max(1, labels.length - 1)) * (W - px - 8), y = (v) => Hh - py - (v / max) * (Hh - 2 * py);
    const grid = [0, .25, .5, .75, 1].map((f) => `<line x1="${px}" x2="${W - 8}" y1="${y(max * f)}" y2="${y(max * f)}" stroke="var(--line)" stroke-width="1"/><text x="${px - 6}" y="${y(max * f) + 4}" font-size="10" text-anchor="end" fill="var(--ink-3)">${Math.round(max * f)}</text>`).join('');
    const paths = series.map((s) => { const d = s.values.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' '); const last = s.values.length - 1;
      return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" vector-effect="non-scaling-stroke"/><circle cx="${x(last).toFixed(1)}" cy="${y(s.values[last]).toFixed(1)}" r="3" fill="${s.color}"/>`; }).join('');
    const every = Math.ceil(labels.length / 6);
    const xl = labels.map((l, i) => (i % every === 0 || i === labels.length - 1) ? `<text x="${x(i)}" y="${Hh - 1}" font-size="10" text-anchor="middle" fill="var(--ink-3)">${esc(l)}</text>` : '').join('');
    return `<div class="chart"><svg viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none" role="img" aria-label="${esc(series.map((s) => s.name).join(', '))} over time">${grid}${paths}${xl}</svg></div><div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`;
  }
  function barChart(rows, color = 'var(--c1)') {
    const max = Math.max(1, ...rows.map((r) => r[1]));
    return rows.length ? `<div class="bars">${rows.map(([k, v]) => `<div class="b"><span>${esc(k)}</span><b class="num">${Number(v).toLocaleString('en-IN')}</b><div class="bar"><i style="width:${(v / max) * 100}%;background:${color}"></i></div></div>`).join('')}</div>` : '<p class="muted small">No data yet.</p>';
  }
  function wireGo(el) { $$('[data-go]', el).forEach((b) => b.addEventListener('click', () => { let a = b.dataset.arg; if (a && a[0] === '{') { try { a = JSON.parse(a); } catch {} } go(b.dataset.go, a); })); }
  function download(name, text, mime = 'text/csv') { const a = document.createElement('a'); a.href = 'data:' + mime + ';charset=utf-8,' + encodeURIComponent(text); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
  /* a text cell that starts with = + - @ (or a tab / CR) would run as a formula in Excel: a single quote in front makes it text */
  const csvCell = (v) => { let s = String(v ?? ''); if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  const csv = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\n');
  function healthStrip({ compact = false } = {}) {
    const w = store.settings().whatsapp, tpl = store.templates().filter((t) => t.status === 'APPROVED').length;
    const q = w.quality || 'GREEN', qn = { GREEN: 3, YELLOW: 2, RED: 1 }[q] || 0;
    const arcs = `<svg class="arcs" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 8v4h2l3 2V6L6 8z" fill="var(--ink-3)" stroke="none"/><path class="${qn >= 1 ? 'on' : ''}" d="M11 7.5q1.3 2.5 0 5"/><path class="${qn >= 2 ? 'on' : ''}" d="M13.5 5.5q2.3 4.5 0 9"/><path class="${qn >= 3 ? 'on' : ''}" d="M16 3.5q3.3 6.5 0 13"/></svg>`;
    if (!w.connected) return `<div class="health"><div class="h lead"><span class="dot off"></span><div><span class="k">WhatsApp number</span><span class="v">Not connected</span></div></div><div class="h"><div><span class="k">What to do</span><span class="v">Connect your number to send campaigns and receive replies</span></div></div><div class="h" style="margin-left:auto"><button class="btn primary sm" data-go="settings" data-arg="whatsapp">Connect with Meta</button></div></div>`;
    return `<div class="health${compact ? " compact" : ""}"><div class="h lead"><span class="dot"></span><div><span class="k">WhatsApp number, connected</span><span class="v">${esc(w.displayName)}, ${esc(w.phone)}</span></div></div>
      <div class="h">${arcs}<div><span class="k">Quality rating</span><span class="v">${{ GREEN: 'Green, healthy', YELLOW: 'Yellow, watch it', RED: 'Red, at risk' }[q] || q}</span></div></div>
      <div class="h"><div><span class="k">Messaging limit</span><span class="v">${esc(w.tier)} new conversations</span></div></div>
      <div class="h"><div><span class="k">Last event from Meta</span><span class="v">${ago(w.lastEventAt)}</span></div></div>
      ${compact ? '' : `<div class="h"><div><span class="k">Approved templates</span><span class="v">${tpl}</span></div></div>`}</div>`;
  }

  // ================= DASHBOARD =================
  function renderDash(el) {
    const daily = store.daily(), last7 = daily.slice(-7), prev7 = daily.slice(-14, -7);
    const sum = (arr, k) => arr.reduce((a, b) => a + b[k], 0);
    const delta = (k) => { const a = sum(last7, k), b = sum(prev7, k) || 1; const p = Math.round(((a - b) / b) * 100); return `<span class="d ${p >= 0 ? 'up' : 'down'}">${p >= 0 ? 'Up' : 'Down'} ${Math.abs(p)}% on the week before</span>`; };
    const convs = store.conversations(), unread = convs.filter((c) => c.status !== 'resolved' && c.unread > 0).length, waiting = convs.filter((c) => c.status !== 'resolved' && !c.assignee).length;
    const s = store.settings(), tpl = store.templates(), pending = tpl.filter((t) => t.status === 'PENDING').length, rejected = tpl.filter((t) => t.status === 'REJECTED').length;
    const steps = [
      [s.whatsapp.connected, 'Connect your WhatsApp number', 'A Meta pop-up, about five minutes', `<button class="btn sm primary" data-go="settings" data-arg="whatsapp">Connect with Meta</button>`],
      [tpl.some((t) => t.status === 'APPROVED'), 'Get a template approved', 'Meta reviews most templates within a day', `<button class="btn sm" data-go="templates">Write a template</button>`],
      [store.contacts().length > 0, 'Import your contacts', 'Excel or CSV, with opt-in recorded', `<button class="btn sm" data-go="contacts">Import contacts</button>`],
      [store.campaigns().some((b) => ['sent', 'sending'].includes(b.status)), 'Send your first campaign', 'Start with a test to your own number', `<button class="btn sm" data-go="campaigns" data-arg="new">New campaign</button>`],
      [store.team().length > 1, 'Invite your team', 'Agents answer replies in the shared inbox', `<button class="btn sm" data-go="team">Invite a teammate</button>`],
    ];
    const done = steps.filter((x) => x[0]).length;
    const recent = store.campaigns().filter((b) => b.status !== 'draft').slice().sort((a, b) => (b.sentAt || b.scheduledAt || '').localeCompare(a.sentAt || a.scheduledAt || '')).slice(0, 4);
    el.innerHTML = head('Dashboard', `${esc(s.business.name)}, the last 7 days.`, `<button class="btn" data-go="inbox">Open inbox</button><button class="btn primary" data-go="campaigns" data-arg="new">${icon('plus')}New campaign</button>`) +
      healthStrip() +
      (!X.checklistDismissed ? panel(done < steps.length ? `Set-up, ${done} of ${steps.length} done` : 'Set-up complete', `<div class="checklist">${steps.map(([ok, t, h, a], i) => `<div class="c ${ok ? 'done' : ''}"><i>${ok ? icon('check', 'sm') : i + 1}</i><div><b>${t}</b><span>${h}</span>${ok ? '' : a}</div></div>`).join('')}</div>`, { tight: true, actions: `<button class="btn ghost sm" id="hideChecklist">${done < steps.length ? 'Hide for now' : 'Hide'}</button>` }) : '') +
      `<div class="stats" style="margin-top:16px">
        <div class="stat"><span class="v num">${sum(last7, 'sent').toLocaleString('en-IN')}</span><span class="k">Messages sent</span>${delta('sent')}</div>
        <div class="stat"><span class="v num">${Math.round((sum(last7, 'read') / Math.max(1, sum(last7, 'delivered'))) * 100)}%</span><span class="k">Read, of delivered</span>${delta('read')}</div>
        <div class="stat"><span class="v num">${sum(last7, 'replies').toLocaleString('en-IN')}</span><span class="k">Replies received</span>${delta('replies')}</div>
        <div class="stat"><span class="v num">${sum(last7, 'failed')}</span><span class="k">Not delivered</span><span class="d">${(sum(last7, 'failed') / Math.max(1, sum(last7, 'sent')) * 100).toFixed(1)}% of sent</span></div>
      </div>
      <div class="grid2 grid-wide" style="margin-top:16px">
        ${panel('Messages, last 30 days', lineChart([{ name: 'Sent', color: 'var(--c1)', values: daily.map((d) => d.sent) }, { name: 'Read', color: 'var(--c3)', values: daily.map((d) => d.read) }, { name: 'Replies', color: 'var(--c4)', values: daily.map((d) => d.replies) }], daily.map((d) => d.date.slice(5))))}
        ${panel('Needs attention', `<div class="list flush">
          <div class="row between"><span>Unread conversations</span>${unread ? `<button class="btn sm" data-go="inbox">${unread} to read</button>` : pill('yes', 'none')}</div>
          <div class="row between"><span>Chats nobody has picked up</span>${waiting ? `<button class="btn sm" data-go="inbox" data-arg='{"seg":"unassigned"}'>${waiting} waiting</button>` : pill('yes', 'none')}</div>
          <div class="row between"><span>Templates waiting at Meta</span>${pending ? pill('PENDING', pending + ' pending') : pill('yes', 'none')}</div>
          <div class="row between"><span>Templates rejected</span>${rejected ? `<button class="btn sm" data-go="templates" data-arg='{"filter":"REJECTED"}'>${rejected} to fix</button>` : pill('yes', 'none')}</div>
          <div class="row between"><span>Campaigns sending now</span><b class="num">${store.campaigns().filter((b) => b.status === 'sending').length}</b></div>
        </div>`, { tight: true })}
      </div>
      <div class="grid2 grid-wide">
        ${panel('Recent campaigns', `<div class="table-wrap"><table><thead><tr><th scope="col">Campaign</th><th scope="col">Status</th><th scope="col" class="right">Sent</th><th scope="col" class="right hide-sm">Read</th><th scope="col" class="right hide-sm">Failed</th></tr></thead><tbody>${recent.map((b) => { const st = recipientStats(b); return `<tr class="clickable" data-go="campaigns" data-arg='${JSON.stringify(b.status === 'scheduled' ? { edit: b.id } : { report: b.id })}'><td><b>${esc(b.name)}</b><span class="sub">${b.status === 'scheduled' ? 'for ' + fmtDate(b.scheduledAt) : fmtDate(b.sentAt)}</span></td><td>${spill(b.status)}</td><td class="right num">${st.sent}</td><td class="right num hide-sm">${st.read}</td><td class="right num hide-sm">${st.failed}</td></tr>`; }).join('')}</tbody></table></div>`, { tight: true, actions: `<button class="btn ghost sm" data-go="campaigns">All campaigns</button>` })}
        ${panel('Recent activity', `<div class="list flush">${store.activity().slice(0, 7).map((a) => `<div><div><span class="muted">${esc(a.who)}</span> ${esc(a.action)} <b>${esc(a.detail)}</b></div><div class="small muted">${ago(a.at)}</div></div>`).join('')}</div>`, { tight: true })}
      </div>`;
    const hc = $('#hideChecklist', el); if (hc) hc.onclick = () => act(() => store.dismissChecklist(), () => renderDash(el));
    wireGo(el);
  }

  // ================= INBOX =================
  let inboxState = { seg: 'open', open: null, q: '' };
  const convLabels = (c) => X.convLabels[c.contactId] || (X.convLabels[c.contactId] = []);
  function windowState(c) {
    const lastIn = [...c.messages].reverse().find((m) => m.dir === 'in');
    if (!lastIn) return { open: false, text: 'The contact has not written yet. Only an approved template can start the conversation.', short: 'No window yet' };
    const left = 24 * 3600000 - (Date.now() - new Date(lastIn.at));
    if (left <= 0) return { open: false, text: 'The 24-hour window has closed. Only an approved template can be sent until the contact writes again.', short: 'Window closed' };
    const h = Math.floor(left / 3600000), m = Math.floor((left % 3600000) / 60000);
    return { open: true, soon: left < 2 * 3600000, left, text: `Free replies for ${h} h ${m} min more, 24 hours from the contact's last message.`, short: `${h} h ${m} min left` };
  }
  function renderInbox(el, arg) {
    if (arg && arg.open) inboxState.open = arg.open; if (arg && arg.seg) inboxState.seg = arg.seg;
    const my = me().name;
    /* a chat with no messages yet (opened from a contact's "Message") is listed only while it is the open one */
    const convs = store.conversations().map((c) => ({ ...c, contact: store.contact(c.contactId), last: c.messages[c.messages.length - 1] || (c.contactId === inboxState.open ? { dir: 'out', body: 'New conversation', at: new Date().toISOString() } : null) })).filter((c) => c.contact && c.last).sort((a, b) => b.last.at.localeCompare(a.last.at));
    const segs = { open: ['Open', convs.filter((c) => c.status !== 'resolved')], unassigned: ['Unassigned', convs.filter((c) => c.status !== 'resolved' && !c.assignee)], mine: ['Mine', convs.filter((c) => c.assignee === my && c.status !== 'resolved')], resolved: ['Resolved', convs.filter((c) => c.status === 'resolved')] };
    let list = (segs[inboxState.seg] || segs.open)[1]; if (inboxState.q) list = list.filter((c) => (c.contact.name + c.contact.phone + c.messages.map((m) => m.body).join(' ')).toLowerCase().includes(inboxState.q.toLowerCase()));
    const open = convs.find((c) => c.contactId === inboxState.open);
    const preview = (m) => m.media ? (m.media === 'image' ? 'Photo' : 'Document') : m.body;
    el.innerHTML = head('Inbox', 'Every WhatsApp conversation on your number, shared with the team.') +
      `<div class="inbox${open ? ' has-open' : ''}">
        <div class="col list-col">
          <div class="filters"><div class="segments" role="tablist">${Object.entries(segs).map(([k, [l, v]]) => `<button class="seg ${inboxState.seg === k ? 'on' : ''}" data-seg="${k}" role="tab" aria-selected="${inboxState.seg === k}">${l}<span class="num">${v.length}</span></button>`).join('')}</div>
            <input class="input" id="inboxQ" placeholder="Search name, number or message" value="${esc(inboxState.q)}" aria-label="Search conversations"></div>
          <div class="convs">${list.length ? list.map((c) => { const w = windowState(c); const lb = convLabels(c); return `<button class="conv ${open && open.contactId === c.contactId ? 'on' : ''}" data-open="${c.contactId}"><span class="avatar">${initials(c.contact.name)}</span><div style="min-width:0"><div class="n"><span>${esc(c.contact.name)}</span>${c.assignee ? `<span class="avatar sm" title="Assigned to ${esc(c.assignee)}" style="width:20px;height:20px;font-size:9px">${initials(c.assignee)}</span>` : ''}</div><div class="p">${c.last.dir === 'out' ? 'You: ' : ''}${esc(preview(c.last))}</div>${lb.length ? `<div class="labels">${lb.map((l) => `<span class="tag">${esc(l)}</span>`).join('')}</div>` : ''}</div><div><div class="t">${ago(c.last.at).replace(' ago', '')}</div>${c.unread ? `<div class="u">${c.unread}</div>` : `<span class="w ${w.open ? '' : 'closed'}" title="${esc(w.short)}"></span>`}</div></button>`; }).join('') : empty(inboxState.q ? 'No conversation matches' : { open: 'No open conversations', unassigned: 'Everything is picked up', mine: 'Nothing assigned to you', resolved: 'Nothing resolved yet' }[inboxState.seg], inboxState.q ? 'Try another name, number or word.' : 'New messages from your contacts appear here.')}</div>
        </div>
        <div class="col thread-col">${open ? thread(open) : empty('Pick a conversation', 'Messages, delivery ticks and the 24-hour window show here.', '', 'inbox')}</div>
        <div class="col side">${open ? sidePanel(open) : `<div class="empty small">Contact details show here.</div>`}</div>
      </div>`;
    $$('[data-seg]', el).forEach((b) => b.onclick = () => { inboxState.seg = b.dataset.seg; renderInbox(el); });
    $('#inboxQ', el).oninput = (e) => { inboxState.q = e.target.value; renderInbox(el); const i = $('#inboxQ', el); i.focus(); i.setSelectionRange(99, 99); };
    $$('[data-open]', el).forEach((b) => b.onclick = () => { inboxState.open = b.dataset.open; const c = store.conversations().find((x) => x.contactId === inboxState.open); const after = () => { renderInbox(el); updateBadge(); };
      if (c && c.unread) { const p = act(() => store.readConv(c), after); if (p && p.then) after(); } else after(); });
    if (open) wireThread(el, open);
  }
  function msgBubble(m) {
    const isNote = m.note || (m.sender === 'staff' && /^Note: /.test(m.body));
    if (isNote) return `<div class="bubble note">${icon('note', 'sm')} <span class="who">Internal note, ${esc(m.staff || '')}</span>${esc(m.body.replace(/^Note: /, ''))}<span class="meta">${fmtTime(m.at)}</span></div>`;
    const who = m.sender === 'bot' || m.sender === 'system' ? 'Automated message' : m.sender === 'campaign' ? 'Campaign' + (m.template ? ': ' + m.template : '') : m.sender === 'staff' ? m.staff : '';
    const media = m.media ? `<div class="mediabox ${m.media}">${icon(m.media === 'image' ? 'image' : 'doc')}<span>${esc(m.body.replace(/^\[\w+\]\s*/, ''))}</span></div>` : '';
    const body = m.media ? (m.caption || '') : m.body;
    const tick = m.dir === 'out' ? ({ sent: icon('tick1'), delivered: icon('tick2'), read: icon('tick2', 'read'), failed: `<span class="fail">Not delivered</span>` }[m.status || 'read'] || '') : '';
    return `<div class="bubble ${m.dir}">${who ? `<span class="who">${esc(who)}</span>` : ''}${media}${esc(body)}<span class="meta">${fmtTime(m.at)}${tick}</span></div>`;
  }
  function thread(c) {
    const w = windowState(c); let lastDay = '';
    const msgs = c.messages.map((m) => { const d = fmtDate(m.at, { time: false }); const dayH = d !== lastDay ? `<div class="day">${esc(d)}</div>` : ''; lastDay = d; return dayH + msgBubble(m); }).join('');
    const approved = store.templates().filter((t) => t.status === 'APPROVED');
    return `<div class="thread-head"><button class="icon-btn back-btn" id="backBtn" aria-label="Back to the list">${icon('back')}</button><span class="avatar">${initials(c.contact.name)}</span><div class="name"><b>${esc(c.contact.name)}</b><span>+${esc(c.contact.phone)}</span></div>
        <span class="countdown ${w.open ? (w.soon ? 'soon' : '') : 'closed'}" id="countdown" title="${esc(w.text)}">${icon(w.open ? 'clock' : 'lock')}${esc(w.short)}</span>
        <select class="input auto" id="assignSel" aria-label="Assign to"><option value="">Unassigned</option>${store.team().map((u) => `<option ${c.assignee === u.name ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select>
        <button class="btn sm" id="resolveBtn">${c.status === 'resolved' ? 'Reopen' : 'Resolve'}</button></div>
      <div class="thread" id="thread">${msgs}</div>
      <div class="composer"><div class="window ${w.open ? '' : 'closed'}">${icon(w.open ? 'clock' : 'lock')}<span>${esc(w.text)}</span></div>
        ${w.open ? `<textarea class="input" id="replyBox" placeholder="Write a reply. Enter sends, Shift+Enter adds a line." aria-label="Reply"></textarea><div class="row between"><div class="row"><select class="input auto" id="quickSel" aria-label="Quick replies"><option value="">Quick replies</option>${X.quickReplies.map((f) => `<option value="${esc(f.text)}">${esc(f.title)}</option>`).join('')}</select><button class="btn sm" id="attachBtn" aria-label="Attach a file">${icon('doc')}<span class="bl">Attach</span></button><button class="btn sm" id="noteBtn" aria-label="Internal note">${icon('note')}<span class="bl">Internal note</span></button></div><button class="btn primary" id="sendBtn">${icon('send')}Send</button></div>`
                 : `<div class="row"><select class="input" id="tplSel" style="flex:1" aria-label="Template"><option value="">Choose an approved template</option>${approved.map((t) => `<option value="${t.id}">${esc(t.name)} (${t.category.toLowerCase()})</option>`).join('')}</select><button class="btn primary" id="sendTplBtn">Send template</button><button class="btn sm" id="noteBtn">${icon('note')}Note</button></div>`}
      </div>`;
  }
  function sidePanel(c) {
    const ct = c.contact, sent = store.campaigns().filter((b) => (b.recipients || []).some((r) => r.contactId === ct.id)), lb = convLabels(c);
    return `<section><div class="row"><span class="avatar lg">${initials(ct.name)}</span><div><b>${esc(ct.name)}</b><div class="small muted">+${esc(ct.phone)}</div></div></div>
        <dl class="kv"><dt>Email</dt><dd>${esc(ct.email || 'none')}</dd><dt>City</dt><dd>${esc(ct.city || 'unknown')}</dd><dt>Opt-in</dt><dd>${ct.optIn ? pill('yes', 'Opted in') : pill('bad', 'Opted out')}</dd><dt>Since</dt><dd>${fmtDate(ct.createdAt, { time: false })}</dd></dl>
        <button class="btn sm" data-go="contacts" data-arg="${ct.id}">Open contact</button></section>
      <section><h4>Labels <button class="btn ghost sm" id="labelBtn">Edit</button></h4><div class="chips">${lb.map((l) => `<span class="tag">${esc(l)}</span>`).join('') || '<span class="small muted">No labels yet</span>'}</div></section>
      <section><h4>Tags</h4><div class="chips">${ct.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('') || '<span class="small muted">none</span>'}</div></section>
      <section><h4>Conversation</h4><dl class="kv"><dt>Status</dt><dd>${pill(c.status === 'resolved' ? 'resolved' : 'open', c.status === 'resolved' ? 'Resolved' : 'Open')}</dd><dt>Assigned</dt><dd>${esc(c.assignee || 'Nobody yet')}</dd><dt>Messages</dt><dd>${c.messages.length}</dd></dl></section>
      <section><h4>Campaigns received</h4><div class="stack" style="gap:6px">${sent.length ? sent.map((b) => `<div class="small">${esc(b.name)}<span class="muted">, ${fmtDate(b.sentAt || b.scheduledAt, { time: false })}</span></div>`).join('') : '<span class="muted small">None yet</span>'}</div></section>
      ${ct.note ? `<section><h4>Team note</h4><div class="notice plain small">${esc(ct.note)}</div></section>` : ''}`;
  }
  let cdTimer = null;
  function wireThread(el, c) {
    const th = $('#thread', el); if (th) th.scrollTop = th.scrollHeight;
    const bb = $('#backBtn', el); if (bb) bb.onclick = () => { inboxState.open = null; renderInbox(el); };
    $('#assignSel', el).onchange = (e) => { const who = e.target.value || null; act(() => store.assign(c, who), () => { toast(who ? 'Assigned to ' + who : 'Unassigned'); renderInbox(el); }, () => renderInbox(el)); };
    $('#resolveBtn', el).onclick = () => { const next = c.status === 'resolved' ? 'open' : 'resolved'; act(() => store.setConvStatus(c, next), () => { toast(next === 'resolved' ? 'Conversation resolved' : 'Conversation reopened'); renderInbox(el); updateBadge(); }); };
    clearInterval(cdTimer); cdTimer = setInterval(() => { const cd = $('#countdown'); if (!cd || current !== 'inbox') { clearInterval(cdTimer); return; } const w = windowState(c); cd.lastChild.textContent = w.short; }, 30000);
    wireGo(el);
    const sent = () => { store.log('replied in Inbox', c.contact.name); toast(CFG.demo ? 'Reply added to the demo thread. ' + DEMO_ONLY : 'Reply sent'); renderInbox(el); };
    const send = (body, extra = {}) => { if (!body.trim()) return; const sb = $('#sendBtn', el); if (sb && isLive) sb.disabled = true; act(() => store.reply(c, body.trim(), extra), sent, () => { if (sb) sb.disabled = false; }); };
    const rb = $('#replyBox', el);
    if (rb) {
      $('#sendBtn', el).onclick = () => send(rb.value); rb.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(rb.value); } };
      $('#quickSel', el).onchange = (e) => { if (e.target.value) { rb.value = e.target.value; rb.focus(); e.target.value = ''; } };
      $('#attachBtn', el).onclick = () => { const bg = dialog({ title: 'Attach a file', sub: 'Images up to 5 MB, PDF up to 100 MB. The contact sees it as a WhatsApp attachment.', body: `<div class="dropzone">${icon('upload')}<div>Choose an image or a PDF</div><input type="file" id="attFile" accept="image/*,.pdf"></div><div class="field" style="margin-top:12px"><label for="attCap">Caption (optional)</label><input class="input" id="attCap"></div>`, foot: `<button class="btn" data-c>Cancel</button><button class="btn primary" data-k>Send attachment</button>` });
        $('[data-c]', bg).onclick = closeModal; $('[data-k]', bg).onclick = () => { const f = $('#attFile', bg).files[0]; if (!f) { toast('Choose a file first', 'bad'); return; } const kind = /^image\//.test(f.type) ? 'image' : 'document'; closeModal(); send('[' + kind + '] ' + f.name, { media: kind, caption: $('#attCap', bg).value.trim() }); }; };
    }
    $('#noteBtn', el).onclick = () => { const bg = dialog({ title: 'Internal note', sub: 'Only your team sees notes. The contact is not messaged.', body: `<textarea class="input" id="noteTxt" aria-label="Note"></textarea>`, foot: `<button class="btn" id="nc">Cancel</button><button class="btn primary" id="nk">Save note</button>` }); $('#nc', bg).onclick = closeModal; $('#nk', bg).onclick = () => { const v = $('#noteTxt', bg).value.trim(); if (!v) return; act(() => store.note(c, v), () => { closeModal(); toast('Note saved'); renderInbox(el); }); }; };
    const lbtn = $('#labelBtn', el); if (lbtn) lbtn.onclick = () => labelDialog(c, () => renderInbox(el));
    const tb = $('#sendTplBtn', el);
    if (tb) tb.onclick = () => { const t = store.template($('#tplSel', el).value); if (!t) { toast('Choose a template first', 'bad'); return; } openTemplateSendDialog(t, (vals) => act(() => store.replyTemplate(c, t, vals), sent)); };
  }
  function labelDialog(c, done) {
    const cur = new Set(convLabels(c));
    const bg = dialog({ title: 'Labels', sub: 'Labels sort conversations for the team. Pick any that apply or add a new one.', narrow: true, body: `<div class="chips" id="lbChips">${X.labels.map((l) => `<button class="chip ${cur.has(l) ? 'on' : ''}" data-l="${esc(l)}" aria-pressed="${cur.has(l)}">${esc(l)}</button>`).join('')}</div><div class="row" style="margin-top:12px"><input class="input" id="lbNew" placeholder="New label" style="flex:1" aria-label="New label"><button class="btn" id="lbAdd">Add</button></div>`, foot: `<button class="btn" id="lc">Cancel</button><button class="btn primary" id="lk">Save labels</button>` });
    const wire = () => $$('[data-l]', bg).forEach((b) => b.onclick = () => { const l = b.dataset.l; cur.has(l) ? cur.delete(l) : cur.add(l); b.classList.toggle('on'); b.setAttribute('aria-pressed', String(cur.has(l))); }); wire();
    $('#lbAdd', bg).onclick = () => { const v = $('#lbNew', bg).value.trim(); if (!v) return; if (!X.labels.includes(v)) X.labels.push(v); cur.add(v); $('#lbChips', bg).innerHTML = X.labels.map((l) => `<button class="chip ${cur.has(l) ? 'on' : ''}" data-l="${esc(l)}">${esc(l)}</button>`).join(''); $('#lbNew', bg).value = ''; wire(); };
    $('#lc', bg).onclick = closeModal; $('#lk', bg).onclick = () => act(() => store.setLabels(c, [...cur]), () => { closeModal(); toast('Labels saved'); done(); });
  }
  function openTemplateSendDialog(t, onSend) {
    const n = varCount(t);
    const bg = dialog({ title: `Send "${esc(t.name)}"`, sub: 'Fill the blanks. The preview shows what the contact receives.', wide: true, body: `<div class="grid2"><div class="stack">${Array.from({ length: n }, (_, i) => `<div class="field"><label>Blank {{${i + 1}}}</label><input class="input" data-v="${i}" value="${esc((t.examples || [])[i] || '')}"></div>`).join('') || '<p class="muted">This template has no blanks.</p>'}</div><div id="prev">${phone(waBubble(t))}</div></div>`, foot: `<button class="btn" id="tc">Cancel</button><button class="btn primary" id="tk">Send template</button>` });
    const vals = () => $$('[data-v]', bg).map((i) => i.value); $$('[data-v]', bg).forEach((i) => i.oninput = () => { $('#prev', bg).innerHTML = phone(waBubble(t, vals())); });
    $('#tc', bg).onclick = closeModal; $('#tk', bg).onclick = () => { closeModal(); onSend(vals()); };
  }
  function updateBadge() { const n = store.conversations().filter((c) => c.status !== 'resolved' && c.unread > 0).length; $('#inboxBadge').textContent = n; $('#inboxBadge').hidden = n === 0; }

  // ================= CONTACTS =================
  let cs = { q: '', tag: '', optIn: '', city: '', group: '', filter: '', page: 0, sel: new Set() };
  function renderContacts(el, arg) {
    if (arg && arg.q !== undefined) { cs = { ...cs, q: arg.q, group: '', filter: '', page: 0 }; }
    if (typeof arg === 'string') { const c = store.contact(arg); if (c) { cs = { ...cs, q: c.name, group: '', filter: '', optIn: '', tag: '', city: '', page: 0 }; } }
    const all = store.contacts();
    const list = applyFilter(all, cs);
    const PAGE = 25, pages = Math.max(1, Math.ceil(list.length / PAGE)); cs.page = Math.min(cs.page, pages - 1); const shown = list.slice(cs.page * PAGE, cs.page * PAGE + PAGE);
    const cities = [...new Set(all.map((c) => c.city).filter(Boolean))].sort();
    const dupes = new Set(); { const seen = new Map(); all.forEach((c) => { const d = digitsOf(c.phone); if (seen.has(d)) { dupes.add(c.id); dupes.add(seen.get(d)); } else seen.set(d, c.id); }); }
    const view = cs.group ? 'group' : cs.filter ? 'filter' : cs.optIn === 'true' && !cs.q && !cs.tag && !cs.city ? 'in' : cs.optIn === 'false' && !cs.q && !cs.tag && !cs.city ? 'out' : (!cs.q && !cs.tag && !cs.city && !cs.optIn ? 'all' : 'custom');
    const navBtn = (k, label, n, extra = '') => `<button class="${view === k ? 'on' : ''}" data-nav="${k}" ${extra}>${label}<span class="num muted" style="margin-left:auto">${n}</span></button>`;
    const selN = cs.sel.size;
    el.innerHTML = head('Contacts', `${plural(all.length, 'contact')}, ${all.filter((c) => c.optIn).length.toLocaleString('en-IN')} opted in to WhatsApp messages.`, `<button class="btn" id="importBtn">${icon('upload')}Import</button><button class="btn" id="exportBtn">${icon('download')}Export CSV</button><button class="btn primary" id="addBtn">${icon('plus')}Add contact</button>`) +
      `<div class="frame split">
        <div class="side-nav"><div class="subnav">${navBtn('all', 'All contacts', all.length)}${navBtn('in', 'Opted in', all.filter((c) => c.optIn).length)}${navBtn('out', 'Opted out', all.filter((c) => !c.optIn).length)}</div>
          <h4>Groups</h4><div class="subnav">${X.groups.map((g) => `<button class="${cs.group === g.id ? 'on' : ''}" data-group="${g.id}">${icon('group', 'sm')}${esc(g.name)}<span class="num muted" style="margin-left:auto">${g.contactIds.length}</span></button>`).join('') || '<span class="small muted" style="padding:4px 10px">No groups yet</span>'}</div><button class="btn sm" id="newGroup">${icon('plus')}New group</button>
          <h4>Saved filters</h4><div class="subnav">${X.savedFilters.map((f) => `<button class="${cs.filter === f.id ? 'on' : ''}" data-filter="${f.id}">${icon('filter', 'sm')}${esc(f.name)}<span class="num muted" style="margin-left:auto">${applyFilter(all, f).length}</span></button>`).join('') || '<span class="small muted" style="padding:4px 10px">None saved</span>'}</div><button class="btn sm" id="saveFilter" ${view === 'custom' ? '' : 'disabled'} title="${view === 'custom' ? 'Save the current search and filters' : 'Change the search or filters first'}">${icon('plus')}Save current filter</button></div>
        <div style="min-width:0">
          <div class="row" style="padding:12px 12px;border-bottom:1px solid var(--line)"><input class="input" id="cq" placeholder="Search name, number, email or city" value="${esc(cs.q)}" style="flex:1;min-width:180px" aria-label="Search contacts"><select class="input auto" id="ctag" aria-label="Tag"><option value="">Any tag</option>${store.tags().map((t) => `<option ${cs.tag === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select><select class="input auto" id="ccity" aria-label="City"><option value="">Any city</option>${cities.map((t) => `<option ${cs.city === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select><select class="input auto" id="copt" aria-label="Opt-in"><option value="">Opt-in: any</option><option value="true" ${cs.optIn === 'true' ? 'selected' : ''}>Opted in</option><option value="false" ${cs.optIn === 'false' ? 'selected' : ''}>Opted out</option></select>${cs.group ? `<span class="tag">${esc(store.group(cs.group).name)} <button class="icon-btn" style="width:18px;height:18px" data-clear aria-label="Leave group view">${icon('x', 'sm')}</button></span>` : ''}<span class="muted small">${list.length} match${list.length === 1 ? '' : 'es'}</span></div>
          ${selN ? `<div class="bulk"><b>${selN} selected</b><button class="btn sm" data-bulk="group">Add to group</button><button class="btn sm" data-bulk="tag">Add tag</button><button class="btn sm" data-bulk="optout">Mark opted out</button><button class="btn sm danger" data-bulk="delete">Delete</button><button class="btn sm ghost" data-bulk="clear">Clear</button></div>` : ''}
          <div class="table-wrap">${shown.length ? `<table><thead><tr><th scope="col" style="width:36px"><input type="checkbox" class="check" id="selAll" aria-label="Select all on this page" ${shown.every((c) => cs.sel.has(c.id)) ? 'checked' : ''}></th><th scope="col">Name</th><th scope="col">Phone</th><th scope="col">City</th><th scope="col">Tags</th><th scope="col">Opt-in</th><th scope="col">Last message</th><th scope="col"></th></tr></thead><tbody>${shown.map((c) => `<tr class="clickable ${cs.sel.has(c.id) ? 'selected' : ''}" data-id="${c.id}"><td><input type="checkbox" class="check" data-sel="${c.id}" aria-label="Select ${esc(c.name)}" ${cs.sel.has(c.id) ? 'checked' : ''}></td><td><b>${esc(c.name)}</b>${dupes.has(c.id) ? ` <span class="pill warn" title="Another contact has this number">duplicate</span>` : ''}<span class="sub">${esc(c.email)}</span></td><td class="num">+${esc(c.phone)}</td><td>${esc(c.city)}</td><td><div class="chips" style="gap:4px">${[...new Set(c.tags)].map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div></td><td>${c.optIn ? pill('yes', 'Opted in') : pill('no', 'Opted out')}</td><td class="muted small">${c.lastMessageAt ? ago(c.lastMessageAt) : 'never'}</td><td class="right"><button class="btn sm ghost" data-msg="${c.id}">Message</button></td></tr>`).join('')}</tbody></table>` : empty('No contacts match', cs.q ? 'Try another spelling, or add this person as a new contact.' : 'Change the filters, or import a sheet.', `<button class="btn" id="addBtn2">Add contact</button>`, 'contacts')}</div>
          ${pages > 1 ? `<div class="row" style="justify-content:flex-end;padding:10px 12px;border-top:1px solid var(--line)"><button class="btn sm" id="pprev" ${cs.page === 0 ? 'disabled' : ''}>Previous</button><span class="small muted">Page ${cs.page + 1} of ${pages}</span><button class="btn sm" id="pnext" ${cs.page >= pages - 1 ? 'disabled' : ''}>Next</button></div>` : ''}
        </div></div>`;
    const re = () => renderContacts(el);
    $('#cq', el).oninput = (e) => { cs.q = e.target.value; cs.page = 0; cs.group = ''; cs.filter = ''; re(); const i = $('#cq', el); i.focus(); i.setSelectionRange(99, 99); };
    $('#ctag', el).onchange = (e) => { cs.tag = e.target.value; cs.filter = ''; cs.page = 0; re(); }; $('#copt', el).onchange = (e) => { cs.optIn = e.target.value; cs.filter = ''; cs.page = 0; re(); }; $('#ccity', el).onchange = (e) => { cs.city = e.target.value; cs.filter = ''; cs.page = 0; re(); };
    $$('[data-nav]', el).forEach((b) => b.onclick = () => { cs = { ...cs, q: '', tag: '', city: '', group: '', filter: '', optIn: { all: '', in: 'true', out: 'false' }[b.dataset.nav], page: 0 }; re(); });
    $$('[data-group]', el).forEach((b) => b.onclick = () => { cs = { ...cs, q: '', tag: '', city: '', optIn: '', filter: '', group: b.dataset.group, page: 0 }; re(); });
    $$('[data-filter]', el).forEach((b) => b.onclick = () => { const f = X.savedFilters.find((x) => x.id === b.dataset.filter); cs = { ...cs, q: f.q, tag: f.tag, city: f.city, optIn: f.optIn, group: '', filter: f.id, page: 0 }; re(); });
    const cl = $('[data-clear]', el); if (cl) cl.onclick = () => { cs.group = ''; re(); };
    $('#newGroup', el).onclick = () => groupDialog(null, re);
    $('#saveFilter', el).onclick = () => { const bg = dialog({ title: 'Save this filter', narrow: true, body: `<div class="field"><label for="sfName">Name</label><input class="input" id="sfName" placeholder="e.g. Leads in Pune"></div><p class="small muted" style="margin-top:10px">Saves: ${[cs.q && `search "${esc(cs.q)}"`, cs.tag && 'tag ' + esc(cs.tag), cs.city && 'city ' + esc(cs.city), cs.optIn && (cs.optIn === 'true' ? 'opted in' : 'opted out')].filter(Boolean).join(', ')}.</p>`, foot: `<button class="btn" data-c>Cancel</button><button class="btn primary" data-k>Save filter</button>` }); $('[data-c]', bg).onclick = closeModal; $('[data-k]', bg).onclick = () => { const n = $('#sfName', bg).value.trim(); if (!n) { $('#sfName', bg).classList.add('invalid'); return; } const f = { id: uid(), name: n, q: cs.q, tag: cs.tag, city: cs.city, optIn: cs.optIn }; act(() => store.saveFilter(f), () => { cs.filter = f.id; closeModal(); toast('Filter saved'); re(); }); }; };
    const sa = $('#selAll', el); if (sa) sa.onchange = () => { shown.forEach((c) => sa.checked ? cs.sel.add(c.id) : cs.sel.delete(c.id)); re(); };
    $$('[data-sel]', el).forEach((i) => i.onchange = () => { i.checked ? cs.sel.add(i.dataset.sel) : cs.sel.delete(i.dataset.sel); re(); });
    $$('[data-bulk]', el).forEach((b) => b.onclick = () => bulkAction(b.dataset.bulk, [...cs.sel], re));
    const pp = $('#pprev', el); if (pp) pp.onclick = () => { cs.page--; re(); }; const pn = $('#pnext', el); if (pn) pn.onclick = () => { cs.page++; re(); };
    $$('tr[data-id]', el).forEach((r) => r.onclick = (e) => { if (e.target.closest('button,input')) return; contactDialog(store.contact(r.dataset.id), re); });
    $$('[data-msg]', el).forEach((b) => b.onclick = () => { const id = b.dataset.msg; store.ensureConversation(id); go('inbox', { open: id }); });
    $('#addBtn', el).onclick = () => contactDialog(null, re); const ab2 = $('#addBtn2', el); if (ab2) ab2.onclick = () => contactDialog(null, re);
    $('#exportBtn', el).onclick = () => { download('contacts.csv', csv([['Name', 'Phone', 'Email', 'City', 'Tags', 'Opt-in'], ...list.map((c) => [c.name, c.phone, c.email, c.city, c.tags.join('|'), c.optIn ? 'yes' : 'no'])])); toast('CSV downloaded, ' + plural(list.length, 'row')); };
    $('#importBtn', el).onclick = () => importWizard(re);
  }
  function groupDialog(g, done, preselect = []) {
    const isNew = !g; g = g || { id: uid(), name: '', contactIds: preselect.slice(), createdAt: new Date().toISOString() };
    const bg = dialog({ title: isNew ? 'New group' : 'Rename group', sub: 'A group is a fixed list of contacts you pick by hand. Use a saved filter when the list should follow a rule.', narrow: true, body: `<div class="field"><label for="gName">Group name</label><input class="input" id="gName" value="${esc(g.name)}" placeholder="e.g. Diwali customers"></div>${isNew && preselect.length ? `<p class="small muted" style="margin-top:8px">${plural(preselect.length, 'selected contact')} will be added.</p>` : ''}`, foot: `${isNew ? '' : '<button class="btn danger left" id="gDel">Delete group</button>'}<button class="btn" id="gc">Cancel</button><button class="btn primary" id="gk">${isNew ? 'Create group' : 'Save'}</button>` });
    $('#gc', bg).onclick = closeModal;
    $('#gk', bg).onclick = () => { const n = $('#gName', bg).value.trim(); if (!n) { $('#gName', bg).classList.add('invalid'); return; } act(() => isNew ? store.createGroup(n, g.contactIds) : store.renameGroup(g, n), (ng) => { closeModal(); toast(isNew ? 'Group created' : 'Group saved', 'good'); done(ng || g); }); };
    const gd = $('#gDel', bg); if (gd) gd.onclick = async () => { closeModal(); if (await confirmDialog('Delete this group?', 'The contacts stay; only the list is removed.', 'Delete group', true)) act(() => store.deleteGroup(g.id), () => { if (cs.group === g.id) cs.group = ''; done(); }); };
  }
  async function bulkAction(kind, ids, done) {
    if (kind === 'clear') { cs.sel.clear(); done(); return; }
    if (kind === 'delete') { if (await confirmDialog(`Delete ${plural(ids.length, 'contact')}?`, 'Their conversation history is removed too. This cannot be undone.', 'Delete', true)) act(() => store.deleteContacts(ids), () => { store.log('deleted contacts', String(ids.length)); cs.sel.clear(); toast(plural(ids.length, 'contact') + ' deleted'); done(); }); return; }
    if (kind === 'optout') { if (await confirmDialog(`Mark ${plural(ids.length, 'contact')} as opted out?`, 'They will not receive campaigns until they opt in again.', 'Mark opted out')) act(() => store.setOptIn(ids, false), () => { cs.sel.clear(); toast('Marked as opted out'); done(); }); return; }
    if (kind === 'tag') { const bg = dialog({ title: 'Add a tag', narrow: true, body: `<div class="field"><label for="btag">Tag</label><input class="input" id="btag" list="tagList" placeholder="Pick or type a tag"><datalist id="tagList">${store.tags().map((t) => `<option value="${esc(t)}">`).join('')}</datalist></div>`, foot: `<button class="btn" data-c>Cancel</button><button class="btn primary" data-k>Add tag to ${ids.length}</button>` }); $('[data-c]', bg).onclick = closeModal; $('[data-k]', bg).onclick = () => { const t = $('#btag', bg).value.trim(); if (!t) return; act(() => store.addTag(ids, t), () => { closeModal(); cs.sel.clear(); toast('Tag added'); done(); }); }; return; }
    if (kind === 'group') { const bg = dialog({ title: 'Add to a group', narrow: true, body: `<div class="field"><label for="bgrp">Group</label><select class="input" id="bgrp">${X.groups.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}<option value="__new">New group</option></select></div>`, foot: `<button class="btn" data-c>Cancel</button><button class="btn primary" data-k>Add ${ids.length}</button>` }); $('[data-c]', bg).onclick = closeModal; $('[data-k]', bg).onclick = () => { const v = $('#bgrp', bg).value; closeModal(); if (v === '__new') { groupDialog(null, () => { cs.sel.clear(); done(); }, ids); return; } act(() => store.addToGroup(v, ids), () => { cs.sel.clear(); toast('Added to ' + store.group(v).name); done(); }); }; }
  }
  function contactDialog(c, done) {
    const isNew = !c; c = c || { id: uid(), name: '', phone: '', email: '', city: '', optIn: true, tags: [], createdAt: new Date().toISOString(), note: '' };
    const inGroups = X.groups.filter((g) => g.contactIds.includes(c.id)).map((g) => g.id);
    const bg = dialog({ title: isNew ? 'Add contact' : esc(c.name), sub: isNew ? 'One person, with the number they use on WhatsApp.' : '', body: `<div class="grid2">
      <div class="field"><label for="fn">Name</label><input class="input" id="fn" value="${esc(c.name)}" maxlength="80"></div>
      <div class="field"><label for="fp">WhatsApp number, with country code</label><input class="input" id="fp" value="${esc(c.phone)}" placeholder="91 98765 43210" inputmode="tel"><span class="err" id="fpErr"></span></div>
      <div class="field"><label for="fe">Email</label><input class="input" id="fe" type="email" value="${esc(c.email)}"></div>
      <div class="field"><label for="fc">City</label><input class="input" id="fc" value="${esc(c.city)}"></div></div>
      <div class="field" style="margin-top:12px"><span class="lbl">Tags</span><div class="chips" id="tagChips">${store.tags().map((t) => `<button class="chip ${c.tags.includes(t) ? 'on' : ''}" data-t="${esc(t)}" aria-pressed="${c.tags.includes(t)}">${esc(t)}</button>`).join('')}</div></div>
      <div class="field" style="margin-top:12px"><span class="lbl">Groups</span><div class="chips" id="grpChips">${X.groups.map((g) => `<button class="chip ${inGroups.includes(g.id) ? 'on' : ''}" data-g="${g.id}" aria-pressed="${inGroups.includes(g.id)}">${esc(g.name)}</button>`).join('') || '<span class="small muted">No groups yet</span>'}</div></div>
      <div class="field" style="margin-top:12px"><label for="fnote">Note, team only</label><input class="input" id="fnote" value="${esc(c.note)}"></div>
      <div class="row" style="margin-top:12px"><button class="switch" id="fopt" role="switch" aria-checked="${c.optIn}" aria-label="Opted in"></button><span>Agreed to receive WhatsApp messages from us</span></div>
      ${isNew ? '' : `<p class="small muted" style="margin-top:12px">Added ${fmtDate(c.createdAt, { time: false })}${c.lastMessageAt ? ', last message ' + ago(c.lastMessageAt) : ''}.</p>`}`,
      foot: `${isNew ? '' : '<button class="btn danger left" id="fdel">Delete</button>'}<button class="btn" id="fcancel">Cancel</button><button class="btn primary" id="fsave">${isNew ? 'Add contact' : 'Save changes'}</button>` });
    const sel = new Set(c.tags); $$('[data-t]', bg).forEach((b) => b.onclick = () => { const t = b.dataset.t; sel.has(t) ? sel.delete(t) : sel.add(t); b.classList.toggle('on'); b.setAttribute('aria-pressed', String(sel.has(t))); });
    const gsel = new Set(inGroups); $$('[data-g]', bg).forEach((b) => b.onclick = () => { const g = b.dataset.g; gsel.has(g) ? gsel.delete(g) : gsel.add(g); b.classList.toggle('on'); b.setAttribute('aria-pressed', String(gsel.has(g))); });
    const sw = $('#fopt', bg); sw.onclick = () => sw.setAttribute('aria-checked', sw.getAttribute('aria-checked') !== 'true');
    $('#fcancel', bg).onclick = closeModal;
    const fd = $('#fdel', bg); if (fd) fd.onclick = async () => { closeModal(); if (await confirmDialog('Delete contact?', `${c.name} and their conversation history will be removed. This cannot be undone.`, 'Delete', true)) act(() => store.deleteContacts([c.id]), () => { store.log('deleted contact', c.name); toast('Contact deleted'); done(); }); };
    $('#fp', bg).oninput = () => { const d = digitsOf($('#fp', bg).value); const dup = D.contacts.find((x) => x.id !== c.id && digitsOf(x.phone) === (d.length === 10 ? '91' + d : d)); $('#fpErr', bg).textContent = dup ? `This number already belongs to ${dup.name}.` : ''; };
    $('#fsave', bg).onclick = () => { let digits = digitsOf($('#fp', bg).value); if (digits.length === 10) digits = '91' + digits; if (digits.length < 11 || digits.length > 15) { $('#fpErr', bg).textContent = 'Enter the number with the country code, for example 91 98765 43210.'; $('#fp', bg).classList.add('invalid'); return; } if (!$('#fn', bg).value.trim()) { $('#fn', bg).classList.add('invalid'); $('#fn', bg).focus(); return; }
      const dup = D.contacts.find((x) => x.id !== c.id && digitsOf(x.phone) === digits); if (dup) { $('#fpErr', bg).textContent = `This number already belongs to ${dup.name}. Open that contact instead.`; return; }
      const fields = { name: $('#fn', bg).value.trim(), phone: digits.slice(0, 2) + ' ' + digits.slice(2), email: $('#fe', bg).value.trim(), city: $('#fc', bg).value.trim(), note: $('#fnote', bg).value.trim(), tags: [...sel], optIn: sw.getAttribute('aria-checked') === 'true' };
      act(() => store.saveContact(c, fields, [...gsel], isNew), () => { if (isNew) store.log('added contact', fields.name); closeModal(); toast(isNew ? 'Contact added' : 'Changes saved', 'good'); done(); }); };
  }
  // Import wizard: 1 choose file or paste, 2 map columns and preview, 3 result
  function importWizard(done) {
    let step = 1, rows = [], header = [], map = [], optIn = true, groupId = '', result = null;
    const bg = modal('', { wide: true });
    const guess = (h, i) => { const s = h.toLowerCase(); if (/phone|mobile|whatsapp|number/.test(s)) return 'phone'; if (/name/.test(s)) return 'name'; if (/mail/.test(s)) return 'email'; if (/city|town/.test(s)) return 'city'; if (/tag/.test(s)) return 'tags'; return i === 0 ? 'name' : i === 1 ? 'phone' : 'skip'; };
    /* a real CSV reader: a leading BOM, quoted fields with commas, doubled quotes and line breaks inside quotes; every row
       keeps the line of the file it started on, so "rows without a usable number" names lines the person can find */
    let rowLines = [];
    const readCsv = (text) => {
      text = text.replace(/^\uFEFF/, '');
      const first = text.split(/\r?\n/)[0] || ''; const delim = first.includes('\t') ? '\t' : (first.split(';').length > first.split(',').length ? ';' : ',');
      const out = []; let row = [], f = '', q = false, line = 1, start = 1;
      const push = () => { row.push(f.trim()); f = ''; if (row.some(Boolean)) out.push({ cells: row, line: start }); row = []; };
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else { if (c === '\n') line++; f += c; } }
        else if (c === '"' && f === '') q = true;
        else if (c === delim) { row.push(f.trim()); f = ''; }
        else if (c === '\r') { /* part of CRLF */ }
        else if (c === '\n') { push(); line++; start = line; }
        else f += c;
      }
      push(); return out;
    };
    const parse = (text) => { const all = readCsv(text); if (!all.length) return; const first = all[0].cells; const hasHeader = first.every((p) => !/\d{6,}/.test(p)) && first.some((p) => /name|phone|mobile|email|city|tag/i.test(p)); header = hasHeader ? first : first.map((_, i) => 'Column ' + (i + 1)); const data = hasHeader ? all.slice(1) : all; rows = data.map((r) => r.cells); rowLines = data.map((r) => r.line); map = header.map(guess); };
    const draw = () => {
      $('.modal', bg).innerHTML = `<div class="m-head"><div><h2>Import contacts</h2><p>Excel, CSV or pasted rows. We check for duplicates and keep the numbers tidy.</p></div><button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div><div class="m-body">
        <div class="steps">${['Choose a file', 'Match the columns', 'Done'].map((s, i) => `<span class="s ${i + 1 === step ? 'on' : i + 1 < step ? 'done' : ''}"><i>${i + 1 < step ? icon('check', 'sm') : i + 1}</i><span>${s}</span></span>`).join('')}</div>
        ${step === 1 ? `<div class="dropzone">${icon('upload')}<div>Choose a CSV file, or drop it here</div><input type="file" id="impFile" accept=".csv,.txt,.xlsx,.xls"></div>
          <div class="field" style="margin-top:12px"><label for="impText">Or paste rows, one contact per line</label><textarea class="input" id="impText" placeholder="Name, Phone, Email, City&#10;Asha Patel, 91 98765 11111, asha@example.com, Pune"></textarea><span class="hint">A first row with column names helps the matching.</span></div>`
        : step === 2 ? `<div class="table-wrap map-table"><table><thead><tr><th scope="col">Column in your file</th><th scope="col">Import as</th><th scope="col">First values</th></tr></thead><tbody>${header.map((h, i) => `<tr><td><b>${esc(h)}</b></td><td><select class="input" data-map="${i}">${[['skip', 'Skip this column'], ['name', 'Name'], ['phone', 'WhatsApp number'], ['email', 'Email'], ['city', 'City'], ['tags', 'Tags']].map(([v, l]) => `<option value="${v}" ${map[i] === v ? 'selected' : ''}>${l}</option>`).join('')}</select></td><td class="small muted">${esc(rows.slice(0, 3).map((r) => r[i] || '').filter(Boolean).join(', '))}</td></tr>`).join('')}</tbody></table></div>
          <p class="small muted" style="margin:10px 0">${plural(rows.length, 'row')} found. ${map.includes('phone') ? '' : '<b style="color:var(--bad)">Pick which column holds the WhatsApp number.</b>'}</p>
          <div class="grid2"><div class="field"><label for="impGroup">Add everyone to a group</label><select class="input" id="impGroup"><option value="">No group</option>${X.groups.map((g) => `<option value="${g.id}" ${groupId === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></div><div class="field"><span class="lbl">Consent</span><div class="row" style="min-height:36px"><button class="switch" id="impOpt" role="switch" aria-checked="${optIn}"></button><span class="small">These people agreed to receive WhatsApp messages</span></div></div></div>`
        : `<div class="notice ${result.bad.length ? 'warn' : 'good'}">${icon(result.bad.length ? 'warn' : 'check')}<div><b>Imported ${result.added}</b>, skipped ${result.dup} duplicate${result.dup === 1 ? '' : 's'}.${result.bad.length ? ` Rows without a usable number: ${result.bad.join(', ')}.` : ''}</div></div>
          <p class="small muted" style="margin-top:10px">Imported contacts carry the tag "imported" so you can find them. Opt-in was recorded as ${result.optIn ? 'yes' : 'no'}.</p>`}
        </div><div class="foot"><button class="btn" id="ic">${step === 3 ? 'Close' : 'Cancel'}</button>${step === 2 ? '<button class="btn" id="ib">Back</button>' : ''}${step < 3 ? `<button class="btn primary" id="ik">${step === 1 ? 'Continue' : 'Import ' + plural(rows.length, 'row')}</button>` : ''}</div>`;
      $('[data-close]', bg).onclick = closeModal; $('#ic', bg).onclick = () => { closeModal(); if (step === 3) done(); };
      const ib = $('#ib', bg); if (ib) ib.onclick = () => { step = 1; draw(); };
      const sw = $('#impOpt', bg); if (sw) sw.onclick = () => { optIn = sw.getAttribute('aria-checked') !== 'true'; sw.setAttribute('aria-checked', String(optIn)); };
      $$('[data-map]', bg).forEach((s) => s.onchange = () => { map[Number(s.dataset.map)] = s.value; draw(); });
      const ig = $('#impGroup', bg); if (ig) ig.onchange = () => { groupId = ig.value; };
      const ik = $('#ik', bg); if (ik) ik.onclick = async () => {
        if (step === 1) { const f = $('#impFile', bg).files[0]; let text = $('#impText', bg).value; if (f) { if (/\.xlsx?$/i.test(f.name)) { toast('Excel files are read by the live importer. Paste the rows or save the sheet as CSV for this demo.', 'bad'); return; } text = await f.text(); } parse(text); if (!rows.length) { toast('Nothing to import: no rows found', 'bad'); return; } step = 2; draw(); return; }
        if (!map.includes('phone')) { toast('Pick the column with the WhatsApp number', 'bad'); return; }
        const col = (r, k) => { const i = map.indexOf(k); return i >= 0 ? (r[i] || '').trim() : ''; };
        const bad = [], good = [], seen = new Set(); let dupInFile = 0;
        rows.forEach((r, i) => { let d = digitsOf(col(r, 'phone')); if (d.length === 10) d = '91' + d; if (d.length < 11 || d.length > 15) { bad.push(rowLines[i]); return; } if (seen.has(d)) { dupInFile++; return; } seen.add(d); good.push({ name: col(r, 'name'), phone: d, email: col(r, 'email'), city: col(r, 'city'), tags: col(r, 'tags').split('|').map((t) => t.trim()).filter(Boolean) }); });
        ik.disabled = true;
        act(() => store.importRows(good, { optIn, groupId }), (res) => { store.log('imported contacts', plural(res.added, 'row')); result = { added: res.added, dup: res.dup + dupInFile, bad, optIn }; step = 3; draw(); }, () => { ik.disabled = false; });
      };
    };
    draw(); focusFirst(bg);
  }

  // ================= CAMPAIGNS =================
  const THROTTLES = { gentle: ['Gentle', 20, 'About 20 messages a minute. Safest for a new number.'], steady: ['Steady', 60, 'About 60 a minute. Fine for most lists.'], fast: ['Fast', 300, 'About 300 a minute. Only for numbers with a high limit and a green rating.'] };
  function renderCampaigns(el, arg) {
    if (arg === 'new') { setTimeout(() => campaignWizard(null, () => renderCampaigns(el)), 0); }
    if (arg && arg.edit) { const b = store.campaign(arg.edit); if (b) setTimeout(() => campaignWizard(b, () => renderCampaigns(el)), 0); }
    if (arg && arg.report) { const b = store.campaign(arg.report); if (b) { campaignReport(el, b); return; } }
    const list = store.campaigns().slice().sort((a, b) => (b.sentAt || b.scheduledAt || '9') > (a.sentAt || a.scheduledAt || '9') ? 1 : -1);
    const counts = (s) => list.filter((b) => b.status === s).length;
    el.innerHTML = head('Campaigns', 'Send an approved template to a group of contacts, now or at a set time. Only opted-in contacts receive campaigns.', `<button class="btn primary" id="newCamp">${icon('plus')}New campaign</button>`) +
      `<div class="stats" style="margin-bottom:16px"><div class="stat"><span class="v num">${counts('sending')}</span><span class="k">Sending now</span></div><div class="stat"><span class="v num">${counts('scheduled')}</span><span class="k">Scheduled</span></div><div class="stat"><span class="v num">${counts('sent')}</span><span class="k">Sent</span></div><div class="stat"><span class="v num">${counts('draft')}</span><span class="k">Drafts</span></div></div>
      <div class="table-wrap">${list.length ? `<table><thead><tr><th scope="col">Campaign</th><th scope="col">Template</th><th scope="col">Audience</th><th scope="col">Status</th><th scope="col" style="min-width:180px">Progress</th><th scope="col">When</th><th scope="col"></th></tr></thead><tbody>${list.map((b) => { const s = recipientStats(b), t = store.template(b.templateId), doneN = s.sent + s.failed;
        const prog = b.status === 'sending' ? `<div class="row" style="gap:8px;flex-wrap:nowrap"><div class="bar lg" style="flex:1"><i style="width:${(doneN / Math.max(1, s.total)) * 100}%"></i></div><span class="small num muted" style="white-space:nowrap">${doneN} of ${s.total}</span></div>${s.failed ? `<span class="small" style="color:var(--bad)">${s.failed} failed</span>` : ''}` : b.status === 'sent' ? `<div class="row" style="gap:8px;flex-wrap:nowrap"><div class="bar" style="flex:1"><i style="width:${(s.delivered / Math.max(1, s.total)) * 100}%"></i></div><span class="small num muted" style="white-space:nowrap">${Math.round((s.delivered / Math.max(1, s.total)) * 100)}% delivered</span></div>` : b.status === 'scheduled' ? `<span class="small muted">${s.total} queued</span>` : `<span class="small muted">${audienceContacts(b.audience).length} estimated</span>`;
        return `<tr class="clickable" data-id="${b.id}"><td><b>${esc(b.name)}</b><span class="sub">by ${esc(b.createdBy)}</span></td><td><span class="mono">${esc(t ? t.name : 'none')}</span></td><td>${esc(b.audience.label)}</td><td>${spill(b.status)}</td><td>${prog}</td><td class="small muted">${b.status === 'scheduled' ? 'for ' + fmtDate(b.scheduledAt) : b.sentAt ? fmtDate(b.sentAt) : 'not sent'}</td><td class="right"><div class="row" style="gap:4px;justify-content:flex-end;flex-wrap:nowrap">${['sent', 'sending'].includes(b.status) ? `<button class="btn sm" data-rep="${b.id}">Report</button>` : ''}${['draft', 'scheduled'].includes(b.status) ? `<button class="btn sm" data-edit="${b.id}">Open</button>` : ''}${b.status === 'scheduled' ? `<button class="btn sm" data-unsch="${b.id}">Cancel schedule</button>` : ''}<button class="btn sm ghost" data-dup="${b.id}">Duplicate</button></div></td></tr>`; }).join('')}</tbody></table>` : empty('No campaigns yet', 'Your first campaign starts with an approved template and a group of contacts.', `<button class="btn primary" id="newCamp2">New campaign</button>`, 'campaign')}</div>`;
    const re = () => renderCampaigns(el);
    $('#newCamp', el).onclick = () => campaignWizard(null, re); const n2 = $('#newCamp2', el); if (n2) n2.onclick = () => campaignWizard(null, re);
    $$('tr[data-id]', el).forEach((r) => r.onclick = (e) => { if (e.target.closest('button')) return; const b = store.campaign(r.dataset.id); if (['draft', 'scheduled'].includes(b.status)) campaignWizard(b, re); else campaignReport(el, b); });
    $$('[data-rep]', el).forEach((b) => b.onclick = () => campaignReport(el, store.campaign(b.dataset.rep)));
    $$('[data-edit]', el).forEach((b) => b.onclick = () => campaignWizard(store.campaign(b.dataset.edit), re));
    $$('[data-unsch]', el).forEach((b) => b.onclick = () => act(() => store.unschedule(store.campaign(b.dataset.unsch)), () => { toast('Schedule cancelled. The campaign is a draft again.'); re(); }));
    $$('[data-dup]', el).forEach((b) => b.onclick = () => act(() => store.duplicateCampaign(store.campaign(b.dataset.dup)), () => { toast('Duplicated as a draft'); re(); }));
  }
  function previewVals(b, t, aud) { return (b.vars || []).map((v) => v === '{name}' ? (aud[0] ? aud[0].name.split(' ')[0] : 'Name') : v === '{city}' ? (aud[0] ? aud[0].city : 'City') : v); }
  function campaignWizard(b, done) {
    const isNew = !b; b = b || { id: uid(), name: '', templateId: '', audience: { kind: 'all', label: 'All opted-in contacts' }, status: 'draft', createdBy: me().name, recipients: [], vars: null, when: 'now', scheduledAt: '', throttle: 'steady' };
    b.throttle = b.throttle || 'steady';
    if (b.status === 'scheduled' && !b.when) b.when = 'later';
    let sending = false;   // a second click on Send while its confirm is open does nothing
    let step = 1, audMode = { all: 'all', tag: 'tag', group: 'group', filter: 'filter', sheet: 'sheet', ids: 'ids' }[b.audience.kind] || 'all', sheetText = '';
    const approved = store.templates().filter((t) => t.status === 'APPROVED');
    const bg = modal('', { wide: true });
    const draw = () => {
      const t = store.template(b.templateId), aud = audienceContacts(b.audience), n = t ? varCount(t) : 0; b.vars = b.vars || (t ? t.examples.slice(0, n) : []);
      const steps = ['Audience', 'Template', 'Personalise', 'Review and send'];
      const leftOut = store.contacts().filter((c) => !c.optIn && (b.audience.kind !== 'tag' || c.tags.includes(b.audience.tag))).length;
      const rate = t ? META_RATE[t.category] || 0.115 : 0, est = aud.length * rate;
      $('.modal', bg).innerHTML = `<div class="m-head"><div><h2>${isNew ? 'New campaign' : esc(b.name || 'Campaign')}</h2><p>${['Who receives it', 'Which approved template to send', 'Fill the blanks, the same for everyone or per contact', 'Check everything, send a test, then send or schedule'][step - 1]}</p></div><button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div><div class="m-body">
        <div class="steps">${steps.map((s, i) => `<span class="s ${i + 1 === step ? 'on' : i + 1 < step ? 'done' : ''}"><i>${i + 1 < step ? icon('check', 'sm') : i + 1}</i><span>${s}</span></span>`).join('')}</div>
        ${step === 1 ? `<div class="field"><label for="wName">Campaign name, for your team</label><input class="input" id="wName" value="${esc(b.name)}" placeholder="e.g. October payment reminders"></div>
          <div class="field" style="margin-top:14px"><span class="lbl">Who receives it</span><div class="segments">${[['all', 'Everyone opted in'], ['group', 'A group'], ['filter', 'A saved filter'], ['tag', 'A tag'], ['sheet', 'Upload a sheet']].map(([k, l]) => `<button class="seg ${audMode === k ? 'on' : ''}" data-mode="${k}">${l}</button>`).join('')}</div></div>
          ${audMode === 'group' ? `<div class="chips" style="margin-top:10px">${X.groups.map((g) => `<button class="chip ${b.audience.kind === 'group' && b.audience.groupId === g.id ? 'on' : ''}" data-k="group" data-id="${g.id}">${esc(g.name)} <span class="num">${g.contactIds.length}</span></button>`).join('') || '<span class="muted small">No groups yet. Create one on the Contacts page.</span>'}</div>` : ''}
          ${audMode === 'filter' ? `<div class="chips" style="margin-top:10px">${X.savedFilters.map((f) => `<button class="chip ${b.audience.kind === 'filter' && b.audience.filterId === f.id ? 'on' : ''}" data-k="filter" data-id="${f.id}">${esc(f.name)}</button>`).join('') || '<span class="muted small">No saved filters yet.</span>'}</div>` : ''}
          ${audMode === 'tag' ? `<div class="chips" style="margin-top:10px">${store.tags().map((tg) => `<button class="chip ${b.audience.kind === 'tag' && b.audience.tag === tg ? 'on' : ''}" data-k="tag" data-id="${esc(tg)}">${esc(tg)}</button>`).join('')}</div>` : ''}
          ${audMode === 'sheet' ? `<div class="field" style="margin-top:10px"><label for="wSheet">Paste rows, one per line: name, number</label><textarea class="input" id="wSheet" placeholder="Asha Patel, 91 98765 11111">${esc(sheetText)}</textarea><span class="hint">Numbers already in Contacts are matched; new ones are added as opted-in contacts with the tag "sheet". In the live product this accepts Excel and CSV files.</span></div><button class="btn sm" id="wSheetUse" style="margin-top:8px">Use these rows</button>` : ''}
          ${audMode === 'ids' ? `<div class="notice plain" style="margin-top:10px">${icon('info')}<div>${esc(b.audience.label)}</div></div>` : ''}
          <div class="stats" style="grid-template-columns:1fr 1fr;margin-top:16px"><div class="stat"><span class="v num">${aud.length}</span><span class="k">Will receive it (opted in)</span></div><div class="stat"><span class="v num">${leftOut}</span><span class="k">Left out, not opted in</span></div></div>`
        : step === 2 ? `<div class="grid2"><div><div class="field"><label for="wTpl">Approved template</label><select class="input" id="wTpl"><option value="">Choose a template</option>${approved.map((x) => `<option value="${x.id}" ${x.id === b.templateId ? 'selected' : ''}>${esc(x.name)} (${x.category.toLowerCase()}, ${x.language})</option>`).join('')}</select><span class="hint">Only templates Meta has approved can start a conversation.${store.templates().some((x) => x.status === 'PENDING') ? ' Templates still in review are not listed.' : ''}</span></div>
          ${t && t.category === 'MARKETING' ? `<div class="notice warn" style="margin-top:12px">${icon('warn')}<div>Marketing template. Meta limits how many marketing messages each person receives from all businesses, so a share may not be delivered. Reminders and notices belong in a utility template, which is cheaper too.</div></div>` : ''}
          ${t ? `<dl class="kv" style="margin-top:14px"><dt>Category</dt><dd>${t.category.toLowerCase()}</dd><dt>Language</dt><dd>${t.language}</dd><dt>Blanks</dt><dd>${n}</dd><dt>Meta rate</dt><dd>about ${inr(rate)} per delivered message, plus GST</dd></dl>` : ''}</div><div>${t ? phone(waBubble(t)) : `<div class="empty">${icon('template')}<b>No template chosen</b>The preview appears here.</div>`}</div></div>`
        : step === 3 ? `<div class="grid2"><div class="stack">${n ? Array.from({ length: n }, (_, i) => `<div class="field"><label>Blank {{${i + 1}}}</label><select class="input" data-vsel="${i}"><option value="">Same text for everyone</option><option value="{name}" ${b.vars[i] === '{name}' ? 'selected' : ''}>Contact's first name</option><option value="{city}" ${b.vars[i] === '{city}' ? 'selected' : ''}>Contact's city</option></select><input class="input" data-v="${i}" value="${esc(b.vars[i] || '')}" placeholder="Text for this blank" aria-label="Text for blank ${i + 1}" ${/^\{(name|city)\}$/.test(b.vars[i]) ? 'hidden' : ''}></div>`).join('') : '<p class="muted">This template has no blanks to fill.</p>'}
          <div class="notice plain">${icon('info')}<div>The preview shows the first recipient, ${esc(aud[0] ? aud[0].name : 'nobody yet')}.</div></div></div><div id="wPrev">${t ? phone(waBubble(t, previewVals(b, t, aud))) : ''}</div></div>`
        : `<div class="grid2"><div class="stack">
            <dl class="kv"><dt>Name</dt><dd><b>${esc(b.name)}</b></dd><dt>Audience</dt><dd>${esc(b.audience.label)}, ${plural(aud.length, 'contact')}</dd><dt>Template</dt><dd><span class="mono">${esc(t ? t.name : '')}</span> ${t ? `<span class="tag">${t.category.toLowerCase()}</span>` : ''}</dd></dl>
            <div class="cost"><span>${aud.length} messages at about ${inr(rate)}</span><span class="num">${inr(est)}</span><span>GST 18%</span><span class="num">${inr(est * 0.18)}</span><span class="t">Estimated Meta charge</span><span class="t num">${inr(est * 1.18)}</span><span class="small muted" style="grid-column:1/-1">Charged by Meta to your WhatsApp account, for delivered messages only. Not part of your WhatsApp Blaster plan. Rates are an estimate from Meta's India rate card.</span></div>
            <div class="field"><span class="lbl">When</span><div class="segments"><button class="seg ${b.when !== 'later' ? 'on' : ''}" data-when="now">Send now</button><button class="seg ${b.when === 'later' ? 'on' : ''}" data-when="later">Schedule</button></div>${b.when === 'later' ? `<input class="input" type="datetime-local" id="wWhen" value="${esc(toLocalInput(b.scheduledAt))}" aria-label="Date and time">` : ''}</div>
            <div class="field"><label for="wThr">Sending speed</label><select class="input" id="wThr">${Object.entries(THROTTLES).map(([k, [l, n]]) => `<option value="${k}" ${b.throttle === k ? 'selected' : ''}>${l}, about ${n} a minute</option>`).join('')}</select><span class="hint">${THROTTLES[b.throttle][2]} ${plural(aud.length, 'message')} take about ${Math.max(1, Math.ceil(aud.length / THROTTLES[b.throttle][1]))} min.</span></div>
            <div class="row"><button class="btn" id="wTest">${icon('send')}Send a test to my number</button><span class="small muted">${esc(store.settings().business.phone)}</span></div>
            ${CFG.demo ? notice('warn', DEMO_ONLY + ' Sending here creates a demo report.') : notice('info', 'Messages go to real people. Check the preview once more.')}
          </div><div>${t ? phone(waBubble(t, previewVals(b, t, aud))) : ''}</div></div>`}
        </div><div class="foot"><button class="btn left" id="wCancel">${isNew ? 'Discard' : 'Close'}</button>${b.status === 'scheduled' ? '<button class="btn" id="wUnsched">Cancel schedule</button>' : ''}${step > 1 ? '<button class="btn" id="wBack">Back</button>' : ''}<button class="btn" id="wSave" title="${b.status === 'scheduled' ? 'Keeps your changes and the time, but the campaign will not be sent until you schedule it again' : 'Keeps your changes; nothing is sent'}">${b.status === 'scheduled' ? 'Save as draft (stops the schedule)' : 'Save draft'}</button>${step < 4 ? '<button class="btn primary" id="wNext">Continue</button>' : `<button class="btn primary" id="wSend">${b.when === 'later' ? 'Schedule' : 'Send to ' + plural(aud.length, 'contact')}</button>`}</div>`;
      const read = () => { const nm = $('#wName', bg); if (nm) b.name = nm.value.trim(); const tp = $('#wTpl', bg); if (tp && tp.value !== b.templateId) { b.templateId = tp.value; b.vars = null; } $$('[data-v]', bg).forEach((i) => { const k = Number(i.dataset.v); const sel = $$('[data-vsel]', bg)[k]; if (!sel || !sel.value) b.vars[k] = i.value; }); const w = $('#wWhen', bg); if (w) b.scheduledAt = w.value ? new Date(w.value).toISOString() : ''; const th = $('#wThr', bg); if (th) b.throttle = th.value; const sh = $('#wSheet', bg); if (sh) sheetText = sh.value; };
      $('[data-close]', bg).onclick = closeModal;
      $$('[data-mode]', bg).forEach((s) => s.onclick = () => { read(); audMode = s.dataset.mode; if (audMode === 'all') b.audience = { kind: 'all', label: 'All opted-in contacts' }; draw(); });
      $$('[data-k]', bg).forEach((c) => c.onclick = () => { read(); const k = c.dataset.k, id = c.dataset.id; b.audience = k === 'tag' ? { kind: 'tag', tag: id, label: 'Tag: ' + id } : k === 'group' ? { kind: 'group', groupId: id, label: 'Group: ' + store.group(id).name } : { kind: 'filter', filterId: id, label: 'Filter: ' + X.savedFilters.find((f) => f.id === id).name }; draw(); });
      const su = $('#wSheetUse', bg); if (su) su.onclick = () => { read(); const rowsIn = []; sheetText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((l) => { const parts = l.split(/[,;\t]/).map((p) => p.trim()); const pi = parts.findIndex((p) => digitsOf(p).length >= 10); if (pi < 0) return; let d = digitsOf(parts[pi]); if (d.length === 10) d = '91' + d; rowsIn.push({ name: parts.find((p, j) => j !== pi && /[a-zA-Z]/.test(p)) || '', phone: d }); }); if (!rowsIn.length) { toast('No usable numbers in the rows', 'bad'); return; }
        act(() => store.contactsFromRows(rowsIn), ({ ids, added }) => { b.audience = { kind: 'sheet', ids, label: `Sheet: ${plural(ids.length, 'row')}` }; toast(`${plural(ids.length, 'row')} ready, ${added} new contact${added === 1 ? '' : 's'} added`); draw(); }); };
      const tp = $('#wTpl', bg); if (tp) tp.onchange = () => { read(); draw(); };
      $$('[data-vsel]', bg).forEach((s) => s.onchange = () => { const k = Number(s.dataset.vsel); b.vars[k] = s.value || (t.examples || [])[k] || ''; draw(); });
      $$('[data-v]', bg).forEach((i) => i.oninput = () => { read(); const pv = $('#wPrev', bg); if (pv) pv.innerHTML = phone(waBubble(t, previewVals(b, t, aud))); });
      $$('[data-when]', bg).forEach((c) => c.onclick = () => { read(); b.when = c.dataset.when; draw(); });
      const th = $('#wThr', bg); if (th) th.onchange = () => { read(); draw(); };
      $('#wCancel', bg).onclick = closeModal; const wb = $('#wBack', bg); if (wb) wb.onclick = () => { read(); step--; draw(); focusFirst(bg); };
      $('#wSave', bg).onclick = () => { read(); if (!b.name) { toast('Give the campaign a name', 'bad'); step = 1; draw(); return; } if (isLive && !b.templateId) { toast('Choose a template before saving', 'bad'); return; } act(() => store.saveCampaign(b, isNew), () => { closeModal(); toast('Draft saved'); done(); }); };
      const wn = $('#wNext', bg); if (wn) wn.onclick = () => { read(); if (step === 1 && !b.name) { toast('Give the campaign a name', 'bad'); $('#wName', bg).focus(); return; }
        /* a tab chosen but nothing picked on it: never fall through to the earlier audience (everyone) */
        if (step === 1 && ['group', 'filter', 'tag', 'sheet'].includes(audMode) && b.audience.kind !== audMode) { toast({ group: 'Choose a group first', filter: 'Choose a saved filter first', tag: 'Choose a tag first', sheet: 'Paste your rows and press Use these rows first' }[audMode], 'bad'); return; } if (step === 1 && !aud.length) { toast('Nobody is opted in for this audience', 'bad'); return; } if (step === 2 && !b.templateId) { toast('Choose a template', 'bad'); return; } step++; draw(); focusFirst(bg); };
      const wt = $('#wTest', bg); if (wt) wt.onclick = () => { const tt = store.template(b.templateId); act(() => store.testSend(tt, previewVals(b, tt, aud)), () => toast(CFG.demo ? 'Test send simulated. ' + DEMO_ONLY : 'Test message sent to your number', 'good')); };
      const wu = $('#wUnsched', bg); if (wu) wu.onclick = () => act(() => store.unschedule(b), () => { closeModal(); toast('Schedule cancelled. The campaign is a draft again.'); done(); });
      const ws = $('#wSend', bg); if (ws) ws.onclick = async () => { read(); if (sending) return; if (b.when === 'later' && (!b.scheduledAt || new Date(b.scheduledAt) <= new Date())) { toast('Pick a date and time in the future', 'bad'); return; } sending = true; ws.disabled = true; if (!(await confirmDialog(b.when === 'later' ? 'Schedule this campaign?' : `Send to ${plural(aud.length, 'contact')}?`, b.when === 'later' ? `It goes to ${plural(aud.length, 'contact')} on ${fmtDate(new Date(b.scheduledAt).toISOString())}. You can cancel it until then.` : 'Each opted-in contact in the audience receives the message once. Meta charges your WhatsApp account per delivered message.', b.when === 'later' ? 'Schedule' : 'Send now'))) { sending = false; ws.disabled = false; return; }
        const later = b.when === 'later';
        const p = act(() => store.launchCampaign(b, isNew, aud), () => { if (!isLive) { toast(later ? 'Campaign scheduled' : 'Sending started. ' + (CFG.demo ? DEMO_ONLY : ''), 'good'); closeModal(); } else toast(later ? 'Campaign scheduled' : 'Campaign sent. The report updates as Meta confirms delivery.', 'good'); done(); });
        /* live: a send can take minutes (batches of about 120); the dialog closes at once and the list shows it sending */
        if (p && p.then) { closeModal(); if (!later) toast('Sending started. Keep this page open until it finishes.', 'good'); } };
    };
    draw(); focusFirst(bg);
  }
  // demo only: statuses arrive over a few seconds, like Meta's reports would
  function simulateSend(b) { if (!CFG.demo) return; let i = 0; const tick = () => { if (b.status === 'paused') { setTimeout(tick, 500); return; } const r = b.recipients[i]; if (!r) { b.status = 'sent'; if (current === 'campaigns') renderCampaigns($('#v-campaigns')); return; } const roll = Math.random(); const t = store.template(b.templateId); if (roll < 0.06 && t && t.category === 'MARKETING') { r.status = 'failed'; r.error = 'Marketing message limit for this person (131049)'; } else if (roll < 0.09) { r.status = 'failed'; r.error = 'Number is not on WhatsApp (131026)'; } else r.status = roll < 0.4 ? 'sent' : roll < 0.75 ? 'delivered' : 'read'; r.at = new Date().toISOString(); i++; if (current === 'campaigns' && i % 3 === 0) { const v = $('#v-campaigns'); if ($('#repView', v)) campaignReport(v, b); else renderCampaigns(v); } setTimeout(tick, 150); }; setTimeout(tick, 400); }
  let repState = { status: '' };
  function campaignReport(el, b) {
    const s = recipientStats(b), t = store.template(b.templateId), fails = {}; (b.recipients || []).filter((r) => r.status === 'failed').forEach((r) => { const w = failWords(r.error); fails[w] = (fails[w] || 0) + 1; });
    const pct = (n, d) => d ? Math.round((n / d) * 100) + '%' : '0%';
    let rows = (b.recipients || []); if (repState.status) rows = rows.filter((r) => repState.status === 'delivered' ? ['delivered', 'read'].includes(r.status) : r.status === repState.status);
    const rate = t ? META_RATE[t.category] || 0.115 : 0;
    el.innerHTML = head(b.name, `${esc(t ? t.name : '')}, ${esc(b.audience.label)}, ${b.status === 'sending' ? 'sending now' : 'sent ' + fmtDate(b.sentAt)}. ${spill(b.status)}`, `<button class="btn" id="csv">${icon('download')}Download CSV</button>${s.failed ? `<button class="btn" id="resendFailed">${icon('refresh')}Retry ${s.failed} failed</button>` : ''}${b.status === 'scheduled' ? `<button class="btn" id="unschedBtn">Cancel schedule</button>` : ''}${['sending', 'paused'].includes(b.status) ? `<button class="btn" id="pauseBtn">${icon(b.status === 'paused' ? 'play' : 'pause')}${b.status === 'paused' ? 'Resume' : 'Pause'}</button>` : ''}`, `<button class="crumb" id="repBack">${icon('back', 'sm')}All campaigns</button>`) +
      `<div id="repView">${b.status === 'sending' ? `<div class="panel" style="margin-bottom:16px"><div class="panel-body"><div class="row between"><b>Sending, ${s.sent + s.failed} of ${s.total}</b><span class="small muted">${THROTTLES[b.throttle || 'steady'][0]} speed</span></div><div class="bar lg" style="margin-top:8px"><i style="width:${((s.sent + s.failed) / Math.max(1, s.total)) * 100}%"></i></div></div></div>` : ''}
      <div class="funnel">${[['Audience', s.total, ''], ['Sent', s.sent, pct(s.sent, s.total)], ['Delivered', s.delivered, pct(s.delivered, s.sent)], ['Read', s.read, pct(s.read, s.delivered)], ['Replied', s.replied, pct(s.replied, s.delivered)], ['Failed', s.failed, pct(s.failed, s.total)]].map(([k, v, p]) => `<div class="step"><div class="v num">${v}</div><div class="k">${k}</div>${p ? `<div class="p">${p}${k === 'Delivered' ? ' of sent' : k === 'Read' || k === 'Replied' ? ' of delivered' : ' of audience'}</div>` : ''}</div>`).join('')}</div>
      <div class="grid2" style="margin-top:16px">
        ${panel('Why messages failed', Object.keys(fails).length ? barChart(Object.entries(fails).sort((a, b2) => b2[1] - a[1]), 'var(--bad)') + `<p class="small muted" style="margin-top:12px">Retry sends a new campaign to only these contacts. For marketing limits, a utility template usually gets through.</p>` : `<p class="muted">Nothing failed. Every message reached Meta.</p>`)}
        ${panel('Cost and timing', `<dl class="kv"><dt>Delivered messages</dt><dd class="num">${s.delivered}</dd><dt>Meta rate</dt><dd>about ${inr(rate)} each, plus GST</dd><dt>Estimated Meta charge</dt><dd class="num"><b>${inr(s.delivered * rate * 1.18)}</b> charged by Meta to your WhatsApp account</dd><dt>Started</dt><dd>${fmtDate(b.sentAt)}</dd><dt>Speed</dt><dd>${THROTTLES[b.throttle || 'steady'][0]}</dd><dt>Sent by</dt><dd>${esc(b.createdBy)}</dd></dl>`)}
      </div>
      ${panel('Recipients', `<div class="table-wrap"><table><thead><tr><th scope="col">Contact</th><th scope="col">Status</th><th scope="col">Reason</th><th scope="col">When</th><th scope="col">Replied</th></tr></thead><tbody>${rows.slice(0, 300).map((r) => { const c = store.contact(r.contactId); return `<tr><td>${esc(c ? c.name : r.contactId)}<span class="sub">${c ? '+' + esc(c.phone) : ''}</span></td><td>${spill(r.status)}</td><td class="small">${r.error ? esc(failWords(r.error)) : ''}</td><td class="small muted">${r.at ? fmtDate(r.at) : ''}</td><td>${r.replied ? icon('check', 'sm') : ''}</td></tr>`; }).join('') || `<tr><td colspan="5" class="muted" style="text-align:center;padding:24px">No recipients with this status.</td></tr>`}</tbody></table></div>`, { tight: true, actions: `<div class="segments">${[['', 'All', s.total], ['delivered', 'Delivered', s.delivered], ['read', 'Read', s.read], ['failed', 'Failed', s.failed], ['queued', 'Queued', s.queued]].map(([k, l, n]) => `<button class="seg ${repState.status === k ? 'on' : ''}" data-rs="${k}">${l}<span class="num">${n}</span></button>`).join('')}</div>` })}</div>`;
    $('#repBack', el).onclick = () => { repState.status = ''; renderCampaigns(el); };
    $$('[data-rs]', el).forEach((x) => x.onclick = () => { repState.status = x.dataset.rs; campaignReport(el, b); });
    $('#csv', el).onclick = () => { download(b.name.replace(/\W+/g, '-') + '.csv', csv([['Contact', 'Phone', 'Status', 'Reason', 'When', 'Replied'], ...(b.recipients || []).map((r) => { const c = store.contact(r.contactId); return [c ? c.name : '', c ? c.phone : '', r.status, r.error ? failWords(r.error) : '', r.at || '', r.replied ? 'yes' : '']; })])); toast('Report downloaded'); };
    const ub = $('#unschedBtn', el); if (ub) ub.onclick = () => act(() => store.unschedule(b), () => { toast('Schedule cancelled. The campaign is a draft again.'); renderCampaigns(el); });
    const pb = $('#pauseBtn', el); if (pb) pb.onclick = () => act(() => store.pauseCampaign(b), () => { toast(b.status === 'paused' ? 'Paused. Queued messages wait.' : 'Resumed'); campaignReport(el, b); });
    const rf = $('#resendFailed', el); if (rf) rf.onclick = () => { const failed = (b.recipients || []).filter((r) => r.status === 'failed').map((r) => r.contactId); const copy = { id: uid(), name: 'Retry: ' + b.name, templateId: (store.templates().find((x) => x.status === 'APPROVED' && x.category === 'UTILITY') || t).id, audience: { kind: 'ids', ids: failed, label: plural(failed.length, 'contact') + ' who did not receive "' + b.name + '"' }, status: 'draft', createdBy: me().name, recipients: [], when: 'now', throttle: 'gentle' }; store.stageCampaign(copy); campaignWizard(copy, () => renderCampaigns(el)); };
  }

  // part 2 attaches the remaining views to this object
  /* live: a change made elsewhere (a new message, a delivery status, another teammate) redraws the open view */
  if (LIVE && LIVE.onChange) LIVE.onChange(() => { if ($('#modalHost').innerHTML) return; const v = $('#v-' + current); if (v && VIEWS[current] && !(current === 'campaigns' && $('#repView', v))) VIEWS[current](v); updateBadge(); });
  window.WB = { act, isLive, planOf, LIVE, focusFirst, $, $$, esc, fmtDate, fmtTime, ago, initials, uid, plural, inr, digitsOf, icon, toast, modal, dialog, closeModal, confirmDialog, store, D, X, CFG, DEMO_ONLY, PLANS, head, panel, empty, notice, pill, spill, pillFor, fillTemplate, varCount, waBubble, phone, lineChart, barChart, go, wireGo, VIEWS, download, csv, recipientStats, audienceContacts, updateBadge, healthStrip, failWords, META_RATE, me };
})();
