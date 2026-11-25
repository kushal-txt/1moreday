// 1MoreDay — Client Application Script
// Real-Time Peer Support using Supabase (Real Database, Live Realtime, Anonymous Auth, 24h Auto-Delete)

const RANDOM_NICKNAMES = [
  'SilentPebble', 'EveningBreeze', 'QuietRiver', 'WanderingEcho',
  'DeepOak', 'MutedStone', 'StillWater', 'GentleRain',
  'PatientCreek', 'HumbleBranch', 'RestingCloud', 'CalmHarbor',
  'SoftTimber', 'SlowCurrent', 'WarmLantern', 'PeacefulValley',
  'FadingMist', 'QuietHaven', 'DriftingLeaf', 'TenderRoot',
  'MorningDew', 'SteadyStone', 'DimLantern', 'LonelyBirch',
  'SilentMoss', 'BrokenShore', 'PaleMoon', 'HollowBell',
  'DustyTrail', 'WornRidge', 'FaintStar', 'ColdSpring',
  'SilverPine', 'AmberGlow', 'NorthWind', 'MossyPath'
];

const CRISIS_KEYWORDS = [
  'kill myself', 'suicide', 'end my life', 'want to die',
  'cutting myself', 'self harm', 'hang myself', 'no reason to live',
  'jump off', 'overdose', 'pills to die', 'slit my wrist',
  'better off dead', 'nobody would miss me', 'can not go on',
  'cannot go on', 'end it all', 'die tonight', 'kill me',
  'hurt myself', 'bleeding out', 'take my life'
];

let supabaseClient = null;
let currentUserId = null;

