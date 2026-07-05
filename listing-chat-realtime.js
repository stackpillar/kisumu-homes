/**
 * listing-chat-realtime.js
 * ─────────────────────────────────────────────────────────────
 * DROP THIS ENTIRE <script> BLOCK into listing.html,
 * replacing the existing sendFollowUp / loadThread / showThread
 * functions and adding the realtime subscription logic.
 *
 * Requires: Supabase `db` client already on the page,
 *           nk-realtime-chat.js loaded before this script.
 * ─────────────────────────────────────────────────────────────
 *
 * HOW TO USE:
 *   In listing.html, after the existing <script> block that defines
 *   sendEnquiry(), add a <script src="listing-chat-realtime.js"></script>
 *   OR paste the contents below into the existing script block,
 *   replacing the relevant functions.
 *
 * WHAT CHANGES:
 *   - showThread()   → now also starts realtime subscription
 *   - loadThread()   → unchanged (initial fetch)
 *   - renderThread() → unchanged
 *   - sendFollowUp() → unchanged (optimistic append stays)
 *   + subscribeToThread()  NEW — realtime INSERT listener
 *   + typing indicator CSS injected dynamically
 *   + broadcastTyping() wired to the textarea `input` event
 */

/* ── Inject typing indicator styles ── */
(function injectTypingStyles() {
  const s = document.createElement('style');
  s.textContent = `
    /* Typing indicator bubble */
    .nk-typing-row {
      display: flex;
      align-items: flex-end;
      gap: 6px;
      padding: 4px 0;
    }
    .nk-typing-bubble {
      background: var(--white);
      border: 1px solid var(--border);
      border-radius: 14px;
      border-bottom-left-radius: 4px;
      padding: 8px 14px;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .nk-typing-bubble span {
      width: 6px; height: 6px; border-radius: 50%;
      background: var(--text-3);
      display: inline-block;
      animation: nkTypingBounce .9s infinite;
    }
    .nk-typing-bubble span:nth-child(2) { animation-delay: .15s; }
    .nk-typing-bubble span:nth-child(3) { animation-delay: .30s; }
    @keyframes nkTypingBounce {
      0%, 80%, 100% { transform: translateY(0);   opacity: .5; }
      40%            { transform: translateY(-5px); opacity: 1; }
    }
    .nk-typing-label {
      font-size: 11px;
      color: var(--text-3);
      margin-left: 2px;
    }
  `;
  document.head.appendChild(s);
})();

/* ─────────────────────────────────────────────────────────────
   STATE
───────────────────────────────────────────────────────────── */
let _realtimeChannel     = null;
let _typingHideTimer     = null;
const TYPING_HIDE_DELAY  = 4000;   // hide typing indicator after 4 s of silence

/* ─────────────────────────────────────────────────────────────
   OVERRIDE: showThread()
   Adds realtime subscription after the initial load.
───────────────────────────────────────────────────────────── */
async function showThread() {
  document.getElementById('enquiry-form').style.display    = 'none';
  document.getElementById('enquiry-success').style.display = 'none';
  document.getElementById('thread-section').style.display  = 'block';

  /* WhatsApp hint */
  const waNote = document.getElementById('chat-wa-note');
  if (buyerPhone) {
    waNote.innerHTML = `
      <svg viewBox="0 0 24 24" width="12" height="12" fill="#25D366">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
        <path d="M11.997 2C6.477 2 2 6.477 2 12c0 1.885.52 3.648 1.425 5.157L2 22l4.955-1.397A9.954 9.954 0 0011.997 22C17.517 22 22 17.523 22 12S17.517 2 11.997 2z"/>
      </svg>
      Seller replies are saved here and may also reach you via WhatsApp.`;
  } else {
    waNote.textContent = 'Revisit this page anytime to check for replies from the seller.';
  }

  /* Initial fetch */
  await loadThread();

  /* Start realtime subscription */
  subscribeToThread();

  /* Wire typing broadcast to the follow-up textarea */
  const ta = document.getElementById('chat-follow-input');
  if (ta && !ta.dataset.realtimeWired) {
    ta.dataset.realtimeWired = '1';
    ta.addEventListener('input', () => {
      NKChat.broadcastTyping(
        'listing-buyer-chat-' + listingId,
        buyerToken,
        buyerName || 'Buyer',
        db
      );
    });
  }
}

