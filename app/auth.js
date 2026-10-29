/* WhatsApp Blaster console: sign-in, sign-up, sign-out and password reset with Supabase Auth.
   Used by login.html, signup.html, reset.html and (through boot.js) by the console itself. Live mode only; in demo mode
   nothing here is called. The page must load supabase-js v2 first (window.supabase.createClient) and set
   window.WB_CONFIG = { supabaseUrl, supabaseAnonKey, ... } (filled by the build). Only the public anon key is used:
   what a signed-in person may read or change is decided by the database (row-level security, sql/product_saas.sql).

   window.WB_AUTH:
     client()                         the shared supabase client (one per page)
     signIn(email, password)          -> { user, workspaces }      refuses with a plain message
     signUp({ email, password, name, business })   -> { user, needsConfirm, workspace }
                                      with email confirmation on (the default), the workspace is made at the first sign-in
     finishSignup()                   makes the pending workspace once the email is confirmed (called by boot/signIn)
     signOut()                        ends the session and goes to the login page
     sendReset(email)                 sends the reset link (to reset.html)
     updatePassword(newPassword)      on reset.html after the link was opened
     session()                        the current session or null
     workspaces()                     the workspaces of this login [{id, slug, name, role, plan, connected}]
     pickWorkspace(id) / currentWorkspace()  remembered per browser (localStorage), checked against workspaces()
     requireSession()                 on the console: no session -> login page; returns { session, workspace }
     redirect(page)                   to login.html / signup.html / index.html next to the current page */