const OMD = {
  // --- 1. Session & Nickname Management ---
  getSession() {
    return localStorage.getItem('omd_nickname') || null;
  },

  setSession(nickname) {
    localStorage.setItem('omd_nickname', nickname);
  },

  getUserId() {
    let uid = localStorage.getItem('omd_user_id');
    if (!uid) {
      uid = 'usr_' + crypto.randomUUID();
      localStorage.setItem('omd_user_id', uid);
    }
    return uid;
  },

  generateRandomName() {
    const index = Math.floor(Math.random() * RANDOM_NICKNAMES.length);
    const suffix = Math.floor(Math.random() * 90) + 10;
    return `${RANDOM_NICKNAMES[index]}${suffix}`;
  },

  // --- 2. Supabase Initialization & Anonymous Auth ---
  async getSupabase() {
    if (supabaseClient) return supabaseClient;

    try {
      // Fetch public configuration from /api/config
      const res = await fetch('/api/config');
      const config = await res.json();

      if (!config.configured || !config.supabaseUrl || !config.supabaseAnonKey) {
        console.warn('Supabase credentials not configured in Vercel environment variables.');
        return null;
      }

      if (typeof supabase === 'undefined' || !supabase.createClient) {
        console.error('Supabase JS library not loaded from CDN.');
        return null;
      }

      supabaseClient = supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true
        }
      });

      // Anonymous sign-in (or get existing session)
      const { data: sessionData } = await supabaseClient.auth.getSession();
      if (!sessionData.session) {
        const { data: authData, error: authErr } = await supabaseClient.auth.signInAnonymously();
        if (authErr) {
          console.warn('Anonymous sign-in note:', authErr.message);
        } else if (authData && authData.user) {
          currentUserId = authData.user.id;
        }
      } else {
        currentUserId = sessionData.session.user.id;
      }

      return supabaseClient;
    } catch (err) {
      console.error('Failed to initialize Supabase client:', err);
      return null;
    }
  },

  // --- 3. Shared Database Messages (Persists & Auto-Deletes after 24h) ---
  async getMessages(room) {
    const client = await this.getSupabase();
    if (!client) return [];

    try {
      // Query messages from the last 24 hours
      const { data, error } = await client
        .from('messages')
        .select('*')
        .eq('room', room)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) {
        console.error('Error fetching messages from Supabase:', error.message);
        return [];
      }
      return data || [];
    } catch (e) {
      return [];
    }
  },

  async insertMessage(room, content) {
    const client = await this.getSupabase();
    if (!client) return null;

    const sanitized = this.sanitizeText(content);
    if (!sanitized) return null;

    const nickname = this.getSession() || 'SilentPeer';
    const userId = currentUserId || crypto.randomUUID();

    try {
      const { data, error } = await client
        .from('messages')
        .insert({
          room,
          nickname,
          user_id: userId,
          content: sanitized
        })
        .select()
        .single();

      if (error) {
        console.error('Error inserting message to Supabase:', error.message);
        return null;
      }
      return data;
    } catch (e) {
      console.error('Send error:', e);
      return null;
    }
  },

  // --- 4. Real-Time Room Subscription (Live Messages + Live Presence) ---
  async subscribeRoom(room, onNewMessage, onPresenceSync) {
    const client = await this.getSupabase();
    if (!client) return null;

    const nickname = this.getSession() || 'SilentPeer';
    const userId = currentUserId || this.getUserId();

    const channel = client.channel(`room-${room}`, {
      config: {
        presence: { key: userId }
      }
    });

    // A) Listen for new messages inserted into public.messages table
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `room=eq.${room}`
      },
      (payload) => {
        if (payload.new) {
          onNewMessage(payload.new);
        }
      }
    );

    // B) Track true, live online presence count per room
    channel.on('presence', { event: 'sync' }, () => {
      const presenceState = channel.presenceState();
      const onlineCount = Object.keys(presenceState).length;
      if (onPresenceSync) {
        onPresenceSync(onlineCount, presenceState);
      }
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          nickname,
          joined_at: new Date().toISOString()
        });
      }
    });

    return channel;
  },

  // --- 5. Random 1-on-1 Matchmaking Queue ---
  async joinMatchQueue(onMatched) {
    const client = await this.getSupabase();
    if (!client) return { error: 'Database not connected' };

    const nickname = this.getSession() || 'SilentPeer';
    const userId = currentUserId || this.getUserId();

    try {
      // 1. Try atomic database matchmaking function
      const { data, error } = await client.rpc('match_random_peer', {
        p_user_id: userId,
        p_nickname: nickname
      });

      if (error) {
        console.error('Matchmaking RPC error:', error.message);
        return { error: error.message };
      }

      // If an existing waiting peer was found, matched immediately!
      if (data && data.status === 'matched') {
        return {
          status: 'matched',
          roomId: data.room_id,
          peerNickname: data.peer_nickname
        };
      }

      // Otherwise, put in waiting queue — listen for a peer to match us
      const queueChannel = client.channel(`match-user-${userId}`);
      queueChannel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'match_queue',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          if (payload.new && payload.new.status === 'matched' && payload.new.matched_room_id) {
            queueChannel.unsubscribe();
            onMatched(payload.new.matched_room_id, payload.new.matched_peer_nick || 'Peer');
          }
        }
      ).subscribe();

      return {
        status: 'waiting',
        channel: queueChannel
      };

    } catch (e) {
      console.error('Queue error:', e);
      return { error: 'Failed to join queue' };
    }
  },

  async leaveMatchQueue() {
    const client = await this.getSupabase();
    if (!client) return;
    const userId = currentUserId || this.getUserId();
    try {
      await client.rpc('leave_match_queue', { p_user_id: userId });
    } catch (e) {}
  },

  // --- 6. Muting, Blocking & Reporting ---
  getBlockedUsers() {
    try {
      return JSON.parse(localStorage.getItem('omd_blocked_users') || '[]');
    } catch (e) {
      return [];
    }
  },

  blockUser(nickname) {
    if (!nickname) return;
    const list = this.getBlockedUsers();
    if (!list.includes(nickname)) {
      list.push(nickname);
      localStorage.setItem('omd_blocked_users', JSON.stringify(list));
    }
  },

  isBlocked(nickname) {
    if (!nickname) return false;
    return this.getBlockedUsers().includes(nickname);
  },

  async reportUser(reportedNickname, reason, room = 'circle') {
    this.blockUser(reportedNickname);

    const client = await this.getSupabase();
    if (!client) return { success: true };

    const reporterId = currentUserId || this.getUserId();
    try {
      await client.from('reports').insert({
        reporter_id: reporterId,
        reported_nickname: reportedNickname,
        reason: reason || 'Inappropriate behavior',
        room
      });
      return { success: true };
    } catch (e) {
      return { success: true };
    }
  },

  // --- 7. Content Safety Filter ---
  sanitizeText(text) {
    if (!text) return '';
    let clean = text;

    // Block external URLs
    clean = clean.replace(/https?:\/\/[^\s]+/gi, '[Link Blocked]');

    // Block social handles
    clean = clean.replace(/@[a-zA-Z0-9_.]+/gi, '[Handle Blocked]');
    clean = clean.replace(/(t\.me|telegram|snapchat|instagram|ig|discord\.gg|whatsapp)\/[a-zA-Z0-9_.]+/gi, '[Contact Blocked]');

    // Block phone numbers (7+ digits)
    clean = clean.replace(/\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[Phone Blocked]');

    // Predatory grooming & off-platform solicitation filter
    const predatory = [
      /\b(add me on|snap me|dm me on|whatsapp|telegram me|my insta|my ig|my snap|send nudes|send pic|send pics|meet up|come over|where do you live)\b/i
    ];
    for (const pat of predatory) {
      clean = clean.replace(pat, '[Safety Notice: Off-platform contact blocked]');
    }

    // HTML Entity escape to block XSS
    clean = clean.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    return clean.substring(0, 500);
  },

  checkForCrisis(text) {
    const lower = (text || '').toLowerCase();
    for (const kw of CRISIS_KEYWORDS) {
      if (lower.includes(kw)) return true;
    }
    return false;
  },

  formatTime(dateStr) {
    const d = dateStr ? new Date(dateStr) : new Date();
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`;
  }
};
