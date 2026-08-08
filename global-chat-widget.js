/* ════════════════════════════════════════════════════
   NYUMBA254 — "DOORBELL" GLOBAL CHAT WIDGET 🔔
   One floating widget, shared across every page, listing
   ALL of a buyer's conversations across every listing
   they've messaged. Include on every page:
     <script src="global-chat-widget.js"></script>
════════════════════════════════════════════════════ */
(function () {
  const SUPABASE_URL = 'https://vliuuloyfhyxcsuchpss.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_oIIcecf3wzKMual5K24Z8Q_zmxVfgsx';
  const gdb = window.db || supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  window.db = window.db || gdb;

  const STYLE = `
    #gcw-btn{position:fixed;bottom:24px;right:24px;z-index:1500;height:52px;padding:0 20px 0 16px;border-radius:30px;background:#0F6E56;display:none;align-items:center;gap:9px;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.25);transition:transform .15s,background .15s}
    #gcw-btn:hover{background:#085041;transform:translateY(-2px)}
    #gcw-btn svg{flex-shrink:0}
    #gcw-btn-label{color:#fff;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;white-space:nowrap}
    #gcw-badge{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;padding:0 5px;background:#C53030;color:#fff;font-size:11px;font-weight:700;border-radius:20px;display:flex;align-items:center;justify-content:center;border:2px solid #fff}
    @keyframes gcw-pop{from{transform:scale(0)}to{transform:scale(1)}}
    #gcw-panel{position:fixed;bottom:96px;right:24px;z-index:1500;width:360px;max-width:calc(100vw - 32px);height:480px;max-height:calc(100vh - 140px);background:#fff;border:1px solid #e0ded8;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.22);display:none;flex-direction:column;overflow:hidden;font-family:'Inter',sans-serif}
    #gcw-panel.open{display:flex}
    #gcw-head{background:#0F6E56;color:#fff;padding:14px 16px;display:flex;align-items:center;gap:10px;flex-shrink:0}
    #gcw-head button{background:none;border:none;color:#fff;cursor:pointer;padding:4px;opacity:.85}
    #gcw-head button:hover{opacity:1}
    #gcw-title-wrap{flex:1;min-width:0}
    #gcw-title{font-size:14px;font-weight:700;line-height:1.3}
    #gcw-subtitle{font-size:11px;opacity:.8;line-height:1.3}
    #gcw-list{flex:1;min-height:0;overflow-y:auto;background:#f7f6f2}
    .gcw-convo{display:flex;gap:10px;padding:12px 14px;border-bottom:1px solid #e0ded8;cursor:pointer;transition:background .1s}
    .gcw-convo:hover{background:#fff}
    .gcw-convo-img{width:44px;height:44px;border-radius:8px;background:#e0ded8;object-fit:cover;flex-shrink:0}
    .gcw-convo-body{flex:1;min-width:0}
    .gcw-convo-title{font-size:13px;font-weight:600;color:#1a1a18;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .gcw-convo-last{font-size:12px;color:#888780;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
    .gcw-convo-badge{background:#C53030;color:#fff;font-size:10px;font-weight:700;border-radius:10px;min-width:18px;height:18px;display:flex;align-items:center;justify-content:center;padding:0 5px;flex-shrink:0;align-self:center}
    #gcw-empty{padding:40px 20px;text-align:center;color:#888780;font-size:13px}
    #gcw-thread{display:none;flex-direction:column;flex:1;min-height:0}
    #gcw-thread.open{display:flex}
    #gcw-thread-head{background:#0F6E56;color:#fff;padding:12px 14px;display:flex;align-items:center;gap:10px;flex-shrink:0}
    #gcw-thread-head button.back{background:none;border:none;color:#fff;cursor:pointer;padding:2px;flex-shrink:0}
    #gcw-thread-info{flex:1;min-width:0}
    #gcw-thread-name{font-size:13.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #gcw-thread-link{font-size:11px;color:rgba(255,255,255,.85);text-decoration:underline}
    #gcw-messages{flex:1;min-height:0;overflow-y:auto;padding:14px;background:#f7f6f2;display:flex;flex-direction:column;gap:8px}
    .gcw-row{display:flex;gap:6px;align-items:flex-end;width:100%}
    .gcw-row>div:last-child{max-width:78%;width:max-content;display:flex;flex-direction:column}
    .gcw-row.mine{flex-direction:row-reverse}
    .gcw-av{width:24px;height:24px;border-radius:50%;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:#E1F5EE;color:#085041}
    .gcw-row.mine .gcw-av{background:#0F6E56;color:#fff}
    .gcw-bubble{width:fit-content;max-width:100%;padding:8px 12px;border-radius:14px;font-size:13px;line-height:1.5;background:#fff;border:1px solid #e0ded8;border-bottom-left-radius:4px;overflow-wrap:break-word;white-space:pre-wrap}
    .gcw-row.mine .gcw-bubble{background:#0F6E56;color:#fff;border:none;border-bottom-right-radius:4px}
    .gcw-time{font-size:10px;color:#888780;margin-top:2px}
    .gcw-row.mine .gcw-time{text-align:right}
    #gcw-input-row{display:flex;gap:8px;padding:10px 12px;background:#fff;border-top:1px solid #e0ded8;flex-shrink:0}
    #gcw-input{flex:1;resize:none;border:1.5px solid #e0ded8;border-radius:10px;padding:8px 12px;font-size:13px;outline:none;min-height:38px;max-height:100px;line-height:1.5;background:#f7f6f2;font-family:inherit}
    #gcw-input:focus{border-color:#0F6E56;background:#fff}
    #gcw-send{width:36px;height:36px;border-radius:50%;background:#0F6E56;color:#fff;display:flex;align-items:center;justify-content:center;border:none;cursor:pointer;flex-shrink:0}
    #gcw-send:disabled{opacity:.5;cursor:not-allowed}
    @media(max-width:480px){#gcw-panel{right:16px;bottom:88px;width:calc(100vw - 32px)}#gcw-btn{right:16px;bottom:16px}}
    @media(max-width:380px){#gcw-btn-label{display:none}#gcw-btn{padding:0;width:52px;justify-content:center}}
  `;
  const styleEl = document.createElement('style');
  styleEl.textContent = STYLE;
  document.head.appendChild(styleEl);

  document.body.insertAdjacentHTML('beforeend', `
    <div id="gcw-btn"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="white" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg><span id="gcw-btn-label">Chats</span><span id="gcw-badge" style="display:none">0</span></div>
    <div id="gcw-panel">
      <div id="gcw-head">
        <div id="gcw-title-wrap">
          <div id="gcw-title">🔔 Doorbell</div>
          <div id="gcw-subtitle">Your conversations with sellers</div>
        </div>
        <button id="gcw-close" aria-label="Close"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      <div id="gcw-list"><div id="gcw-empty">No conversations yet</div></div>
      <div id="gcw-thread">
        <div id="gcw-thread-head">
          <button class="back" id="gcw-back" aria-label="Back"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg></button>
          <div id="gcw-thread-info">
            <div id="gcw-thread-name">Seller</div>
            <a id="gcw-thread-link" href="#">View listing →</a>
          </div>
        </div>
        <div id="gcw-messages"></div>
        <div id="gcw-input-row">
          <textarea id="gcw-input" placeholder="Type a message…" rows="1"></textarea>
          <button id="gcw-send"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="white" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>
        </div>
      </div>
    </div>
  `);

  let conversations = [];
  let activeListingId = null;
  let activeBuyerToken = null;
  let activeMessages  = [];
  let channels = {};
  let panelOpen = false;
  let threadOpen = false;
  let loadPromise = null;

  function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function scanLocalConversations() {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const m = key.match(/^nk_buyer_(?!name_|phone_)(.+)$/);
      if (!m) continue;
      const token = localStorage.getItem(key);
      if (token) out.push({ listingId: m[1], buyerToken: token });
    }
    return out;
  }

  // Deduplicated: concurrent calls (e.g. registerAndOpen firing right after
  // handleBuyerThread) share the same in-flight request instead of racing.
  function loadConversations() {
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      const pairs = scanLocalConversations();
      if (!pairs.length) { conversations = []; renderList(); updateGlobalVisibility(); return; }

      const { data, error } = await gdb.rpc('get_buyer_conversations', {
        p_pairs: pairs.map(p => ({ listing_id: p.listingId, buyer_token: p.buyerToken }))
      });
      if (error) { console.error('get_buyer_conversations error:', error); return; }

      conversations = (data || []).map(row => ({
        listingId: String(row.listing_id),
        buyerToken: row.buyer_token,
        title: row.listing_title || 'Listing',
        coverUrl: row.cover_url || '',
        sellerName: row.seller_name || 'Seller',
        lastMessage: row.last_message || '',
        lastAt: row.last_message_at,
        unread: row.unread_count || 0,
      })).sort((a,b) => new Date(b.lastAt||0) - new Date(a.lastAt||0));

      renderList();
      updateGlobalVisibility();
      subscribeAll();
    })();
    loadPromise.finally(() => { loadPromise = null; });
    return loadPromise;
  }

  function totalUnread() { return conversations.reduce((s,c) => s + c.unread, 0); }

  function updateGlobalVisibility() {
    document.getElementById('gcw-btn').style.display = conversations.length ? 'flex' : 'none';
    const badge = document.getElementById('gcw-badge');
    const n = totalUnread();
    if (n > 0 && !panelOpen) { badge.textContent = n > 9 ? '9+' : n; badge.style.display = 'flex'; }
    else badge.style.display = 'none';
  }

  function renderList() {
    const list = document.getElementById('gcw-list');
    if (!conversations.length) { list.innerHTML = '<div id="gcw-empty">No conversations yet</div>'; return; }
    list.innerHTML = conversations.map(c => `
      <div class="gcw-convo" data-listing="${c.listingId}">
        ${c.coverUrl ? `<img class="gcw-convo-img" src="${c.coverUrl}"/>` : `<div class="gcw-convo-img"></div>`}
        <div class="gcw-convo-body">
          <div class="gcw-convo-title">${escHtml(c.title)}</div>
          <div class="gcw-convo-last">${escHtml(c.lastMessage || 'No messages yet')}</div>
        </div>
        ${c.unread ? `<div class="gcw-convo-badge">${c.unread>9?'9+':c.unread}</div>` : ''}
      </div>`).join('');
    list.querySelectorAll('.gcw-convo').forEach(el => {
      el.addEventListener('click', () => openConversation(el.dataset.listing));
    });
  }

  // ── FIX: this used to leave the PREVIOUS conversation's messages on
  // screen while the new one was still fetching, which is what caused
  // messages/headers to look mixed or "bled together" when switching
  // threads. Now it clears state and shows a loading placeholder
  // immediately, and can open instantly from localStorage even before
  // the full conversation list has finished loading. ──
  async function openConversation(listingId, knownBuyerToken) {
    listingId = String(listingId);
    let convo = conversations.find(c => c.listingId === listingId);

    const buyerToken = convo?.buyerToken || knownBuyerToken || localStorage.getItem('nk_buyer_' + listingId);
    if (!buyerToken) return; // no conversation exists for this listing on this device

    if (!convo) {
      convo = {
        listingId, buyerToken,
        title: localStorage.getItem('nk_last_listing_title_' + listingId) || 'Listing',
        sellerName: 'Seller', lastMessage: '', lastAt: null, unread: 0, coverUrl: ''
      };
      conversations.unshift(convo);
    }

    // Reset immediately — no stale messages or stale header from the
    // previously open thread survive into this one.
    activeListingId = listingId;
    activeBuyerToken = buyerToken;
    activeMessages = [];
    threadOpen = true;
    if (!panelOpen) togglePanel();
    document.getElementById('gcw-thread').classList.add('open');
    // The list is a normal (always-rendered) flex child of #gcw-panel — if
    // it isn't hidden here, it keeps sharing flex space with the thread,
    // which is what was squeezing the input bar off-screen as messages grew.
    document.getElementById('gcw-list').style.display = 'none';
    document.getElementById('gcw-thread-name').textContent = convo.sellerName;
    // href is set below once we know the listing's public-facing number —
    // linking with the raw UUID here is what caused "listing not found".
    document.getElementById('gcw-thread-link').href = '#';
    document.getElementById('gcw-messages').innerHTML =
      '<div style="text-align:center;font-size:12px;color:#888780;padding:16px">Loading messages…</div>';

    const [{ data, error }, { data: listingRow }] = await Promise.all([
      gdb.from('messages').select('*')
        .eq('listing_id', listingId).eq('buyer_token', buyerToken)
        .order('created_at', { ascending: true }),
      gdb.from('listings').select('listing_number').eq('id', listingId).single()
    ]);

    // Guard against a race: only apply results if the user hasn't since
    // navigated to a different thread while this fetch was in flight.
    if (activeListingId !== listingId) return;

    // listing.html's URL param is the zero-padded listing_number, not the UUID
    if (listingRow?.listing_number != null) {
      document.getElementById('gcw-thread-link').href =
        `listing.html?id=${String(listingRow.listing_number).padStart(6, '0')}`;
    }

    if (!error) {
      activeMessages = data || [];
      renderThread();
      await gdb.rpc('mark_thread_read', { p_listing_id: listingId, p_buyer_token: buyerToken });
      convo.unread = 0;
      renderList();
      updateGlobalVisibility();
      subscribeAll();
    }

    // Refresh the full list quietly in the background so titles, seller
    // names, and cover photos catch up without blocking the open.
    loadConversations();
  }

  function closeThread() {
    threadOpen = false;
    activeListingId = null;
    activeBuyerToken = null;
    activeMessages = [];
    document.getElementById('gcw-thread').classList.remove('open');
    document.getElementById('gcw-list').style.display = 'block';
  }

  function renderThread() {
    const box = document.getElementById('gcw-messages');
    if (!activeMessages.length) { box.innerHTML = '<div style="text-align:center;font-size:12px;color:#888780;padding:16px">No messages yet</div>'; return; }
    box.innerHTML = activeMessages.map(m => {
      const mine = m.sender === 'buyer';
      const time = new Date(m.created_at).toLocaleTimeString('en-KE',{hour:'2-digit',minute:'2-digit'});
      return `<div class="gcw-row ${mine?'mine':''}">
        <div class="gcw-av">${mine?'You':'S'}</div>
        <div><div class="gcw-bubble">${escHtml(m.content||m.message||'')}</div><div class="gcw-time">${time}</div></div>
      </div>`;
    }).join('');
    box.scrollTop = box.scrollHeight;
  }

  async function sendMessage() {
    const input = document.getElementById('gcw-input');
    const text = input.value.trim();
    if (!text || !activeListingId || !activeBuyerToken) return;
    const sendBtn = document.getElementById('gcw-send');
    sendBtn.disabled = true;
    input.value = ''; input.style.height = 'auto';

    const { data, error } = await gdb.from('messages').insert({
      listing_id: activeListingId, buyer_token: activeBuyerToken,
      buyer_name: localStorage.getItem('nk_buyer_name_' + activeListingId) || '',
      buyer_phone: localStorage.getItem('nk_buyer_phone_' + activeListingId) || null,
      sender: 'buyer', content: text
    }).select().single();

    sendBtn.disabled = false;
    if (error) { alert('Could not send message, please try again.'); return; }

    activeMessages.push(data);
    renderThread();
    const convo = conversations.find(c => c.listingId === activeListingId);
    if (convo) { convo.lastMessage = text; convo.lastAt = data.created_at; renderList(); }
  }

  function subscribeAll() {
    conversations.forEach(c => {
      if (channels[c.listingId]) return;
      channels[c.listingId] = gdb.channel(`gcw-messages-${c.listingId}`)
        .on('postgres_changes', { event:'INSERT', schema:'public', table:'messages', filter:`listing_id=eq.${c.listingId}` }, (payload) => {
          const row = payload.new;
          if (row.buyer_token !== c.buyerToken) return;
          if (row.sender !== 'seller') return; // buyer's own inserts are already appended locally
          c.lastMessage = row.content || row.message || '';
          c.lastAt = row.created_at;
          if (threadOpen && activeListingId === c.listingId) {
            if (!activeMessages.some(m => m.id === row.id)) {
              activeMessages.push(row);
              renderThread();
            }
            gdb.rpc('mark_thread_read', { p_listing_id: c.listingId, p_buyer_token: c.buyerToken });
          } else {
            c.unread += 1;
            pulseButton();
          }
          renderList();
          updateGlobalVisibility();
        }).subscribe();
    });
  }

  function pulseButton() {
    const btn = document.getElementById('gcw-btn');
    btn.style.animation = 'none';
    requestAnimationFrame(() => { btn.style.animation = 'gcw-pop .3s ease'; });
  }

  function togglePanel() {
    panelOpen = !panelOpen;
    document.getElementById('gcw-panel').classList.toggle('open', panelOpen);
    updateGlobalVisibility();
  }

  document.getElementById('gcw-btn').addEventListener('click', togglePanel);
  document.getElementById('gcw-close').addEventListener('click', togglePanel);
  document.getElementById('gcw-back').addEventListener('click', closeThread);
  document.getElementById('gcw-send').addEventListener('click', sendMessage);
  document.getElementById('gcw-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  document.getElementById('gcw-input').addEventListener('input', function(){
    this.style.height='auto'; this.style.height=Math.min(this.scrollHeight,100)+'px';
  });

  // Public API — call this from listing.html the instant a buyer sends a
  // new enquiry, so the widget shows it immediately without waiting.
  window.NKGlobalChat = {
    refresh: loadConversations,
    open: openConversation,
    registerAndOpen: function(listingId, buyerToken) { openConversation(listingId, buyerToken); },
  };

  loadConversations();
})();