/* ─────────────────────────────────────────────────────────────
   subscribeToThread()
   Listens for new messages on this listing+token pair.
───────────────────────────────────────────────────────────── */
function subscribeToThread() {
  if (!buyerToken || !listingId) return;

  /* Unsubscribe previous if any */
  if (_realtimeChannel) {
    _realtimeChannel.unsubscribe();
    _realtimeChannel = null;
  }

  const channelName = 'listing-buyer-chat-' + listingId;

  /* Subscribe to new messages */
  _realtimeChannel = NKChat.subscribeMessages(
    channelName,
    'messages',
    `listing_id=eq.${listingId}`,
    (newMsg) => {
      /* Only handle messages for THIS buyer's token */
      if (newMsg.buyer_token !== buyerToken) return;

      /* Avoid duplicating optimistic messages we just sent */
      const isDupe = threadMessages.some(m => m.id === newMsg.id);
      if (isDupe) {
        /* Update the temp placeholder with the real DB row */
        const idx = threadMessages.findIndex(m => !m.id && m.content === newMsg.content);
        if (idx !== -1) threadMessages[idx] = newMsg;
        return;
      }

      threadMessages.push(newMsg);
      appendBubble(newMsg);   // append only the new bubble, don't re-render all
      hideTypingIndicator();  // seller replied → hide typing dots
    },
    db
  );

  /* Subscribe to typing signals FROM the seller */
  NKChat.subscribeTyping(
    channelName,
    buyerToken,  // ignore our own signals
    ({ name, typing }) => {
      if (typing) {
        showTypingIndicator(name || 'Seller');
      } else {
        hideTypingIndicator();
      }
    },
    db
  );
}

/* ─────────────────────────────────────────────────────────────
   OVERRIDE: sendFollowUp()
   Optimistic append — no reload needed.
───────────────────────────────────────────────────────────── */
async function sendFollowUp() {
  const input = document.getElementById('chat-follow-input');
  const text  = input.value.trim();
  if (!text || !buyerToken) return;

  const btn = document.getElementById('chat-follow-send');
  btn.disabled = true;

  /* Optimistic placeholder (no id yet) */
  const optimistic = {
    sender:     'buyer',
    content:    text,
    created_at: new Date().toISOString(),
  };
  threadMessages.push(optimistic);
  appendBubble(optimistic);

  input.value = '';
  input.style.height = 'auto';

  const { data, error } = await db.from('messages').insert({
    listing_id:  listingId,
    buyer_token: buyerToken,
    buyer_name:  buyerName,
    buyer_phone: buyerPhone || null,
    sender:      'buyer',
    content:     text,
  }).select().single();

  btn.disabled = false;

  if (error) {
    console.error('[NKChat] sendFollowUp error:', error);
    /* Remove optimistic bubble and show error */
    threadMessages.pop();
    renderThread();
    alert('Could not send message. Please try again.');
    return;
  }

  /* Replace optimistic entry with real DB row */
  const idx = threadMessages.findLastIndex(m => !m.id && m.content === text);
  if (idx !== -1) threadMessages[idx] = data;
}

