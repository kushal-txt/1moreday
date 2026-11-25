// 1MoreDay — Client Application Script
// Handles Nickname Generation, Session Persistence, Crisis Detection, Real-Time Messaging, and Safe Text Filters

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
  'cannot go on', 'end it all', 'die tonight', 'kill me'
];

const OMD = {
  // --- Session Management ---
  getSession() {
    return localStorage.getItem('omd_nickname') || null;
  },

  setSession(nickname) {
    localStorage.setItem('omd_nickname', nickname);
  },

  getSessionId() {
    return localStorage.getItem('omd_session_id') || null;
  },

  setSessionId(id) {
    localStorage.setItem('omd_session_id', id);
  },

  generateRandomName() {
    const index = Math.floor(Math.random() * RANDOM_NICKNAMES.length);
    const suffix = Math.floor(Math.random() * 90) + 10;
    return `${RANDOM_NICKNAMES[index]}${suffix}`;
  },

  // --- Content Safety ---
  sanitizeText(text) {
    if (!text) return '';
    let clean = text.replace(/https?:\/\/[^\s]+/gi, '[Link Blocked]');
    clean = clean.replace(/@[a-zA-Z0-9_.]+/gi, '[Handle Blocked]');
    clean = clean.replace(/(t\.me|telegram|snapchat|instagram|ig|discord\.gg)\/[a-zA-Z0-9_.]+/gi, '[Contact Blocked]');
    clean = clean.replace(/\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[Phone Blocked]');
    // Escape HTML to prevent XSS
    clean = clean.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    return clean;
  },

  checkForCrisis(text) {
    const lower = (text || '').toLowerCase();
    for (const kw of CRISIS_KEYWORDS) {
      if (lower.includes(kw)) return true;
    }
    return false;
  },

  // --- Server Session (JWT cookie) ---
  async createServerSession(nickname) {
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname }),
        credentials: 'same-origin'
      });
      if (!res.ok) throw new Error('Session creation failed');
      const data = await res.json();
      if (data.sessionId) this.setSessionId(data.sessionId);
      return data;
    } catch (err) {
      console.error('Server session error:', err);
      return null;
    }
  },

  // --- Server Config (Pusher Keys) ---
  async getConfig() {
    try {
      const res = await fetch('/api/config');
      if (!res.ok) return { pusherKey: '', pusherCluster: 'mt1', configured: false };
      return await res.json();
    } catch (e) {
      return { pusherKey: '', pusherCluster: 'mt1', configured: false };
    }
  },

  // --- Send Message via API ---
  async sendMessage(channel, text, extra = {}) {
    try {
      const res = await fetch('/api/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          text,
          ...extra
        }),
        credentials: 'same-origin'
      });
      return await res.json();
    } catch (e) {
      console.error('Send message error:', e);
      return { error: 'Failed to send' };
    }
  },

  // --- Fetch Messages via API ---
  async fetchMessages(channel, since = 0) {
    try {
      const url = `/api/messages?channel=${encodeURIComponent(channel)}${since ? '&since=' + since : ''}`;
      const res = await fetch(url, { credentials: 'same-origin' });
      if (!res.ok) return [];
      const data = await res.json();
      return data.messages || [];
    } catch (e) {
      return [];
    }
  },

  // --- Pusher Initialization ---
  initPusher(key, cluster) {
    if (!key || key === 'dummy_key' || typeof Pusher === 'undefined') {
      return null;
    }
    try {
      const pusher = new Pusher(key, {
        cluster: cluster || 'mt1',
        authEndpoint: '/api/pusher-auth',
        auth: {
          headers: {}
        }
      });
      return pusher;
    } catch (e) {
      console.warn('Pusher init failed:', e);
      return null;
    }
  },

  // --- Time Formatting ---
  formatTime(date) {
    const d = date || new Date();
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`;
  },

  // --- Country Detection (covers 50+ countries) ---
  detectCountry() {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';

      // South Asia
      if (tz.includes('Calcutta') || tz.includes('Kolkata')) return 'IN';
      if (tz.includes('Karachi')) return 'PK';
      if (tz.includes('Dhaka')) return 'BD';
      if (tz.includes('Colombo')) return 'LK';

      // East Asia
      if (tz.includes('Shanghai') || tz.includes('Chongqing') || tz.includes('Urumqi') || tz.includes('Harbin') || tz.includes('Kashgar')) return 'CN';
      if (tz.includes('Tokyo')) return 'JP';
      if (tz.includes('Seoul')) return 'KR';
      if (tz.includes('Taipei')) return 'TW';
      if (tz.includes('Hong_Kong')) return 'HK';

      // Southeast Asia
      if (tz.includes('Manila')) return 'PH';
      if (tz.includes('Singapore')) return 'SG';
      if (tz.includes('Kuala_Lumpur')) return 'MY';
      if (tz.includes('Bangkok')) return 'TH';
      if (tz.includes('Jakarta')) return 'ID';

      // Middle East
      if (tz.includes('Dubai')) return 'AE';
      if (tz.includes('Beirut')) return 'LB';
      if (tz.includes('Jerusalem') || tz.includes('Tel_Aviv')) return 'IL';
      if (tz.includes('Riyadh')) return 'SA';

      // Americas
      if (tz.includes('New_York') || tz.includes('Chicago') || tz.includes('Denver') || tz.includes('Los_Angeles') || tz.includes('Phoenix') || tz.includes('Anchorage') || tz.includes('Honolulu')) return 'US';
      if (tz.includes('Toronto') || tz.includes('Vancouver') || tz.includes('Edmonton') || tz.includes('Halifax') || tz.includes('Winnipeg')) return 'CA';
      if (tz.includes('Sao_Paulo') || tz.includes('Fortaleza') || tz.includes('Manaus')) return 'BR';
      if (tz.includes('Mexico_City') || tz.includes('Cancun') || tz.includes('Tijuana')) return 'MX';
      if (tz.includes('Buenos_Aires')) return 'AR';
      if (tz.includes('Bogota')) return 'CO';
      if (tz.includes('Santiago')) return 'CL';
      if (tz.includes('Lima')) return 'PE';

      // Oceania
      if (tz.includes('Sydney') || tz.includes('Melbourne') || tz.includes('Brisbane') || tz.includes('Perth') || tz.includes('Adelaide')) return 'AU';
      if (tz.includes('Auckland')) return 'NZ';
      if (tz.includes('Fiji')) return 'FJ';

      // Europe
      if (tz.includes('London')) return 'GB';
      if (tz.includes('Dublin')) return 'IE';
      if (tz.includes('Berlin')) return 'DE';
      if (tz.includes('Paris')) return 'FR';
      if (tz.includes('Madrid')) return 'ES';
      if (tz.includes('Rome')) return 'IT';
      if (tz.includes('Amsterdam')) return 'NL';
      if (tz.includes('Brussels')) return 'BE';
      if (tz.includes('Zurich')) return 'CH';
      if (tz.includes('Vienna')) return 'AT';
      if (tz.includes('Lisbon')) return 'PT';
      if (tz.includes('Stockholm')) return 'SE';
      if (tz.includes('Oslo')) return 'NO';
      if (tz.includes('Copenhagen')) return 'DK';
      if (tz.includes('Helsinki')) return 'FI';
      if (tz.includes('Moscow')) return 'RU';
      if (tz.includes('Warsaw')) return 'PL';

      // Africa
      if (tz.includes('Johannesburg')) return 'ZA';
      if (tz.includes('Lagos')) return 'NG';
      if (tz.includes('Nairobi')) return 'KE';
      if (tz.includes('Accra')) return 'GH';

      // Broad fallbacks
      if (tz.includes('America/')) return 'US';
      if (tz.includes('Europe/')) return 'GB';
      if (tz.includes('Asia/')) return 'IN';
      if (tz.includes('Africa/')) return 'ZA';
      if (tz.includes('Australia/')) return 'AU';

      return 'US';
    } catch (e) {
      return 'US';
    }
  }
};