(function () {
  'use strict';
  const CFG = window.WB_CONFIG || {};
  const KEY_WS = 'wb_workspace', KEY_PENDING = 'wb_pending_business';
  let _client = null;
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }, del(k) { try { localStorage.removeItem(k); } catch (e) {} } };
  const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

  /* Supabase answers in its own words; people get a sentence they can act on */
  function friendly(err) {
    const m = String((err && (err.message || err.error_description)) || err || '');
    if (/invalid login credentials/i.test(m)) return 'The email or password is not right. Try again, or reset your password.';
    if (/email not confirmed/i.test(m)) return 'Confirm your email first: open the link we sent you, then sign in.';
    if (/user already registered|already been registered/i.test(m)) return 'An account with this email already exists. Sign in instead.';
    if (/password should be at least|weak password/i.test(m)) return 'Choose a longer password: at least 8 characters.';
    if (/rate limit|too many requests|429/i.test(m)) return 'Too many attempts. Wait a minute and try again.';
    if (/failed to fetch|network/i.test(m)) return 'No connection to the server. Check your internet and try again.';
    return m || 'Something went wrong. Try again.';
  }
  const fail = (err) => { const e = new Error(friendly(err)); e.cause = err; throw e; };

  function client() {
    if (_client) return _client;
    const lib = window.supabase;
    if (!lib || typeof lib.createClient !== 'function') throw new Error('The sign-in library did not load. Reload the page.');
    if (!CFG.supabaseUrl || /^__/.test(CFG.supabaseUrl)) throw new Error('This installation is not configured yet (Supabase URL missing).');
    _client = lib.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'wb-auth' } });
    return _client;
  }
  const pageUrl = (page) => { try { const u = new URL(page, location.href); return u.href; } catch (e) { return page; } };
  function redirect(page) { location.href = pageUrl(page); }

  async function session() { const { data, error } = await client().auth.getSession(); if (error) return null; return data.session || null; }
  async function workspaces() {
    const { data, error } = await client().rpc('wb_my_workspaces');
    if (error) fail(error);
    return (data || []).map((w) => (w && w.wb_my_workspaces) || w);
  }
  /* the business name typed at sign-up waits here until the email is confirmed and the person signs in */
  async function finishSignup() {
    const pending = store.get(KEY_PENDING);
    if (!pending) return null;
    let p = null; try { p = JSON.parse(pending); } catch (e) { store.del(KEY_PENDING); return null; }
    const s = await session(); if (!s) return null;
    if (p.email && s.user && String(s.user.email).toLowerCase() !== String(p.email).toLowerCase()) return null;   // someone else's sign-up on this browser
    /* an invited person joins the team that invited them (applied when the email is confirmed): no extra workspace */
    if ((await workspaces()).length) { store.del(KEY_PENDING); return null; }
    if (!p.business) { store.del(KEY_PENDING); return null; }
    const { data, error } = await client().rpc('wb_signup', { business_name: p.business, name: p.name || null });
    if (error) fail(error);
    store.del(KEY_PENDING);
    if (data && data.workspace_id) store.set(KEY_WS, data.workspace_id);
    return data;
  }

  async function signIn(email, password) {
    email = String(email || '').trim().toLowerCase();
    if (!EMAIL.test(email)) throw new Error('Enter your email address.');
    if (!password) throw new Error('Enter your password.');
    const { data, error } = await client().auth.signInWithPassword({ email, password });
    if (error) fail(error);
    let made = null; try { made = await finishSignup(); } catch (e) { /* the workspace step can be retried from the console */ }
    const list = await workspaces();
    return { user: data.user, workspaces: list, created: made };
  }

  async function signUp(o) {
    const email = String(o.email || '').trim().toLowerCase(), name = String(o.name || '').trim(), business = String(o.business || '').trim();
    if (!name) throw new Error('Enter your name.');
    if (!EMAIL.test(email)) throw new Error('Enter a valid email address.');
    if (String(o.password || '').length < 8) throw new Error('Choose a password of at least 8 characters.');
    /* an invited person (signup.html?invite=1) joins the team that invited them and names no business */
    if (!o.invited && (business.length < 2 || business.length > 80)) throw new Error('Enter your business name (2 to 80 characters).');
    store.set(KEY_PENDING, JSON.stringify({ email, name, business }));
    const { data, error } = await client().auth.signUp({ email, password: o.password, options: { data: { name, full_name: name }, emailRedirectTo: pageUrl('login.html') } });
    if (error) { store.del(KEY_PENDING); fail(error); }
    /* email confirmation off (or already confirmed): there is a session now, so the workspace is made at once */
    if (data.session) { const ws = await finishSignup(); return { user: data.user, needsConfirm: false, workspace: ws }; }
    return { user: data.user, needsConfirm: true, workspace: null };
  }

  async function signOut() { try { await client().auth.signOut(); } catch (e) {} store.del(KEY_WS); redirect('login.html'); }
  async function sendReset(email) {
    email = String(email || '').trim().toLowerCase();
    if (!EMAIL.test(email)) throw new Error('Enter your email address.');
    const { error } = await client().auth.resetPasswordForEmail(email, { redirectTo: pageUrl('reset.html') });
    if (error) fail(error);
    return true;   // the same answer whether or not the email has an account (no account discovery)
  }
  async function updatePassword(pw) {
    if (String(pw || '').length < 8) throw new Error('Choose a password of at least 8 characters.');
    const { data, error } = await client().auth.updateUser({ password: pw });
    if (error) fail(error);
    return data.user;
  }

  function currentWorkspace() { return store.get(KEY_WS); }
  function pickWorkspace(id) { store.set(KEY_WS, id); }
  /* the console's gate: a session, and one of this login's workspaces (the remembered one if it is still theirs) */
  async function requireSession() {
    const s = await session();
    if (!s) { redirect('login.html'); return null; }
    try { await finishSignup(); } catch (e) {}
    const list = await workspaces();
    if (!list.length) return { session: s, workspace: null, workspaces: [] };
    const remembered = currentWorkspace();
    const ws = list.find((w) => w.id === remembered) || list[0];
    pickWorkspace(ws.id);
    return { session: s, workspace: ws, workspaces: list };
  }
  /* make a workspace for a login that has none (signed up elsewhere, or the pending name was lost) */
  async function createWorkspace(business, name) {
    const { data, error } = await client().rpc('wb_signup', { business_name: String(business || '').trim(), name: name || null });
    if (error) fail(error);
    if (data && data.workspace_id) pickWorkspace(data.workspace_id);
    return data;
  }

  window.WB_AUTH = { client, signIn, signUp, finishSignup, signOut, sendReset, updatePassword, session, workspaces, pickWorkspace, currentWorkspace, requireSession, createWorkspace, redirect, friendly };
})();
