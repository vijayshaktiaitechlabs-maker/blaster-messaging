/* WhatsApp Blaster console: the LIVE data layer.
   Loaded only when window.WB_CONFIG.demo is false (demo mode uses demo-data.js and never loads this file).

   What it is: one object with the same read interface the views already use (store.contacts(), store.templates(),
   store.campaigns(), store.conversations(), store.events(), store.daily(), store.team(), store.activity(),
   store.settings(), store.tags(), store.log()) plus the write methods the views need. Reads are synchronous from an
   in-memory copy that is loaded once (store.ready) and refreshed after every write and on realtime events; the views
   therefore do not change between demo and live.

   Where the data comes from: the browser talks to Supabase with the anon key + the signed-in user's session (every
   table has row-level security per workspace, see sql/product_saas.sql), and to the n8n workflows for anything that
   needs the WhatsApp token (sending, templates at Meta, Embedded Signup). No key other than the anon key is in this
   file or in the page; the build fills __SUPABASE_URL__ / __SUPABASE_ANON_KEY__ / __WEBHOOK_BASE__ in index.html.

   Shapes: the same as app/demo-data.js, so a view cannot tell the two apart. The pure mapping functions are exposed on
   window.WB_LIVE and unit-tested in tests/bench/qa-data-live.mjs against the real SQL (PGlite). */
