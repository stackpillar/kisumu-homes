// nav-badge.js — shared "Saved" count badge, include on every page with the navbar
(function () {
  const NK_URL = 'https://vliuuloyfhyxcsuchpss.supabase.co';
  const NK_KEY = 'sb_publishable_oIIcecf3wzKMual5K24Z8Q_zmxVfgsx';
  const SAVED_KEY = 'nk_saved_listings';

  function getClient() {
    if (typeof supabase === 'undefined') return null;
    return (typeof db !== 'undefined') ? db : supabase.createClient(NK_URL, NK_KEY);
  }

  function getLocalCount() {
    try {
      const raw = localStorage.getItem(SAVED_KEY);
      return raw ? JSON.parse(raw).length : 0;
    } catch { return 0; }
  }

  function paintBadge(n) {
    const badge = document.getElementById('nav-count-badge');
    if (!badge) return;
    badge.textContent = n;
    badge.style.display = n > 0 ? 'inline-flex' : 'none';
  }

  async function refreshSavedBadge() {
    const client = getClient();
    if (!client) { paintBadge(getLocalCount()); return; }
    const { data: { session } } = await client.auth.getSession();
    if (session?.user) {
      const { count, error } = await client
        .from('saved_listings')
        .select('listing_id', { count: 'exact', head: true })
        .eq('user_id', session.user.id);
      paintBadge(error ? 0 : (count || 0));
    } else {
      paintBadge(getLocalCount());
    }
  }

  function bumpSavedBadge(delta) {
    const badge = document.getElementById('nav-count-badge');
    if (!badge) return;
    const current = parseInt(badge.textContent, 10) || 0;
    paintBadge(Math.max(0, current + delta));
  }

  window.nkRefreshSavedBadge = refreshSavedBadge;
  window.nkBumpSavedBadge = bumpSavedBadge;

  // Wait for the DOM so it doesn't matter where the <script> tag sits on the page
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refreshSavedBadge);
  } else {
    refreshSavedBadge();
  }
})();