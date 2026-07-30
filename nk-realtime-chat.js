/**
 * nk-realtime-chat.js
 * ─────────────────────────────────────────────────────────────
 * NyumbaKisumu — shared realtime chat engine
 *
 * Provides:
 *   NKChat.subscribeMessages(channelName, filter, onInsert)
 *   NKChat.subscribeTyping(channelName, myId, onTyping)
 *   NKChat.broadcastTyping(channelName, myId, displayName)
 *   NKChat.stopTyping(channelName, myId)
 *   NKChat.unsubscribeAll()
 *
 * Usage — in any page that already has `db` (Supabase client):
 *
 *   // 1. Subscribe to new rows in `messages` for a listing
 *   NKChat.subscribeMessages(
 *     'listing-chat-' + listingId,
 *     `listing_id=eq.${listingId}`,
 *     (newMsg) => { ... append bubble ... }
 *   );
 *
 *   // 2. Broadcast "I am typing" (call on textarea `input` event)
 *   NKChat.broadcastTyping('listing-chat-' + listingId, myToken, 'Brian');
 *
 *   // 3. Listen for typing events from the other side
 *   NKChat.subscribeTyping('listing-chat-' + listingId, myToken, ({ from, name }) => {
 *     showTypingIndicator(name);
 *   });
 * ─────────────────────────────────────────────────────────────
 */
const NKChat = (() => {
  const channels   = new Map();   // channelName → RealtimeChannel
  const typingTimers = new Map(); // channelName+userId → clearTimeout handle

  /**
   * Subscribe to INSERT events on a Supabase table.
   * @param {string}   channelName  Unique name for this subscription
   * @param {string}   table        Supabase table name
   * @param {string}   filter       Supabase filter string e.g. "listing_id=eq.abc"
   * @param {Function} onInsert     Called with the new row payload
   * @param {object}   dbClient     The Supabase client (`db`)
   */
  function subscribeMessages(channelName, table, filter, onInsert, dbClient) {
    // Tear down existing subscription with same name
    if (channels.has(channelName)) {
      channels.get(channelName).unsubscribe();
      channels.delete(channelName);
    }

    const ch = dbClient
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table, filter },
        (payload) => onInsert(payload.new)
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.debug('[NKChat] subscribed:', channelName);
        }
      });

    channels.set(channelName, ch);
    return ch;
  }

  /**
   * Broadcast a "typing" signal via Supabase Presence / Broadcast.
   * Automatically stops after 3 s of no new calls.
   * @param {string} channelName   Must match the channel used by subscribeTyping
   * @param {string} myId          Unique ID for this user (buyerToken, userId, etc.)
   * @param {string} displayName   Human-readable name shown to the other party
   * @param {object} dbClient
   */
  function broadcastTyping(channelName, myId, displayName, dbClient) {
    const key = channelName + '::' + myId;

    // Get or create the broadcast channel
    let ch = channels.get(channelName + '::typing');
    if (!ch) {
      ch = dbClient.channel(channelName + '::typing');
      ch.subscribe();
      channels.set(channelName + '::typing', ch);
    }

    ch.send({
      type:    'broadcast',
      event:   'typing',
      payload: { id: myId, name: displayName, typing: true },
    });

    // Auto-stop after 3 s silence
    clearTimeout(typingTimers.get(key));
    typingTimers.set(key, setTimeout(() => {
      ch.send({
        type:    'broadcast',
        event:   'typing',
        payload: { id: myId, name: displayName, typing: false },
      });
      typingTimers.delete(key);
    }, 3000));
  }

  /**
   * Listen for typing events from the other party.
   * @param {string}   channelName
   * @param {string}   myId         Filter out our own typing events
   * @param {Function} onTyping     Called with { id, name, typing }
   * @param {object}   dbClient
   */
  function subscribeTyping(channelName, myId, onTyping, dbClient) {
    const typingChName = channelName + '::typing';

    // Reuse existing channel if already created by broadcastTyping
    let ch = channels.get(typingChName);
    if (!ch) {
      ch = dbClient.channel(typingChName);
      ch.subscribe();
      channels.set(typingChName, ch);
    }

    ch.on('broadcast', { event: 'typing' }, ({ payload }) => {
      // Ignore our own typing signals
      if (payload.id === myId) return;
      onTyping(payload);
    });
  }

  /** Unsubscribe from everything (call on page unload / navigation) */
  function unsubscribeAll() {
    channels.forEach(ch => ch.unsubscribe());
    channels.clear();
    typingTimers.forEach(t => clearTimeout(t));
    typingTimers.clear();
  }

  return { subscribeMessages, broadcastTyping, subscribeTyping, unsubscribeAll };
})();

// Clean up on page navigation
window.addEventListener('beforeunload', () => NKChat.unsubscribeAll());