(function () {
  'use strict';
  const LIVE = {};
  const PAGE = 1000;                       // PostgREST's page size: bigger lists are read in pages
  const digits = (p) => String(p || '').replace(/\D/g, '');
  /* the same rule as the database's wa_phone_key: 10 digits (or 0 + 10) means an Indian mobile */
  const phoneKey = (p) => { const d = digits(p); if (d.length === 10) return '91' + d; if (d.length === 11 && d[0] === '0') return '91' + d.slice(1); return d; };
  /* "91 9876543210": how the demo data shows a number (country code, space, number) */
  const prettyPhone = (k) => (k ? k.slice(0, 2) + ' ' + k.slice(2) : '');
  const iso = (v) => (v ? new Date(v).toISOString() : null);
  const day = (v) => (v ? new Date(v).toISOString().slice(0, 10) : null);
  LIVE.phoneKey = phoneKey; LIVE.prettyPhone = prettyPhone;
  /* an ended session or a call the database refuses for lack of a login: the console says "sign in again" instead of the raw error */
  LIVE.isAuthError = (m) => /jwt|session (has )?(expired|ended)|invalid (token|refresh)|refresh token|permission denied|not authenticated|\b401\b|sign in again/i.test(String(m || ''));

  // ---------- mapping: database rows -> the shapes the views read ----------
  LIVE.mapContact = function (row) {
    const key = row.phone_key || phoneKey(row.phone);
    const custom = row.custom && typeof row.custom === 'object' ? row.custom : {};
    return { id: row.id, name: row.name || row.full_name || ('Contact ' + key.slice(-4)), phone: prettyPhone(key), phoneKey: key, email: row.email || '', city: custom.city || '',
      optIn: !!row.opt_in, optInAt: iso(row.opt_in_at), optOutAt: iso(row.opt_out_at), tags: Array.isArray(row.tags) ? row.tags : [], createdAt: iso(row.created_at) || new Date().toISOString(),
      lastMessageAt: null, note: row.notes || '', source: row.source || 'manual', status: row.status || 'active', custom };
  };
  /* vars on wa_custom_templates: [{k, label, def, example}] (one per {{n}}); the views keep a plain examples array */
  const examplesFrom = (vars, body) => {
    const n = (String(body || '').match(/\{\{\d+\}\}/g) || []).length;
    const list = Array.isArray(vars) ? vars : [];
    return Array.from({ length: Math.max(n, list.length) }, (_, i) => { const v = list.find((x) => String(x.k) === String(i + 1)) || list[i]; return v ? String(v.example || '') : ''; }).slice(0, n || list.length);
  };
  /* buttons: the console edits {type:'quick_reply'|'url'|'call', text, value}; Meta and the database keep Meta's shape */
  LIVE.buttonsToMeta = (list) => (list || []).map((b) => { const t = String(b.type || '').toLowerCase();
    if (t === 'url' || t === 'URL'.toLowerCase()) return { type: 'URL', text: b.text, url: b.value || b.url || '', ...(b.example ? { example: b.example } : {}) };
    if (t === 'call' || t === 'phone_number') return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.value || b.phone_number || '' };
    return { type: 'QUICK_REPLY', text: b.text }; });
  LIVE.buttonsFromMeta = (list) => (list || []).map((b) => { const t = String(b.type || '').toUpperCase();
    if (t === 'URL') return { type: 'url', text: b.text || '', value: b.url || '' };
    if (t === 'PHONE_NUMBER') return { type: 'call', text: b.text || '', value: b.phone_number || '' };
    if (t === 'QUICK_REPLY') return { type: 'quick_reply', text: b.text || '' };
    return { type: String(b.type || '').toLowerCase(), text: b.text || '' }; });
  LIVE.mapTemplate = function (row) {
    const header = row.header && typeof row.header === 'object' ? row.header : null;
    const fmt = header && header.format ? String(header.format).toLowerCase() : '';
    return { id: row.id, name: row.name, category: String(row.category || 'MARKETING').toUpperCase(), language: row.language || 'en', status: String(row.meta_status || 'DRAFT').toUpperCase(),
      updatedAt: iso(row.updated_at) || iso(row.created_at), header: fmt === 'text' ? (header.text || '') : '', headerType: fmt || 'none', headerFile: header && (header.file_name || header.example_url) || '', headerFormat: header ? header.format : '',
      body: row.body || '', footer: row.footer || '', examples: examplesFrom(row.vars, row.body), buttons: LIVE.buttonsFromMeta(Array.isArray(row.buttons) ? row.buttons : []),
      rejectedReason: row.rejected_reason || '', metaId: row.meta_id || null, archived: row.status === 'archived', submittedAt: iso(row.submitted_at) };
  };
  /* the console's variable choices -> what Broadcast Send understands, and back */
  LIVE.varsToWorkflow = function (uiVars) {
    const out = {};
    (uiVars || []).forEach((v, i) => {
      const s = String(v == null ? '' : v);
      out[String(i + 1)] = s === '{name}' ? { src: 'first_name' } : s === '{full_name}' ? { src: 'full_name' } : /^\{col:.+\}$/.test(s) ? { src: s.slice(1, -1) } : { src: 'custom', text: s };
    });
    return out;
  };
  LIVE.varsFromWorkflow = function (wfVars) {
    const keys = Object.keys(wfVars || {}).map(Number).filter((k) => !isNaN(k)).sort((a, b) => a - b);
    return keys.map((k) => { const v = wfVars[String(k)]; if (!v) return ''; if (typeof v === 'string') return v; if (v.src === 'first_name') return '{name}'; if (v.src === 'full_name') return '{full_name}'; if (v.src && v.src.startsWith('col:')) return '{' + v.src + '}'; return String(v.text || ''); });
  };
  /* the wizard's audience -> the "segment" Broadcast Send filters members with */
  LIVE.segmentFor = function (audience) {
    const a = audience || { kind: 'all' };
    if (a.kind === 'tag' && a.tag) return { source: 'crm', tags: [a.tag] };
    if (a.kind === 'group' && a.groupId) return { source: 'crm', group_id: a.groupId };
    if (a.kind === 'sheet') return { source: 'custom_sheet', fileName: a.fileName || 'sheet' };
    if (a.kind === 'ids' || a.kind === 'filter') return { source: 'crm', ids: a.ids || [] };
    return { source: 'crm' };
  };
  LIVE.audienceFrom = function (segment, label) {
    const s = segment || {};
    if (Array.isArray(s.tags) && s.tags.length) return { kind: 'tag', tag: s.tags[0], label: label || 'Tag: ' + s.tags[0] };
    if (s.group_id) return { kind: 'group', groupId: s.group_id, label: label || 'Group' };
    if (s.source === 'custom_sheet' || s.source === 'sheet') return { kind: 'sheet', fileName: s.fileName, label: label || 'Uploaded sheet' };
    if (s.filter_id) return { kind: 'filter', filterId: s.filter_id, ids: s.ids || [], label: label || 'Saved filter' };
    if (Array.isArray(s.ids)) return { kind: 'ids', ids: s.ids, label: label || s.ids.length + ' contacts' };
    return { kind: 'all', label: label || 'All opted-in contacts' };
  };
  const RANK = { sent: 1, delivered: 2, read: 3, failed: 9 };
  /* a campaign: the broadcasts row, whose body JSON carries what Broadcast Send saved (config, progress, recipients),
     plus Meta's delivery statuses (wa_message_status rows by wamid) and who replied (conversations) */
  LIVE.mapCampaign = function (row, ctx) {
    ctx = ctx || {};
    let cfg = {}; try { cfg = typeof row.body === 'string' ? JSON.parse(row.body || '{}') : (row.body || {}); } catch (e) { cfg = {}; }
    const tplName = cfg.template || row.template_name || '';
    const tpl = (ctx.templatesByName || {})[tplName];
    const statusByWamid = ctx.statusByWamid || {};
    const contactsByKey = ctx.contactsByKey || {};
    const repliedAfter = ctx.lastInboundByKey || {};
    const sentAt = iso(row.sent_at);
    const recipients = (Array.isArray(cfg.recipients) ? cfg.recipients : []).map((r) => {
      const key = phoneKey(r.phone);
      const c = contactsByKey[key];
      const st = r.wamid ? statusByWamid[r.wamid] : null;
      let status = r.status === 'failed' ? 'failed' : 'sent';
      if (st && st.status && (RANK[st.status] || 0) > (RANK[status] || 0)) status = st.status;
      const err = r.error || (st && st.status === 'failed' ? (st.error_detail || st.error_title || '') : '');
      const lastIn = repliedAfter[key];
      return { contactId: c ? c.id : key, phone: prettyPhone(key), name: r.name || (c ? c.name : ''), status, error: err || undefined, at: iso(r.sent_at) || sentAt, wamid: r.wamid || null,
        replied: !!(lastIn && sentAt && new Date(lastIn) > new Date(sentAt)) };
    });
    const status = row.status === 'failed' ? 'failed' : ['draft', 'scheduled', 'sending', 'sent'].includes(row.status) ? row.status : 'draft';
    const scheduledAt = iso(cfg.schedule_at || (cfg.segment && cfg.segment.schedule_at));
    return { id: row.id, name: row.title || '(untitled)', templateId: tpl ? tpl.id : null, templateName: tplName, audience: LIVE.audienceFrom(cfg.segment, row.audience && row.audience !== 'all' ? row.audience : null),
      status, sentAt, scheduledAt, when: scheduledAt && status !== 'sent' ? 'later' : 'now', createdBy: cfg.created_by_email || cfg.created_by || '', createdAt: iso(row.created_at),
      recipients, vars: LIVE.varsFromWorkflow(cfg.vars), language: cfg.language || 'en', imageUrl: cfg.image_url || null, sentCount: row.sent_count || 0,
      progress: cfg.progress || null, lastError: cfg.last_error || null, stats: cfg.stats || null, throttle: cfg.throttle || LIVE.throttleName(cfg.throttle_per_minute) };
  };
  /* the wizard's sending speeds (app.js THROTTLES) as messages per minute; Broadcast Send paces by the number */
  LIVE.THROTTLE_PER_MIN = { gentle: 20, steady: 60, fast: 300 };
  LIVE.throttleName = (n) => { n = Number(n || 0); if (!n) return 'steady'; return n <= 20 ? 'gentle' : n <= 60 ? 'steady' : 'fast'; };
  /* the console's saved contact filters ({q, tag, city, optIn}), applied the same way the Contacts page applies them */
  LIVE.applyFilter = function (contacts, f) {
    f = f || {}; const q = String(f.q || '').toLowerCase();
    return (contacts || []).filter((c) => (!q || (c.name + ' ' + c.phone + ' ' + c.email + ' ' + c.city).toLowerCase().includes(q)) && (!f.tag || (c.tags || []).includes(f.tag)) && (!f.city || c.city === f.city) && (!f.optIn || String(c.optIn) === String(f.optIn)));
  };
  /* plans for the Billing page: the plans table, in the console's shape (the trial is not a plan you pick) */
  const BLURB = { starter: 'One number, a small team, your first campaigns.', growth: 'For teams that message every week and share an inbox.', business: 'Larger lists, more agents, priority support.' };
  LIVE.mapPlans = (rows) => (rows || []).filter((p) => p.code !== 'trial' && p.active !== false).sort((a, b) => (a.sort || 0) - (b.sort || 0))
    .map((p) => ({ id: p.code, name: p.name, price: Number(p.price_inr || 0), users: Number(p.max_users || 0), contacts: Number(p.max_contacts || 0), campaignsPerMonth: Number(p.max_campaigns_month || 0), blurb: BLURB[p.code] || '' }));
  LIVE.mapMessage = function (m) {
    const note = m.direction === 'note';
    const kind = m.sender_kind || (m.direction === 'in' ? 'member' : null);
    return { id: m.id, dir: m.direction === 'in' ? 'in' : 'out', body: note ? 'Note: ' + (m.body || '') : (m.body || ''), at: iso(m.created_at), status: m.direction === 'out' ? (m.status || 'sent') : undefined,
      sender: kind === 'member' ? undefined : kind === 'note' ? 'staff' : (kind || undefined), staff: m.sender_email || undefined, template: m.template_name || undefined,
      media: m.media_url ? (m.msg_type || 'file') : undefined, mediaUrl: m.media_url || undefined, error: m.error_title || undefined, wamid: m.wamid || undefined, isNote: note, note: note };
  };
  /* a conversation: the wa_inbox_list row (jsonb) plus its messages, the contact and the team member it is assigned to */
  LIVE.mapConversation = function (conv, msgs, ctx) {
    ctx = ctx || {};
    const key = conv.phone_key || phoneKey(conv.phone);
    const c = (ctx.contactsByKey || {})[key];
    const assignee = conv.assignee_user_id ? (ctx.teamById || {})[conv.assignee_user_id] : null;
    const messages = (msgs || []).map(LIVE.mapMessage).sort((a, b) => String(a.at).localeCompare(String(b.at)));
    return { contactId: c ? c.id : key, phoneKey: key, phone: prettyPhone(key), contactName: c ? c.name : (conv.member_name || prettyPhone(key)), status: conv.status === 'resolved' ? 'resolved' : 'open',
      assignee: assignee ? assignee.name : (conv.assignee_email || null), assigneeId: conv.assignee_user_id || null, unread: Number(conv.unread_count || 0), botPaused: !!(conv.bot_paused_now || conv.bot_paused),
      labels: Array.isArray(conv.labels) ? conv.labels : [], lastInboundAt: iso(conv.last_inbound_at), lastMessageAt: iso(conv.last_message_at), preview: conv.last_message_preview || '', messages };
  };
  /* the dashboard's 30-day series from Meta's status rows (one per outgoing message) and inbound messages */
  LIVE.dailyFrom = function (statusRows, inboundRows, days) {
    days = days || 30;
    const out = [], idx = {};
    for (let i = days - 1; i >= 0; i--) { const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10); idx[d] = out.length; out.push({ date: d, sent: 0, delivered: 0, read: 0, replies: 0, failed: 0, inbound: 0 }); }
    const bump = (when, k) => { const d = day(when); if (d && idx[d] !== undefined) out[idx[d]][k]++; };
    (statusRows || []).forEach((s) => { bump(s.sent_at, 'sent'); bump(s.delivered_at, 'delivered'); bump(s.read_at, 'read'); bump(s.failed_at, 'failed'); });
    (inboundRows || []).forEach((m) => { bump(m.created_at, 'inbound'); bump(m.created_at, 'replies'); });
    return out;
  };
  LIVE.mapTeam = (rows) => (rows || []).map((r) => ({ id: r.user_id, name: r.name || (r.email ? r.email.split('@')[0] : 'Team member'), email: r.email || '', role: r.role || 'agent', lastActive: iso(r.joined_at) }));
  const ACTION_TEXT = { workspace_created: 'created the workspace', invited: 'invited', role_changed: 'changed role of', member_removed: 'removed', wa_connected: 'connected a WhatsApp number', wa_disconnected: 'disconnected the WhatsApp number', opt_out: 'opt-out from', opt_in: 'opt-in from',
    template_approved: 'template approved', template_rejected: 'template rejected', template_pending: 'template submitted', inbox_assign: 'assigned a chat', inbox_resolve: 'resolved a chat', inbox_reopen: 'reopened a chat', inbox_pause: 'paused the bot', inbox_resume: 'resumed the bot' };
  LIVE.mapActivity = (rows) => (rows || []).map((a) => ({ who: a.actor_email || 'system', action: ACTION_TEXT[a.action] || String(a.action || '').replace(/_/g, ' '), detail: a.entity_id || (a.detail && a.detail.value) || '', at: iso(a.created_at) }));
  LIVE.mapEvent = (e) => ({ id: e.id, title: e.title, kind: e.kind || 'event', startsAt: iso(e.starts_at), location: e.venue || '', description: e.description || '', capacity: e.capacity, confirmed: Number(e.confirmed || 0),
    reminderTemplateId: e.reminder_template_id || '', reminderTemplate: e.reminder_template || '', remindDaysBefore: Number(e.remind_days_before || 0), audience: e.audience && e.audience.kind === 'tag' ? 'Tag: ' + e.audience.tag : 'All opted-in contacts', status: e.status || 'planned' });
  /* Settings: the wb_workspace answer (settings, number status, usage; never a token) */
  LIVE.mapSettings = function (ws, config) {
    ws = ws || {}; config = config || {};
    const s = ws.settings || {}; const bz = s.business || {}; const wa = ws.whatsapp || {}; const bot = ws.bot_config || {};
    const base = String(config.webhookBase || '');
    return {
      business: { name: bz.name || ws.name || '', tagline: bz.tagline || '', about: bz.about || '', hours: bz.hours || '', phone: bz.phone || '', email: bz.email || '', website: bz.website || '', address: bz.address || '', city: bz.city || '' },
      whatsapp: { connected: !!wa.connected, displayName: wa.displayName || '', phone: wa.phone || '', phoneNumberId: wa.phoneNumberId || '', wabaId: wa.wabaId || '', quality: wa.quality || '', tier: wa.tier || '',
        tokenSaved: !!wa.tokenSaved, appSecretSaved: !!wa.appSecretSaved, verifyToken: wa.verifyToken || '', webhookUrl: base ? base + (/[\/-]$/.test(base) ? '' : '/') + 'wa-status' : '', lastEventAt: wa.lastEventAt || null,
        connectedVia: wa.connectedVia || '', accountStatus: wa.accountStatus || '' },
      bot: { enabled: !!bot.bot_enabled, greeting: (bot.brand && bot.brand.greeting) || '', handoff: bot.human_handoff || '', ackReply: bot.ack_reply || '', pauseMinutes: Number((s.inbox && s.inbox.auto_pause_minutes) || (bot.inbox && bot.inbox.auto_pause_minutes) || 30),
        menu: Array.isArray(bot.menu) ? bot.menu : [], faq: Array.isArray(bot.faq) ? bot.faq : [] },
      ai: { enabled: false, provider: 'gemini', keyStatus: 'not configured' },
      plan: ws.plan || 'trial', trialEndsAt: iso(ws.trial_ends_at), usage: ws.usage || null, role: ws.role || null, slug: ws.slug || '', workspaceId: ws.id || null, throttlePerMinute: Number(s.throttle_per_minute || 0), timezone: s.timezone || 'Asia/Kolkata',
    };
  };
  /* contacts pasted or read from a sheet: "name, phone" per line, header row skipped, duplicates within the file dropped */
  LIVE.parseImport = function (text) {
    const seen = new Set(); const good = [], bad = [];
    String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((line, i) => {
      const parts = line.split(/[,;\t]/).map((p) => p.trim().replace(/^"|"$/g, ''));
      const pi = parts.findIndex((p) => digits(p).length >= 10);
      const name = parts.find((p, j) => j !== pi && /[a-zA-Zऀ-ൿ]/.test(p)) || '';
      if (pi < 0) { if (i === 0 && /name|phone|number/i.test(line)) return; bad.push({ row: i + 1, line }); return; }
      const key = phoneKey(parts[pi]);
      if (key.length < 11 || key.length > 15) { bad.push({ row: i + 1, line }); return; }
      if (seen.has(key)) return; seen.add(key);
      good.push({ row: i + 1, name, phone: key });
    });
    return { rows: good, bad };
  };

  // ---------- the live store ----------
  /* opts: { client: a supabase-js v2 client, workspaceId, slug, config: window.WB_CONFIG, fetch?: window.fetch, realtime?: true } */
  LIVE.createStore = function (opts) {
    const sb = opts.client, WS = opts.workspaceId, CFG = opts.config || {}, doFetch = opts.fetch || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    let SLUG = opts.slug || '';
    const D = { contacts: [], templates: [], campaigns: [], conversations: [], events: [], daily: [], team: [], activity: [], settings: LIVE.mapSettings({}, CFG), tags: [], groups: [], quickReplies: [], labels: [], plans: [] };
    /* the console's extensions (app.js "X"): the same object in demo and live. Groups, labels, quick replies and invites
       come from their tables; saved filters, notification choices, the WhatsApp profile text and the dismissed checklist
       are workspace settings (tenants.settings, saved through wb_update_settings) */
    const UI = { groups: [], savedFilters: [], labels: [], convLabels: {}, quickReplies: [], invites: [], billing: { plan: 'trial', since: null, renewsAt: null, status: 'trialing', trialEndsAt: null, invoices: [] },
      notifications: { campaignDone: true, newChat: true, templateStatus: true, qualityDrop: true, weekly: false, email: '' }, waProfile: { description: '', address: '', email: '', website: '', photo: '' }, webhookOk: false, checklistDismissed: false };
    D.ui = UI;
    const listeners = new Set();
    const emit = (what) => { listeners.forEach((fn) => { try { fn(what); } catch (e) { console.error(e); } }); };
    const me = { id: null, email: null, name: null };
    const fail = (error, what) => { const msg = (error && (error.message || error.error_description || error.hint)) || String(error); throw new Error((what ? what + ': ' : '') + msg); };
    const unwrap = ({ data, error }, what) => { if (error) fail(error, what); return data; };
    /* every row of a query, page by page (PostgREST stops at 1,000 per request) */
    async function all(build) {
      const out = [];
      for (let from = 0; ; from += PAGE) {
        const rows = unwrap(await build().range(from, from + PAGE - 1), 'read') || [];
        out.push(...rows);
        if (rows.length < PAGE) return out;
      }
    }
    /* a call to one of the n8n workflows with the signed-in session (the workflow checks the login and the role) */
    async function workflow(path, body) {
      if (!doFetch) throw new Error('No network function available.');
      const session = unwrap(await sb.auth.getSession(), 'session').session;
      if (!session) throw new Error('Your session has expired. Sign in again.');
      const base = String(CFG.webhookBase || '');
      const url = base + (/[\/-]$/.test(base) ? '' : '/') + path;
      const res = await doFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ tenant: SLUG, user_token: session.access_token }, body)) });
      let json = null; try { json = await res.json(); } catch (e) { json = null; }
      if (!res.ok || !json) throw new Error('The server did not answer (' + (res.status || 'network') + '). Try again in a minute.');
      return json;
    }
    const byKey = () => Object.fromEntries(D.contacts.map((c) => [c.phoneKey, c]));
    const teamById = () => Object.fromEntries(D.team.map((u) => [u.id, u]));

    // ----- loaders (each refreshes one part of the copy) -----
    async function loadWorkspace() {
      const ws = unwrap(await sb.rpc('wb_workspace', { p_tenant: WS }), 'workspace');
      if (!ws) throw new Error('You are not a member of this workspace.');
      SLUG = ws.slug || SLUG;
      D.settings = LIVE.mapSettings(ws, CFG);
      const st = ws.settings || {};
      UI.savedFilters = Array.isArray(st.saved_filters) ? st.saved_filters : [];
      if (st.notifications && typeof st.notifications === 'object') Object.assign(UI.notifications, st.notifications);
      if (st.wa_profile && typeof st.wa_profile === 'object') Object.assign(UI.waProfile, st.wa_profile);
      UI.checklistDismissed = !!st.checklist_dismissed;
      const wa = ws.whatsapp || {};
      /* the webhook counts as working once Meta has sent something for this number, or Embedded Signup subscribed it */
      UI.webhookOk = !!(wa.connected && wa.appSecretSaved && (wa.lastEventAt || wa.connectedVia === 'embedded_signup'));
      UI.billing.plan = ws.plan || 'trial'; UI.billing.trialEndsAt = iso(ws.trial_ends_at);
      return ws;
    }
    async function loadContacts() {
      const rows = await all(() => sb.from('wb_contacts').select('*').eq('workspace_id', WS).order('created_at', { ascending: false }));
      D.contacts = rows.map(LIVE.mapContact);
      D.tags = [...new Set(D.contacts.flatMap((c) => c.tags))].sort();
      const groups = unwrap(await sb.rpc('wb_groups', { p_tenant: WS }), 'groups') || [];
      const members = await all(() => sb.from('contact_group_members').select('group_id,member_id').eq('tenant_id', WS));
      const byGroup = {}; members.forEach((m) => { (byGroup[m.group_id] = byGroup[m.group_id] || []).push(m.member_id); });
      D.groups = groups.map((g) => ({ id: g.id, name: g.name, description: g.description || '', count: Number(g.count || 0), optedIn: Number(g.opted_in || 0), createdAt: iso(g.created_at), contactIds: byGroup[g.id] || [] }));
      UI.groups = D.groups;
    }
    async function loadTemplates() {
      const rows = await all(() => sb.from('wa_custom_templates').select('*').eq('tenant_id', WS).eq('status', 'active').order('updated_at', { ascending: false }));
      D.templates = rows.map(LIVE.mapTemplate);
    }
    async function loadCampaigns() {
      const rows = unwrap(await sb.from('broadcasts').select('*').eq('tenant_id', WS).order('created_at', { ascending: false }).limit(200), 'campaigns') || [];
      const ids = rows.filter((r) => ['sending', 'sent'].includes(r.status)).slice(0, 25).map((r) => r.id);
      let statusRows = [];
      if (ids.length) statusRows = await all(() => sb.from('wa_message_status').select('wamid,broadcast_id,status,error_title,error_detail,updated_at').eq('tenant_id', WS).in('broadcast_id', ids));
      const statusByWamid = Object.fromEntries(statusRows.map((s) => [s.wamid, s]));
      const templatesByName = Object.fromEntries(D.templates.map((t) => [t.name, t]));
      const lastInboundByKey = Object.fromEntries(D.conversations.map((c) => [c.phoneKey, c.lastInboundAt]).filter((x) => x[1]));
      D.campaigns = rows.map((r) => LIVE.mapCampaign(r, { templatesByName, statusByWamid, contactsByKey: byKey(), lastInboundByKey }));
    }
    async function loadInbox() {
      const convs = unwrap(await sb.rpc('wa_inbox_list', { p_tenant: WS, p_tab: 'all', p_q: null, p_before_at: null, p_before_key: null, p_limit: 200 }), 'inbox') || [];
      const msgs = unwrap(await sb.from('wa_messages').select('id,phone,phone_key,direction,body,msg_type,status,created_at,sender_kind,sender_email,template_name,media_url,error_title,wamid').eq('tenant_id', WS).order('created_at', { ascending: false }).limit(3000), 'messages') || [];
      const byConv = {};
      msgs.forEach((m) => { const k = m.phone_key || phoneKey(m.phone); (byConv[k] = byConv[k] || []).push(m); });
      const ctx = { contactsByKey: byKey(), teamById: teamById() };
      D.conversations = convs.map((c) => LIVE.mapConversation(c, byConv[c.phone_key] || [], ctx));
      UI.convLabels = Object.fromEntries(D.conversations.map((c) => [c.contactId, c.labels.slice()]));
      const lastByKey = Object.fromEntries(D.conversations.map((c) => [c.phoneKey, c.lastMessageAt]));
      D.contacts.forEach((c) => { c.lastMessageAt = lastByKey[c.phoneKey] || null; });
    }
    async function loadReports() {
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const statusRows = await all(() => sb.from('wa_message_status').select('sent_at,delivered_at,read_at,failed_at').eq('tenant_id', WS).gte('updated_at', since));
      const inbound = await all(() => sb.from('wa_messages').select('created_at').eq('tenant_id', WS).eq('direction', 'in').gte('created_at', since));
      D.daily = LIVE.dailyFrom(statusRows, inbound, 30);
    }
    async function loadTeam() {
      D.team = LIVE.mapTeam(unwrap(await sb.rpc('wb_team', { p_tenant: WS }), 'team') || []);
      UI.invites = (D.settings.role === 'owner' ? (unwrap(await sb.from('invites').select('id,email,role,created_at').eq('workspace_id', WS).order('created_at'), 'invites') || []) : [])
        .map((i) => ({ id: i.id, email: i.email, role: i.role, sentAt: iso(i.created_at) }));
      const { data: u } = await sb.auth.getUser();
      if (u && u.user) { me.id = u.user.id; me.email = u.user.email; const mine = D.team.find((t) => t.id === me.id); me.name = mine ? mine.name : me.email; }
    }
    async function loadActivity() {
      /* owners and admins may read the log; others get an empty list (RLS returns nothing, never an error) */
      const rows = unwrap(await sb.from('audit_log').select('actor_email,action,entity,entity_id,detail,created_at').eq('tenant_id', WS).order('created_at', { ascending: false }).limit(50), 'activity') || [];
      D.activity = LIVE.mapActivity(rows);
    }
    async function loadEvents() {
      const rows = unwrap(await sb.from('events').select('*').eq('tenant_id', WS).order('starts_at', { ascending: true }).limit(500), 'events') || [];
      const byName = Object.fromEntries(D.templates.map((t) => [t.name, t.id]));
      D.events = rows.map((e) => Object.assign(LIVE.mapEvent(e), { reminderTemplateId: byName[e.reminder_template] || '' }));
    }
    async function loadInboxExtras() {
      D.quickReplies = (unwrap(await sb.from('quick_replies').select('*').eq('tenant_id', WS).order('title'), 'quick replies') || []).map((r) => ({ id: r.id, title: r.title, text: r.body, body: r.body }));
      D.labels = (unwrap(await sb.from('conversation_labels').select('*').eq('tenant_id', WS).order('name'), 'labels') || []).map((r) => ({ id: r.id, name: r.name, color: r.color }));
      UI.quickReplies = D.quickReplies; UI.labels = D.labels.map((l) => l.name);
      D.plans = LIVE.mapPlans(unwrap(await sb.from('plans').select('*'), 'plans') || []);
      /* billing rows are readable by the owner only; others see the plan name from the workspace */
      const subs = unwrap(await sb.from('subscriptions').select('*').eq('tenant_id', WS).order('created_at', { ascending: false }).limit(12), 'billing') || [];
      if (subs[0]) Object.assign(UI.billing, { plan: subs[0].plan_code, status: subs[0].status, since: day(subs[subs.length - 1].created_at), renewsAt: day(subs[0].current_period_end) });
    }
    async function load() {
      await loadWorkspace();
      await Promise.all([loadContacts(), loadTemplates(), loadTeam(), loadInboxExtras()]);
      await loadInbox();
      await Promise.all([loadCampaigns(), loadReports(), loadActivity(), loadEvents()]);
      emit('all');
    }

    // ----- realtime: a message or conversation change refreshes the inbox (debounced) -----
    let timer = null, channel = null;
    const schedule = (what) => { clearTimeout(timer); timer = setTimeout(async () => { try { if (what === 'status') await loadCampaigns(); else { await loadInbox(); await loadCampaigns(); } emit(what); } catch (e) { console.error('live refresh failed', e); } }, 400); };
    function subscribe() {
      if (!sb.channel || opts.realtime === false) return;
      channel = sb.channel('wb-live-' + WS)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_messages', filter: 'tenant_id=eq.' + WS }, () => schedule('inbox'))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_conversations', filter: 'tenant_id=eq.' + WS }, () => schedule('inbox'))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_message_status', filter: 'tenant_id=eq.' + WS }, () => schedule('status'))
        .subscribe();
    }

    // ----- the store the views read -----
    const store = {
      contacts: () => D.contacts,
      /* a chat from a number that is not a saved contact still needs a name and number in the Inbox: a stand-in
         (not in contacts(), not opted in) is answered for its phone key */
      contact: (id) => D.contacts.find((c) => c.id === id || c.phoneKey === id) || (() => { const cv = D.conversations.find((x) => x.contactId === id || x.phoneKey === id); return cv ? { id: cv.contactId, name: cv.contactName || cv.phone, phone: cv.phone, phoneKey: cv.phoneKey, email: '', city: '', optIn: false, tags: [], createdAt: cv.lastMessageAt, lastMessageAt: cv.lastMessageAt, note: '', unsaved: true, custom: {} } : undefined; })(),
      templates: () => D.templates, template: (id) => D.templates.find((t) => t.id === id || t.name === id),
      campaigns: () => D.campaigns, campaign: (id) => D.campaigns.find((b) => b.id === id),
      conversations: () => D.conversations, events: () => D.events, daily: () => D.daily, team: () => D.team, activity: () => D.activity, settings: () => D.settings, tags: () => D.tags,
      groups: () => D.groups, group: (id) => D.groups.find((g) => g.id === id), savedFilters: () => UI.savedFilters, plans: () => D.plans, ui: () => UI,
      quickReplies: () => D.quickReplies, labels: () => D.labels, me: () => me, live: true, data: D,
      /* the activity line: written to the audit log (the database stamps who and when) */
      log(action, detail) { D.activity.unshift({ who: me.name || me.email || 'me', action, detail, at: new Date().toISOString() }); sb.from('audit_log').insert({ tenant_id: WS, action: String(action).replace(/\s+/g, '_').slice(0, 60), entity: 'console', entity_id: String(detail || '').slice(0, 200) }).then(() => {}, () => {}); },
      onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      refresh: load, reload: { contacts: loadContacts, templates: loadTemplates, campaigns: loadCampaigns, inbox: loadInbox, reports: loadReports, team: loadTeam, activity: loadActivity, events: loadEvents, workspace: loadWorkspace, extras: loadInboxExtras },
      workflow,

      // ----- contacts -----
      async addContact(c) {
        const key = phoneKey(c.phone);
        if (key.length < 11 || key.length > 15) throw new Error('Enter the number with the country code, e.g. 91 98765 43210.');
        if (D.contacts.some((x) => x.phoneKey === key)) throw new Error('A contact with this number already exists.');
        const row = { tenant_id: WS, full_name: String(c.name || '').trim() || null, phone: key, email: String(c.email || '').trim() || null, tags: c.tags || [], wa_opt_in: c.optIn !== false, notes: String(c.note || '').trim() || null, source: c.source || 'manual', custom: Object.assign({}, c.custom || {}, c.city ? { city: c.city } : {}) };
        const data = unwrap(await sb.from('members').insert(row).select('id').single(), 'add contact');
        await loadContacts(); emit('contacts');
        return store.contact(data.id);
      },
      async updateContact(id, patch) {
        const row = {};
        if (patch.name !== undefined) row.full_name = String(patch.name).trim();
        if (patch.phone !== undefined) { const key = phoneKey(patch.phone); if (key.length < 11 || key.length > 15) throw new Error('Enter the number with the country code.'); row.phone = key; }
        if (patch.email !== undefined) row.email = String(patch.email).trim() || null;
        if (patch.tags !== undefined) row.tags = patch.tags;
        if (patch.optIn !== undefined) row.wa_opt_in = !!patch.optIn;
        if (patch.note !== undefined) row.notes = String(patch.note).trim() || null;
        if (patch.city !== undefined || patch.custom !== undefined) { const cur = (store.contact(id) || {}).custom || {}; row.custom = Object.assign({}, cur, patch.custom || {}, patch.city !== undefined ? { city: patch.city } : {}); }
        unwrap(await sb.from('members').update(row).eq('id', id).eq('tenant_id', WS), 'save contact');
        await loadContacts(); emit('contacts');
        return store.contact(id);
      },
      async deleteContact(id) { unwrap(await sb.from('members').delete().eq('id', id).eq('tenant_id', WS), 'delete contact'); await loadContacts(); emit('contacts'); },
      async deleteContacts(ids) { for (let i = 0; i < (ids || []).length; i += 200) unwrap(await sb.from('members').delete().eq('tenant_id', WS).in('id', ids.slice(i, i + 200)), 'delete contacts'); await loadContacts(); await loadInbox(); emit('contacts'); },
      async setOptIn(ids, on) { for (let i = 0; i < (ids || []).length; i += 200) unwrap(await sb.from('members').update({ wa_opt_in: !!on }).eq('tenant_id', WS).in('id', ids.slice(i, i + 200)), 'opt-in'); await loadContacts(); emit('contacts'); },
      /* one more tag on each contact (tags are an array per contact, so each row is updated with its own list) */
      async addTag(ids, tag) {
        tag = String(tag || '').trim(); if (!tag) return;
        for (const id of ids || []) { const c = D.contacts.find((x) => x.id === id); if (!c || c.tags.includes(tag)) continue; unwrap(await sb.from('members').update({ tags: c.tags.concat([tag]) }).eq('id', id).eq('tenant_id', WS), 'tag'); }
        await loadContacts(); emit('contacts');
      },
      /* rows: [{name, phone}] (see LIVE.parseImport); duplicates of existing numbers are skipped by the database */
      async importContacts(rows, o) {
        o = o || {};
        const existing = new Set(D.contacts.map((c) => c.phoneKey));
        const fresh = [], seen = new Set(); let dup = 0;
        (rows || []).forEach((r) => { const key = phoneKey(r.phone); if (key.length < 11 || key.length > 15) return; if (existing.has(key) || seen.has(key)) { dup++; return; } seen.add(key);
          fresh.push({ tenant_id: WS, full_name: String(r.name || '').trim() || null, phone: key, email: r.email || null, tags: [...new Set([...(o.tags || ['imported']), ...(r.tags || [])])], wa_opt_in: o.optIn !== false, source: 'import', custom: r.custom || {} }); });
        let added = 0; const ids = [];
        for (let i = 0; i < fresh.length; i += 500) {
          const chunk = fresh.slice(i, i + 500);
          const data = unwrap(await sb.from('members').upsert(chunk, { onConflict: 'tenant_id,phone', ignoreDuplicates: true }).select('id'), 'import');
          added += (data || []).length; (data || []).forEach((r) => ids.push(r.id));
        }
        await loadContacts(); emit('contacts');
        /* ids: the new contacts; matched: every row's contact id (new or existing), for a sheet audience */
        const byKeyNow = byKey();
        const matched = [...new Set((rows || []).map((r) => (byKeyNow[phoneKey(r.phone)] || {}).id).filter(Boolean))];
        return { added, dup: dup + (fresh.length - added), total: (rows || []).length, ids, matched };
      },
      async createGroup(name, contactIds, description) {
        const g = unwrap(await sb.from('contact_groups').insert({ tenant_id: WS, name: String(name || '').trim(), description: description || null, created_by: me.id }).select('id').single(), 'create group');
        if (contactIds && contactIds.length) await store.addToGroup(g.id, contactIds);
        await loadContacts(); emit('contacts');
        return D.groups.find((x) => x.id === g.id);
      },
      async addToGroup(groupId, contactIds) {
        const rows = [...new Set(contactIds || [])].map((id) => ({ group_id: groupId, member_id: id, tenant_id: WS }));
        for (let i = 0; i < rows.length; i += 500) unwrap(await sb.from('contact_group_members').upsert(rows.slice(i, i + 500), { onConflict: 'group_id,member_id', ignoreDuplicates: true }), 'add to group');
        await loadContacts(); emit('contacts');
      },
      async removeFromGroup(groupId, contactIds) { unwrap(await sb.from('contact_group_members').delete().eq('group_id', groupId).in('member_id', contactIds || []), 'remove from group'); await loadContacts(); emit('contacts'); },
      async renameGroup(groupId, name) { unwrap(await sb.from('contact_groups').update({ name: String(name || '').trim(), updated_at: new Date().toISOString() }).eq('id', groupId).eq('tenant_id', WS), 'rename group'); await loadContacts(); emit('contacts'); },
      async deleteGroup(groupId) { unwrap(await sb.from('contact_groups').delete().eq('id', groupId).eq('tenant_id', WS), 'delete group'); await loadContacts(); emit('contacts'); },
      async groupMembers(groupId) { return (await all(() => sb.from('contact_group_members').select('member_id').eq('group_id', groupId))).map((r) => r.member_id); },

      // ----- templates -----
      /* a draft kept on the workspace's own rows; nothing goes to Meta until submitTemplate */
      async saveTemplate(t) {
        const name = String(t.name || '').trim().toLowerCase();
        if (!/^[a-z0-9_]{1,512}$/.test(name)) throw new Error('Name: lowercase letters, numbers and underscores only.');
        const examples = Array.isArray(t.examples) ? t.examples : [];
        const row = { tenant_id: WS, name, language: t.language || 'en', category: String(t.category || 'MARKETING').toUpperCase(), body: String(t.body || ''), footer: String(t.footer || '').trim() || null,
          header: (t.headerType || (t.header ? 'text' : 'none')) === 'text' ? (t.header ? { format: 'TEXT', text: String(t.header).trim() } : null)
            : ['image', 'document', 'video'].includes(t.headerType) ? { format: t.headerType.toUpperCase(), file_name: t.headerFile || null, example_url: t.headerUrl || null } : null,
          buttons: LIVE.buttonsToMeta(t.buttons),
          vars: examples.map((ex, i) => ({ k: String(i + 1), label: 'Blank ' + (i + 1), def: 'custom', example: String(ex || '') })), meta_status: 'DRAFT', created_by: me.email, updated_at: new Date().toISOString() };
        const existing = t.id && D.templates.find((x) => x.id === t.id);
        const data = existing ? unwrap(await sb.from('wa_custom_templates').update(row).eq('id', t.id).eq('tenant_id', WS).select('id').single(), 'save template')
                              : unwrap(await sb.from('wa_custom_templates').insert(row).select('id').single(), 'save template');
        await loadTemplates(); emit('templates');
        return store.template(data.id);
      },
      /* Meta review: Broadcast Send builds Meta's components (header, body with examples, footer, buttons) and records PENDING */
      async submitTemplate(t) {
        const saved = await store.saveTemplate(t);
        /* a media header needs a public sample Meta can review: an image goes through the existing poster path */
        if (saved.headerType === 'document' || saved.headerType === 'video') throw new Error('Document and video headers are not supported yet: use a text or image header.');
        const media = saved.headerType === 'image' ? { has_image: true, image_url: t.headerUrl || '' } : {};
        const r = await workflow('broadcast-send', Object.assign({ tpl_create: true, name: saved.name, category: saved.category, language: saved.language, text: saved.body, examples: saved.examples, header_text: saved.headerType === 'text' ? saved.header : '', footer: saved.footer || '', buttons: LIVE.buttonsToMeta(saved.buttons) }, media));
        if (!r.ok) throw new Error(r.error || 'Meta did not accept the template.');
        await loadTemplates(); emit('templates');
        return store.template(saved.id);
      },
      async syncTemplates() { const r = await workflow('broadcast-send', { tpl_sync: true }); if (!r.ok) throw new Error(r.error || 'Could not reach Meta.'); await loadTemplates(); emit('templates'); return r; },
      async deleteTemplate(t) {
        const tpl = typeof t === 'string' ? store.template(t) : t;
        if (!tpl) return;
        if (tpl.metaId || (tpl.status !== 'DRAFT')) { const r = await workflow('broadcast-send', { tpl_delete: true, name: tpl.name, meta_id: tpl.metaId || undefined }); if (!r.ok) throw new Error(r.error || 'Could not delete at Meta.'); }
        else unwrap(await sb.from('wa_custom_templates').delete().eq('id', tpl.id).eq('tenant_id', WS), 'delete template');
        await loadTemplates(); emit('templates');
      },

      // ----- campaigns -----
      /* b: the wizard's campaign {name, templateId, audience, vars, when, scheduledAt, imageUrl}; saved as draft or scheduled */
      campaignBody(b) {
        const tpl = store.template(b.templateId) || {};
        const aud = Object.assign({}, b.audience || { kind: 'all' });
        /* a saved filter is resolved here to the contacts it matches now, so the campaign goes to exactly what the owner saw */
        if (aud.kind === 'filter') { const fl = UI.savedFilters.find((x) => x.id === aud.filterId); aud.ids = LIVE.applyFilter(D.contacts, fl).map((c) => c.id); }
        const segment = LIVE.segmentFor(aud); if (aud.kind === 'filter') segment.filter_id = aud.filterId;
        const thr = typeof b.throttle === 'number' ? b.throttle : (LIVE.THROTTLE_PER_MIN[b.throttle || 'steady'] || 60);
        const body = { template: tpl.name || b.templateName, language: tpl.language || b.language || 'en', vars: LIVE.varsToWorkflow(b.vars || []), segment, image_url: b.imageUrl || null, created_by_email: me.email, audience_label: aud.label || '',
          throttle: typeof b.throttle === 'string' ? b.throttle : LIVE.throttleName(thr), throttle_per_minute: thr };
        if (b.when === 'later' && b.scheduledAt) body.schedule_at = new Date(b.scheduledAt).toISOString();
        if (b.audience && b.audience.kind === 'sheet' && Array.isArray(b.recipientsRows)) body.custom_recipients = b.recipientsRows;
        return body;
      },
      async createCampaign(b) {
        const tpl = store.template(b.templateId);
        if (!tpl) throw new Error('Choose an approved template.');
        const row = { tenant_id: WS, title: String(b.name || '').trim() || 'Campaign', template_name: tpl.name, audience: (b.audience || {}).label || 'all', status: b.when === 'later' && b.scheduledAt && !b.asDraft ? 'scheduled' : 'draft', body: JSON.stringify(store.campaignBody(b)) };
        const data = unwrap(await sb.from('broadcasts').insert(row).select('id').single(), 'save campaign');
        await loadCampaigns(); emit('campaigns');
        return store.campaign(data.id);
      },
      async updateCampaign(id, b) {
        const cur = store.campaign(id);
        if (!cur || ['sending', 'sent'].includes(cur.status)) throw new Error('A campaign that was sent cannot be changed. Duplicate it instead.');
        const tpl = store.template(b.templateId) || { name: cur.templateName };
        unwrap(await sb.from('broadcasts').update({ title: String(b.name || cur.name).trim(), template_name: tpl.name, audience: (b.audience || cur.audience || {}).label || 'all', status: b.when === 'later' && b.scheduledAt && !b.asDraft ? 'scheduled' : 'draft', body: JSON.stringify(store.campaignBody(Object.assign({}, cur, b))) }).eq('id', id).eq('tenant_id', WS), 'save campaign');
        await loadCampaigns(); emit('campaigns');
        return store.campaign(id);
      },
      async deleteCampaign(id) { unwrap(await sb.from('broadcasts').delete().eq('id', id).eq('tenant_id', WS), 'delete campaign'); await loadCampaigns(); emit('campaigns'); },
      /* how many people a draft would reach (Broadcast Send counts, nothing is sent) */
      async countAudience(b) {
        const body = store.campaignBody(b);
        const r = await workflow('broadcast-send', { dry_run: true, template: body.template, language: body.language, vars: body.vars, segment: body.segment, custom_recipients: body.custom_recipients, audience_source: body.custom_recipients ? 'sheet' : undefined });
        if (!r.ok) throw new Error(r.error || 'Could not count the audience.');
        return { count: r.audience_count || 0, sample: r.sample || [], skipped: r.skipped_opted_out || 0 };
      },
      /* send now: the row goes to "sending" first (only the first call can start it), then Broadcast Send runs in batches
         of ~120 and this loop continues it until done; the report is on the row (campaign.recipients) */
      async sendCampaign(id, onProgress) {
        const b = store.campaign(id);
        if (!b) throw new Error('Campaign not found.');
        let cfg = {}; try { cfg = JSON.parse(unwrap(await sb.from('broadcasts').select('body').eq('id', id).single(), 'campaign').body || '{}'); } catch (e) { cfg = {}; }
        unwrap(await sb.from('broadcasts').update({ status: 'sending', sent_at: null }).eq('id', id).eq('tenant_id', WS).in('status', ['draft', 'scheduled']), 'start campaign');
        let r = await workflow('broadcast-send', { dry_run: false, broadcast_id: id, template: cfg.template, language: cfg.language, vars: cfg.vars, segment: cfg.segment, custom_recipients: cfg.custom_recipients, audience_source: cfg.custom_recipients ? 'sheet' : undefined, image_url: cfg.image_url, throttle_per_minute: cfg.throttle_per_minute });
        if (!r.ok) { if (!r.already_sending) unwrap(await sb.from('broadcasts').update({ status: cfg.schedule_at ? 'scheduled' : 'draft' }).eq('id', id).eq('tenant_id', WS).eq('status', 'sending'), 'campaign'); throw new Error(r.error || 'Not sent.'); }
        if (onProgress) onProgress(r);
        for (let guard = 0; r.partial && guard < 200; guard++) { r = await workflow('broadcast-send', { dry_run: false, broadcast_id: id, resume: true }); if (r.busy) break; if (!r.ok && !r.nothing_left) break; if (onProgress) onProgress(r); }
        /* the sent messages are in the inbox now too (each recipient's chat) */
        await loadInbox(); await loadCampaigns(); emit('campaigns');
        return r;
      },
      async testSend(templateId, vals, toPhone) {
        const tpl = store.template(templateId); if (!tpl) throw new Error('Choose a template.');
        const r = await workflow('broadcast-send', { test_to: phoneKey(toPhone), template: tpl.name, language: tpl.language, vars: LIVE.varsToWorkflow(vals || tpl.examples), sample_recipient: { full_name: me.name || 'Test', row_cols: {} } });
        if (!r.ok) throw new Error(r.error || 'The test message was not sent.');
        return r;
      },

      // ----- inbox -----
      async reply(phone, text, o) {
        o = o || {};
        const r = await workflow('broadcast-send', { inbox_reply: true, reply_to: phoneKey(phone), text: String(text || ''), image_url: o.imageUrl || undefined });
        if (!r.ok) { const e = new Error(r.error || 'Not sent.'); e.windowClosed = !!r.window_closed; e.tooLong = !!r.too_long; throw e; }
        await loadInbox(); emit('inbox');
        return r;
      },
      async replyTemplate(phone, templateName, params, o) {
        o = o || {};
        const tpl = store.template(templateName) || {};
        const r = await workflow('broadcast-send', { inbox_reply: true, send_as_template: true, reply_to: phoneKey(phone), template: tpl.name || templateName, language: tpl.language || o.language || 'en', params: params || [], header_params: o.headerParams, header_media_url: o.headerMediaUrl, button_params: o.buttonParams });
        if (!r.ok) throw new Error(r.error || 'Not sent.');
        await loadInbox(); emit('inbox');
        return r;
      },
      async convAction(phone, action, value, minutes) { const r = unwrap(await sb.rpc('wa_conv_action', { p_tenant: WS, p_phone: phoneKey(phone), p_action: action, p_value: value == null ? null : String(value), p_minutes: minutes == null ? null : minutes }), action); await loadInbox(); emit('inbox'); return r; },
      assign(phone, userId) { return store.convAction(phone, 'assign', userId || ''); },
      resolve(phone) { return store.convAction(phone, 'resolve'); },
      reopen(phone) { return store.convAction(phone, 'reopen'); },
      markRead(phone) { const c = D.conversations.find((x) => x.phoneKey === phoneKey(phone)); if (c && c.unread === 0) return Promise.resolve(c); return store.convAction(phone, 'read'); },
      pauseBot(phone, minutes) { return store.convAction(phone, 'pause', null, minutes == null ? 0 : minutes); },
      resumeBot(phone) { return store.convAction(phone, 'resume'); },
      async note(phone, body) { unwrap(await sb.rpc('wa_note_add', { p_tenant: WS, p_phone: phoneKey(phone), p_body: String(body || '') }), 'note'); await loadInbox(); emit('inbox'); },
      async setLabels(phone, labels) { unwrap(await sb.rpc('wb_conv_labels', { p_tenant: WS, p_phone: phoneKey(phone), p_labels: labels || [] }), 'labels'); await loadInbox(); emit('inbox'); },
      async saveQuickReply(qr) { const row = { tenant_id: WS, title: String(qr.title || '').trim(), body: String(qr.body || ''), created_by: me.id, updated_at: new Date().toISOString() }; if (qr.id) unwrap(await sb.from('quick_replies').update(row).eq('id', qr.id), 'quick reply'); else unwrap(await sb.from('quick_replies').insert(row), 'quick reply'); await loadInboxExtras(); emit('extras'); },
      async deleteQuickReply(id) { unwrap(await sb.from('quick_replies').delete().eq('id', id), 'quick reply'); await loadInboxExtras(); emit('extras'); },
      async saveLabel(l) { const row = { tenant_id: WS, name: String(l.name || '').trim(), color: l.color || '#6B7280' }; if (l.id) unwrap(await sb.from('conversation_labels').update(row).eq('id', l.id), 'label'); else unwrap(await sb.from('conversation_labels').insert(row), 'label'); await loadInboxExtras(); emit('extras'); },
      async deleteLabel(id) { unwrap(await sb.from('conversation_labels').delete().eq('id', id), 'label'); await loadInboxExtras(); emit('extras'); },

      /* the console's label picker works with names; unknown names are created as labels first */
      async setConvLabels(contactIdOrPhone, names) {
        const c = D.conversations.find((x) => x.contactId === contactIdOrPhone || x.phoneKey === phoneKey(contactIdOrPhone));
        const known = new Set(D.labels.map((l) => l.name));
        for (const n of names || []) if (!known.has(n)) { unwrap(await sb.from('conversation_labels').insert({ tenant_id: WS, name: String(n).slice(0, 40) }), 'label'); known.add(n); }
        await store.setLabels(c ? c.phoneKey : contactIdOrPhone, names || []);
        await loadInboxExtras(); emit('extras');
      },
      async saveFilter(f) { const list = UI.savedFilters.filter((x) => x.id !== f.id).concat([Object.assign({ id: f.id || ('f' + Date.now().toString(36)) }, f)]); await store.updateSettings({ saved_filters: list }); return list; },
      async deleteFilter(id) { await store.updateSettings({ saved_filters: UI.savedFilters.filter((x) => x.id !== id) }); },
      async saveNotifications(n) { await store.updateSettings({ notifications: Object.assign({}, UI.notifications, n) }); },
      async saveWaProfile(p) { await store.updateSettings({ wa_profile: Object.assign({}, UI.waProfile, p) }); },
      async dismissChecklist() { await store.updateSettings({ checklist_dismissed: true }); },

      // ----- events & reminders -----
      async saveEvent(e) {
        const tpl = e.reminderTemplateId ? store.template(e.reminderTemplateId) : null;
        const row = { tenant_id: WS, title: String(e.title || '').trim(), kind: e.kind || 'event', description: e.description || null, starts_at: e.startsAt ? new Date(e.startsAt).toISOString() : null, venue: e.location || null, capacity: e.capacity || null,
          reminder_template: tpl ? tpl.name : null, remind_days_before: Number(e.remindDaysBefore || 0), audience: /^Tag: /.test(e.audience || '') ? { kind: 'tag', tag: e.audience.slice(5) } : { kind: 'all' }, status: e.status || 'planned', is_open: true };
        if (e.id && D.events.some((x) => x.id === e.id)) unwrap(await sb.from('events').update(row).eq('id', e.id).eq('tenant_id', WS), 'save event'); else unwrap(await sb.from('events').insert(Object.assign(row, { created_by: me.id })), 'save event');
        await loadEvents(); emit('events');
      },
      async deleteEvent(id) { unwrap(await sb.from('events').delete().eq('id', id).eq('tenant_id', WS), 'delete event'); await loadEvents(); emit('events'); },

      // ----- team -----
      async invite(email, role) { const r = unwrap(await sb.rpc('wb_invite', { p_tenant: WS, p_email: String(email || '').trim(), p_role: role || 'agent' }), 'invite'); await loadTeam(); emit('team'); return r; },
      async pendingInvites() { return unwrap(await sb.from('invites').select('*').eq('workspace_id', WS).order('created_at'), 'invites') || []; },
      async cancelInvite(email) { unwrap(await sb.rpc('wb_cancel_invite', { p_tenant: WS, p_email: email }), 'cancel invite'); await loadTeam(); emit('team'); },
      async setRole(userId, role) { unwrap(await sb.rpc('wb_set_role', { p_tenant: WS, p_user: userId, p_role: role }), 'role'); await loadTeam(); emit('team'); },
      async removeMember(userId) { unwrap(await sb.rpc('wb_remove_member', { p_tenant: WS, p_user: userId }), 'remove'); await loadTeam(); emit('team'); },

      // ----- settings -----
      /* patch: {business:{...}, throttle_per_minute, inbox:{auto_pause_minutes}, name} (the database checks the keys) */
      async updateSettings(patch) { unwrap(await sb.rpc('wb_update_settings', { p_tenant: WS, p_patch: patch || {} }), 'settings'); await loadWorkspace(); emit('settings'); return D.settings; },
      async saveBot(bot) {
        const cur = unwrap(await sb.from('tenants').select('bot_config').eq('id', WS).single(), 'bot').bot_config || {};
        const next = Object.assign({}, cur, { bot_enabled: !!bot.enabled, brand: Object.assign({}, cur.brand || {}, { name: D.settings.business.name, greeting: bot.greeting }), human_handoff: bot.handoff, ack_reply: bot.ackReply, menu: bot.menu || [], faq: bot.faq || [], inbox: { auto_pause_minutes: Number(bot.pauseMinutes || 0) } });
        unwrap(await sb.from('tenants').update({ bot_config: next }).eq('id', WS), 'bot');
        await loadWorkspace(); emit('settings');
      },
      /* Embedded Signup: the Meta pop-up gave {code, waba_id, phone_number_id}; the workflow does the rest (owner only) */
      async connectNumber(o) {
        const r = await workflow('wa-signup', { code: o.code, waba_id: o.waba_id || o.wabaId, phone_number_id: o.phone_number_id || o.phoneNumberId, workspace_id: WS, pin: o.pin || undefined });
        if (!r.ok) { const e = new Error(r.error || 'Could not connect the number.'); e.needPin = !!r.need_pin; throw e; }
        await loadWorkspace(); emit('settings');
        return r.status;
      },
      /* the manual path (own Meta app): the owner pastes the values; stored by wb_connect_number */
      /* the manual path (own Meta app): the signup workflow first checks at Meta that the token reads this number and
         that the number is in this WABA, then stores it (a browser cannot write these columns or call the function) */
      async connectNumberManual(o) {
        const r = await workflow('wa-signup', { mode: 'manual', workspace_id: WS, phone_number_id: o.phoneNumberId, waba_id: o.wabaId, token: o.token || '', app_secret: o.appSecret || '', verify_token: o.verifyToken || '', display_name: o.displayName || '' });
        if (!r.ok) throw new Error(r.error || 'Could not connect the number.');
        await loadWorkspace(); emit('settings'); return r.status;
      },
      /* disconnect: the workflow removes this app from the WABA at Meta, then clears the number; r.note says if Meta did not confirm */
      async disconnectNumber() {
        const r = await workflow('wa-signup', { mode: 'disconnect', workspace_id: WS });
        if (!r.ok) throw new Error(r.error || 'Could not disconnect the number.');
        await loadWorkspace(); emit('settings'); return r;
      },
      /* "Delete workspace": a recorded request (owner, by name); the workspace is switched off and every member loses access at once */
      async requestDeletion(name) { return unwrap(await sb.rpc('wb_request_deletion', { p_tenant: WS, p_name: String(name || '') }), 'delete workspace'); },
      /* is the login still valid at the server? (an ended session shows up as refused writes, not as a clear error) */
      async sessionAlive() { try { const { data, error } = await sb.auth.getUser(); return !error && !!(data && data.user); } catch (e) { return false; } },
      async usage() { return unwrap(await sb.rpc('wb_usage', { p_tenant: WS }), 'usage'); },
      async canSend() { return unwrap(await sb.rpc('wb_can_send', { p_tenant: WS }), 'plan'); },
      async exportAll() { return unwrap(await sb.rpc('wb_export', { p_tenant: WS }), 'export'); },
      stop() { clearTimeout(timer); if (channel && sb.removeChannel) sb.removeChannel(channel); listeners.clear(); },
    };
    store.ready = load().then(() => { subscribe(); return store; });
    return store;
  };

  window.WB_LIVE = LIVE;
})();
