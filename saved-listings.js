/**
 * saved-listings.js — NyumbaKisumu
 * Shared save/unsave logic for listing.html, listings.html, index.html
 * Works in two modes:
 *   1. Anonymous — IDs stored in localStorage (key: nk_saved_listings)
 *   2. Signed in — synced to saved_listings table in Supabase
 *
 * HOW TO USE ON ANY PAGE:
 *   1. Make sure supabase-js is loaded first (it already is on all your pages)
 *   2. Add: <script src="saved-listings.js"></script>  just before </body>
 *   3. Call NKSaved.init() once on page load
 *   4. Use NKSaved.buildHeartBtn(listingId) to get a heart button HTML string
 *   5. Use NKSaved.isSaved(id) to check if a listing is saved
 */

(function (global) {
  'use strict';

  // ── Config ──────────────────────────────────────────────────
  const SUPABASE_URL = 'https://vliuuloyfhyxcsuchpss.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_oIIcecf3wzKMual5K24Z8Q_zmxVfgsx';
  const LOCAL_KEY    = 'nk_saved_listings'; // localStorage key

  // ── Internal state ───────────────────────────────────────────
  let _db          = null;
  let _currentUser = null;
  let _savedIds    = new Set(); // in-memory cache of saved IDs
  let _ready       = false;
  let _onChangeCbs = []; // callbacks fired whenever save state changes

  // ── Supabase client ──────────────────────────────────────────
  function getDb() {
    if (_db) return _db;
    if (typeof supabase === 'undefined' || !supabase.createClient) {
      console.error('[NKSaved] supabase-js not loaded. Load it before saved-listings.js.');
      return null;
    }
    _db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    return _db;
  }

  // ── localStorage helpers ─────────────────────────────────────
  function getLocalIds() {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  function setLocalIds(ids) {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify([...new Set(ids)]));
    } catch (e) {
      console.warn('[NKSaved] localStorage write failed:', e);
    }
  }

  function addLocalId(id) {
    const ids = getLocalIds();
    if (!ids.includes(id)) ids.unshift(id);
    setLocalIds(ids);
  }

  function removeLocalId(id) {
    setLocalIds(getLocalIds().filter(x => x !== id));
  }

  // ── Sync local saves to account on sign-in ───────────────────
  async function syncLocalToAccount(userId) {
    const localIds = getLocalIds();
    if (!localIds.length) return;
    const db = getDb();
    if (!db) return;
    // Insert each local save into Supabase (ignore conflicts = duplicates)
    const rows = localIds.map(id => ({ user_id: userId, listing_id: id }));
    const { error } = await db.from('saved_listings').upsert(rows, { onConflict: 'user_id,listing_id', ignoreDuplicates: true });
    if (!error) {
      // Clear local now that it's in the cloud
      setLocalIds([]);
    }
  }

  // ── Load saved IDs from Supabase ─────────────────────────────
  async function loadFromAccount() {
    const db = getDb();
    if (!db || !_currentUser) return;
    const { data, error } = await db
      .from('saved_listings')
      .select('listing_id')
      .eq('user_id', _currentUser.id);
    if (error) {
      console.error('[NKSaved] loadFromAccount error:', error.message);
      return;
    }
    _savedIds = new Set((data || []).map(r => r.listing_id));
  }

  // ── Load saved IDs from localStorage ─────────────────────────
  function loadFromLocal() {
    _savedIds = new Set(getLocalIds());
  }

  // ── Init — call once on page load ───────────────────────────
  async function init() {
    const db = getDb();
    if (!db) return;

    const { data: { session } } = await db.auth.getSession();
    _currentUser = session?.user || null;

    if (_currentUser) {
      await syncLocalToAccount(_currentUser.id);
      await loadFromAccount();
    } else {
      loadFromLocal();
    }

    _ready = true;
    _fireChange();

    // Listen for auth changes (e.g. user signs in on this tab)
    db.auth.onAuthStateChange(async (event, session) => {
      const newUser = session?.user || null;
      const wasSignedIn = !!_currentUser;
      _currentUser = newUser;

      if (newUser && !wasSignedIn) {
        // Just signed in — sync local saves, reload from account
        await syncLocalToAccount(newUser.id);
        await loadFromAccount();
        _fireChange();
      } else if (!newUser && wasSignedIn) {
        // Signed out — load from local
        loadFromLocal();
        _fireChange();
      }
    });
  }

  // ── Check if a listing is saved ──────────────────────────────
  function isSaved(listingId) {
    return _savedIds.has(listingId);
  }

  // ── Save a listing ───────────────────────────────────────────
  async function save(listingId) {
    if (_savedIds.has(listingId)) return; // already saved
    _savedIds.add(listingId);

    if (_currentUser) {
      const db = getDb();
      if (db) {
        const { error } = await db.from('saved_listings').insert({
          user_id: _currentUser.id,
          listing_id: listingId
        });
        if (error && error.code !== '23505') { // 23505 = unique violation (already exists)
          console.error('[NKSaved] save error:', error.message);
          _savedIds.delete(listingId); // rollback
          _fireChange();
          return false;
        }
      }
    } else {
      addLocalId(listingId);
    }

    _fireChange();
    _updateNavBadge();
    return true;
  }

  // ── Unsave a listing ─────────────────────────────────────────
  async function unsave(listingId) {
    if (!_savedIds.has(listingId)) return;
    _savedIds.delete(listingId);

    if (_currentUser) {
      const db = getDb();
      if (db) {
        const { error } = await db
          .from('saved_listings')
          .delete()
          .eq('user_id', _currentUser.id)
          .eq('listing_id', listingId);
        if (error) {
          console.error('[NKSaved] unsave error:', error.message);
          _savedIds.add(listingId); // rollback
          _fireChange();
          return false;
        }
      }
    } else {
      removeLocalId(listingId);
    }

    _fireChange();
    _updateNavBadge();
    return true;
  }

  // ── Toggle save/unsave ───────────────────────────────────────
  async function toggle(listingId, btnEl) {
    if (!_ready) return;
    const willSave = !_savedIds.has(listingId);

    // Optimistic UI — update button immediately
    if (btnEl) _applyHeartState(btnEl, willSave);

    let success;
    if (willSave) {
      success = await save(listingId);
      if (success) _showToast('Saved to your shortlist ♥');
    } else {
      success = await unsave(listingId);
      if (success) _showToast('Removed from shortlist');
    }

    // Rollback button if failed
    if (!success && btnEl) _applyHeartState(btnEl, !willSave);
  }

  // ── Get count ────────────────────────────────────────────────
  function count() {
    return _savedIds.size;
  }

  // ── Register onChange callback ───────────────────────────────
  function onChange(cb) {
    _onChangeCbs.push(cb);
    if (_ready) cb(_savedIds); // fire immediately if already ready
  }

  // ── Build heart button HTML string ───────────────────────────
  // Pass listingId, and optionally a label for accessibility
  function buildHeartBtn(listingId, opts = {}) {
    const saved   = _savedIds.has(listingId);
    const label   = opts.label || (saved ? 'Remove from shortlist' : 'Save to shortlist');
    const classes = opts.classes || '';
    return `<button
      class="nk-heart-btn ${saved ? 'saved' : ''} ${classes}"
      data-listing-id="${listingId}"
      title="${label}"
      aria-label="${label}"
      onclick="NKSaved.toggle('${listingId}', this); event.stopPropagation(); event.preventDefault();"
    >${_heartSVG(saved)}</button>`;
  }

  // ── Update a heart button in the DOM after toggle ────────────
  function _applyHeartState(btnEl, saved) {
    btnEl.classList.toggle('saved', saved);
    btnEl.title = saved ? 'Remove from shortlist' : 'Save to shortlist';
    btnEl.innerHTML = _heartSVG(saved);
  }

  function _heartSVG(filled) {
    return filled
      ? `<svg viewBox="0 0 24 24" fill="#C53030" stroke="#C53030" stroke-width="1.5"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>`;
  }

  // ── Fire all onChange callbacks ──────────────────────────────
  function _fireChange() {
    _onChangeCbs.forEach(cb => cb(_savedIds));
  }

  // ── Update the nav badge (♥ count) if it exists ──────────────
  function _updateNavBadge() {
    const badge = document.getElementById('nav-count-badge');
    if (!badge) return;
    const n = _savedIds.size;
    badge.textContent = n;
    badge.style.display = n > 0 ? 'inline-flex' : 'none';
  }

  // ── Simple toast (only if no page-level showToast exists) ────
  function _showToast(msg) {
    // If the page has its own showToast, use that
    if (typeof window.showToast === 'function') {
      window.showToast(msg, 'success');
      return;
    }
    // Otherwise create/reuse a minimal one
    let t = document.getElementById('nk-saved-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'nk-saved-toast';
      t.style.cssText = `
        position:fixed;bottom:24px;right:24px;z-index:9999;
        background:#085041;color:white;padding:12px 18px;
        border-radius:10px;font-size:13px;font-family:Inter,sans-serif;
        transform:translateY(60px);opacity:0;transition:all .3s;
        pointer-events:none;
      `;
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.transform = 'translateY(0)';
    t.style.opacity   = '1';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => {
      t.style.transform = 'translateY(60px)';
      t.style.opacity   = '0';
    }, 2800);
  }

  // ── Inject global CSS for heart buttons ──────────────────────
  function _injectStyles() {
    if (document.getElementById('nk-saved-styles')) return;
    const style = document.createElement('style');
    style.id = 'nk-saved-styles';
    style.textContent = `
      .nk-heart-btn {
        background: rgba(255,255,255,0.93);
        border: 1px solid #e0ded8;
        border-radius: 50%;
        width: 34px; height: 34px;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer;
        transition: background .15s, border-color .15s, transform .15s;
        flex-shrink: 0;
        font-family: inherit;
      }
      .nk-heart-btn svg {
        width: 16px; height: 16px;
        stroke: #888780;
        transition: fill .15s, stroke .15s, transform .2s;
        pointer-events: none;
      }
      .nk-heart-btn:hover {
        background: #FFF5F5;
        border-color: #C53030;
        transform: scale(1.08);
      }
      .nk-heart-btn:hover svg { stroke: #C53030; }
      .nk-heart-btn.saved {
        background: #FFF5F5;
        border-color: #C53030;
      }
      .nk-heart-btn.saved svg { fill: #C53030; stroke: #C53030; }
      .nk-heart-btn.saved:hover { transform: scale(1.12); }

      /* Card overlay position helper */
      .nk-heart-overlay {
        position: absolute;
        top: 10px; right: 10px;
        z-index: 3;
      }
    `;
    document.head.appendChild(style);
  }

  // ── Auto-refresh all heart buttons already in the DOM ────────
  function refreshAllButtons() {
    document.querySelectorAll('.nk-heart-btn[data-listing-id]').forEach(btn => {
      const id = btn.dataset.listingId;
      _applyHeartState(btn, _savedIds.has(id));
    });
    _updateNavBadge();
  }

  // ── Expose public API ─────────────────────────────────────────
  global.NKSaved = {
    init,
    isSaved,
    save,
    unsave,
    toggle,
    count,
    onChange,
    buildHeartBtn,
    refreshAllButtons,
    getUser: () => _currentUser,
    getSavedIds: () => new Set(_savedIds),
  };

  // Inject styles immediately (before DOM is interactive)
  _injectStyles();

})(window);