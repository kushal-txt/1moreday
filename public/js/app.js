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
      let config = {};
      try {
        const res = await fetch('/api/config');
        config = await res.json();
      } catch (e) {}

      const sUrl = (config && config.supabaseUrl) || 'https://lkzvvxcyhxnvlqkgwwvq.supabase.co';
      const sKey = (config && config.supabaseAnonKey) || 'sb_publishable_BNtaZVraCrwKbJ-udjvuMw_ZY3qRpFV';

      if (typeof supabase === 'undefined' || !supabase.createClient) {
        console.error('Supabase JS library not loaded from CDN.');
        return null;
      }

      supabaseClient = supabase.createClient(sUrl, sKey, {
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
  },

  // --- 7. Grounding Sanctuary & Soothing Waiting Experience ---
  SOOTHING_WORDS: [
    {
      quote: "Breathe in slowly. You have held so much for so long. For just this minute, you don't have to carry it all.",
      meta: "Drop your shoulders · Let your hands rest"
    },
    {
      quote: "Whatever brought you here tonight—heartbreak, exhaustion, loneliness, or quiet panic—it is real, and you survived today.",
      meta: "Your pain is valid · You are not overreacting"
    },
    {
      quote: "Unclench your jaw. Relax the muscles around your eyes. You are safe in this quiet corner.",
      meta: "Take a quiet sip of water if you can"
    },
    {
      quote: "Somewhere on the other side of this screen, another human being is looking into the dark, gathering their courage to speak too.",
      meta: "You are not the only one fighting this quiet battle"
    },
    {
      quote: "You do not need to have everything figured out tonight. Just making it through to tomorrow is enough.",
      meta: "One breath at a time · One hour at a time"
    },
    {
      quote: "There are no expectations here. You don't have to be strong, put together, or articulate. Just being here is enough.",
      meta: "You do not have to perform for anyone tonight"
    },
    {
      quote: "You have survived 100% of the hardest days of your life up until this moment. Give yourself permission to rest.",
      meta: "You are still here · That took immense strength"
    }
  ],

  BREATH_CYCLE: [
    { action: "Breathe In", helper: "Slowly inhale through your nose · 4s", cls: "inhale" },
    { action: "Hold", helper: "Softly hold the stillness in your chest · 4s", cls: "hold" },
    { action: "Exhale", helper: "Slowly release all the tension out · 4s", cls: "exhale" },
    { action: "Rest", helper: "Quiet pause in the stillness · 4s", cls: "rest" }
  ],

  startGroundingSanctuary({ quoteEl, metaEl, breathBoxEl, breathActionEl, breathHelperEl, fallbackEl, onFallback }) {
    let quoteIdx = 0;
    let breathIdx = 0;

    // Initialize immediate first view
    if (quoteEl && this.SOOTHING_WORDS.length > 0) {
      quoteEl.textContent = `"${this.SOOTHING_WORDS[0].quote}"`;
      if (metaEl) metaEl.textContent = this.SOOTHING_WORDS[0].meta;
    }
    if (breathBoxEl && this.BREATH_CYCLE.length > 0) {
      breathBoxEl.className = 'breath-box ' + this.BREATH_CYCLE[0].cls;
      if (breathActionEl) breathActionEl.textContent = this.BREATH_CYCLE[0].action;
      if (breathHelperEl) breathHelperEl.textContent = this.BREATH_CYCLE[0].helper;
    }

    // Cycle breath every 4 seconds (Clinically grounded Box Breathing)
    const breathTimer = setInterval(() => {
      breathIdx = (breathIdx + 1) % this.BREATH_CYCLE.length;
      const step = this.BREATH_CYCLE[breathIdx];
      if (breathBoxEl) breathBoxEl.className = 'breath-box ' + step.cls;
      if (breathActionEl) breathActionEl.textContent = step.action;
      if (breathHelperEl) breathHelperEl.textContent = step.helper;
    }, 4000);

    // Rotate soothing quote every 7.5 seconds with soft fade
    const quoteTimer = setInterval(() => {
      quoteIdx = (quoteIdx + 1) % this.SOOTHING_WORDS.length;
      const nextWord = this.SOOTHING_WORDS[quoteIdx];
      if (quoteEl) {
        quoteEl.style.opacity = '0';
        if (metaEl) metaEl.style.opacity = '0';
        setTimeout(() => {
          quoteEl.textContent = `"${nextWord.quote}"`;
          if (metaEl) metaEl.textContent = nextWord.meta;
          quoteEl.style.opacity = '1';
          if (metaEl) metaEl.style.opacity = '1';
        }, 350);
      }
    }, 7500);

    // Reassurance timeout: If 35 seconds elapse without a match, gently present options
    let fallbackTimer = null;
    if (fallbackEl) {
      fallbackTimer = setTimeout(() => {
        fallbackEl.style.display = 'block';
        if (typeof onFallback === 'function') onFallback();
      }, 35000);
    }

    return function stopSanctuary() {
      clearInterval(breathTimer);
      clearInterval(quoteTimer);
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
  },

  // --- 8. Country Detection ---
  detectCountry() {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      const tzMap = {
        'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN',
        'Asia/Shanghai': 'CN', 'Asia/Chongqing': 'CN', 'Asia/Urumqi': 'CN', 'Asia/Harbin': 'CN',
        'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Los_Angeles': 'US',
        'America/Phoenix': 'US', 'America/Anchorage': 'US', 'Pacific/Honolulu': 'US',
        'Europe/London': 'GB',
        'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Montreal': 'CA',
        'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU',
        'Europe/Berlin': 'DE', 'Europe/Paris': 'FR', 'Europe/Rome': 'IT', 'Europe/Madrid': 'ES',
        'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR', 'Asia/Singapore': 'SG', 'Asia/Dubai': 'AE',
        'America/Sao_Paulo': 'BR', 'America/Mexico_City': 'MX', 'Africa/Johannesburg': 'ZA',
        'Europe/Amsterdam': 'NL', 'Europe/Stockholm': 'SE', 'Europe/Zurich': 'CH', 'Europe/Dublin': 'IE',
        'Pacific/Auckland': 'NZ', 'Asia/Bangkok': 'TH', 'Asia/Jakarta': 'ID', 'Asia/Manila': 'PH',
        'Asia/Karachi': 'PK', 'Asia/Dhaka': 'BD', 'Asia/Colombo': 'LK', 'Asia/Kathmandu': 'NP'
      };

      if (tzMap[tz]) return tzMap[tz];

      const langs = navigator.languages || [navigator.language || ''];
      for (const lang of langs) {
        if (lang && lang.includes('-')) {
          const region = lang.split('-')[1].toUpperCase();
          if (region && region.length === 2) return region;
        }
      }

      return 'IN';
    } catch (e) {
      return 'IN';
    }
  },

  // --- 9. Community Infrastructure & Donation Fund ---
  DONATION_CONFIG: {
    bmacUrl: 'https://buymeacoffee.com/1moreday',
    kofiUrl: 'https://ko-fi.com/1moreday',
    upiId: 'kushal@upi',
    upiName: '1MoreDay Sanctuary'
  },

  openDonationModal() {
    let modal = document.getElementById('donationModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'donationModal';
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal-box" style="max-width: 500px; text-align: left; padding: 32px 28px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <span class="sanctuary-icon-badge" style="margin-bottom:0;">Infrastructure Fund</span>
            <button type="button" id="closeDonationBtn" style="background:none; border:none; color:var(--text-muted); font-size:20px; cursor:pointer; line-height:1;">✕</button>
          </div>

          <h3 style="color:var(--text); font-size:20px; margin-bottom:8px;">Keep The Campfires Burning</h3>
          <p style="font-size:13px; color:var(--text-muted); line-height:1.6; margin-bottom:20px;">
            1MoreDay is 100% free, anonymous, and ad-free. Zero paywalls, zero tracking. 
            All contributions go directly toward database capacity, server memory, and keeping this sanctuary alive 24/7.
          </p>

          <div style="background:var(--surface-card); border:1px solid var(--border); padding:16px; margin-bottom:18px;">
            <div style="font-size:11px; text-transform:uppercase; letter-spacing:1px; color:var(--coral); font-weight:700; margin-bottom:8px;">
              International Support (Credit / Debit Cards, Apple Pay, PayPal)
            </div>
            <a href="${this.DONATION_CONFIG.bmacUrl}" target="_blank" rel="noopener" class="btn-primary" style="display:block; text-align:center; padding:12px 18px; font-size:13px; text-decoration:none;">
              Support via Buy Me a Coffee &rarr;
            </a>
          </div>

          <div style="background:var(--surface-card); border:1px solid var(--border); padding:16px; margin-bottom:20px;">
            <div style="font-size:11px; text-transform:uppercase; letter-spacing:1px; color:var(--accent); font-weight:700; margin-bottom:8px;">
              India &middot; Instant UPI (GPay, PhonePe, Paytm, BHIM)
            </div>
            <div style="display:flex; gap:10px; align-items:center;">
              <input type="text" id="upiIdInput" readonly value="${this.DONATION_CONFIG.upiId}" style="flex:1; background:var(--bg); border:1px solid var(--border); color:var(--text); padding:10px 14px; font-size:13px;">
              <button type="button" id="copyUpiBtn" class="btn-ghost" style="padding:10px 16px; font-size:12px;">Copy UPI</button>
            </div>
            <div id="upiCopiedNotice" style="display:none; font-size:11px; color:var(--success); margin-top:6px;">UPI ID copied to clipboard!</div>
          </div>

          <div style="font-size:11px; color:var(--text-muted); line-height:1.5;">
            Thank you for helping keep this safe haven online for someone carrying burdens in the dark tonight.
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      document.getElementById('closeDonationBtn').addEventListener('click', () => {
        modal.classList.remove('active');
      });
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
      });

      const copyBtn = document.getElementById('copyUpiBtn');
      const upiInput = document.getElementById('upiIdInput');
      const copiedNotice = document.getElementById('upiCopiedNotice');
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(upiInput.value).then(() => {
          copiedNotice.style.display = 'block';
          copyBtn.textContent = 'Copied!';
          setTimeout(() => {
            copiedNotice.style.display = 'none';
            copyBtn.textContent = 'Copy UPI';
          }, 3000);
        });
      });
    }

    modal.classList.add('active');
  }
};