/* ─────────────────────────────────────────────────────────────
   appendBubble()
   Appends a single new bubble without re-rendering everything.
───────────────────────────────────────────────────────────── */
function appendBubble(m) {
  const box = document.getElementById('chat-messages-box');
  if (!box) return;

  /* Remove empty-state div if present */
  const empty = box.querySelector('[data-empty]');
  if (empty) empty.remove();

  const sellerName = listing?.profiles?.full_name || 'Seller';
  const sellerInit = sellerName.split(' ').map(n => n[0]).slice(0,2).join('').toUpperCase() || 'S';
  const buyerInit  = (buyerName || 'B').split(' ').map(n => n[0]).slice(0,2).join('').toUpperCase();

  const isSeller = m.sender === 'seller';
  const d        = new Date(m.created_at);
  const timeStr  = d.toLocaleTimeString('en-KE', { hour:'2-digit', minute:'2-digit' });

  const init   = isSeller ? sellerInit : buyerInit;
  const avCls  = isSeller ? 'seller-av' : 'buyer-av';
  const bubCls = isSeller ? 'seller-b'  : 'buyer-b';
  const rowCls = isSeller ? 'seller-row-msg' : '';

  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <div class="chat-bubble-row ${rowCls}">
      <div class="bubble-av ${avCls}">${init}</div>
      <div>
        <div class="chat-bubble ${bubCls}">${escHtml(m.content || m.message || '')}</div>
        <div class="bubble-time">${timeStr}${isSeller ? ' · Seller' : ''}</div>
      </div>
    </div>`;
  box.appendChild(wrapper.firstElementChild);
  box.scrollTop = box.scrollHeight;
}

/* ─────────────────────────────────────────────────────────────
   Typing indicator helpers
───────────────────────────────────────────────────────────── */
function showTypingIndicator(name) {
  const box = document.getElementById('chat-messages-box');
  if (!box) return;

  /* Don't double-add */
  if (box.querySelector('#nk-typing-indicator')) {
    /* Just reset the auto-hide timer */
    clearTimeout(_typingHideTimer);
    _typingHideTimer = setTimeout(hideTypingIndicator, TYPING_HIDE_DELAY);
    return;
  }

  const el = document.createElement('div');
  el.id = 'nk-typing-indicator';
  el.className = 'nk-typing-row';
  el.innerHTML = `
    <div class="bubble-av seller-av" style="width:26px;height:26px;font-size:9px">
      ${(name || 'S')[0].toUpperCase()}
    </div>
    <div>
      <div class="nk-typing-bubble">
        <span></span><span></span><span></span>
      </div>
      <div class="nk-typing-label">${escHtml(name)} is typing…</div>
    </div>`;
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;

  clearTimeout(_typingHideTimer);
  _typingHideTimer = setTimeout(hideTypingIndicator, TYPING_HIDE_DELAY);
}

function hideTypingIndicator() {
  const el = document.getElementById('nk-typing-indicator');
  if (el) el.remove();
  clearTimeout(_typingHideTimer);
}

/* ─────────────────────────────────────────────────────────────
   OVERRIDE: renderThread()
   Same as before but marks the empty-state div so appendBubble
   can remove it cleanly.
───────────────────────────────────────────────────────────── */
function renderThread() {
  const box = document.getElementById('chat-messages-box');
  if (!box) return;

  if (!threadMessages.length) {
    box.innerHTML = '<div data-empty style="text-align:center;font-size:12px;color:var(--text-3);padding:16px">No messages yet</div>';
    return;
  }

  const sellerName = listing?.profiles?.full_name || 'Seller';
  const sellerInit = sellerName.split(' ').map(n => n[0]).slice(0,2).join('').toUpperCase() || 'S';
  const buyerInit  = (buyerName || 'B').split(' ').map(n => n[0]).slice(0,2).join('').toUpperCase();

  let lastDate = '';
  box.innerHTML = threadMessages.map(m => {
    const isSeller = m.sender === 'seller';
    const d        = new Date(m.created_at);
    const dateStr  = d.toLocaleDateString('en-KE', { weekday:'short', day:'numeric', month:'short' });
    const timeStr  = d.toLocaleTimeString('en-KE', { hour:'2-digit', minute:'2-digit' });
    const sep      = dateStr !== lastDate ? `<div class="chat-date-sep">${dateStr}</div>` : '';
    lastDate       = dateStr;

    const init   = isSeller ? sellerInit : buyerInit;
    const avCls  = isSeller ? 'seller-av' : 'buyer-av';
    const bubCls = isSeller ? 'seller-b'  : 'buyer-b';
    const rowCls = isSeller ? 'seller-row-msg' : '';

    return `${sep}
      <div class="chat-bubble-row ${rowCls}">
        <div class="bubble-av ${avCls}">${init}</div>
        <div>
          <div class="chat-bubble ${bubCls}">${escHtml(m.content || m.message || '')}</div>
          <div class="bubble-time">${timeStr}${isSeller ? ' · Seller' : ''}</div>
        </div>
      </div>`;
  }).join('');

  box.scrollTop = box.scrollHeight;
}