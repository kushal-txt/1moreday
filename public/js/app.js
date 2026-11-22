// OneMoreDay — Client Application Script
// Handles Nickname Generation, Session Persistence, Crisis Keyword Detection, and Safe Messaging

const RANDOM_NICKNAMES = [
  'SilentPebble', 'EveningBreeze', 'QuietRiver', 'WanderingEcho', 
  'DeepOak', 'MutedStone', 'StillWater', 'GentleRain', 
  'PatientCreek', 'HumbleBranch', 'RestingCloud', 'CalmHarbor',
  'SoftTimber', 'SlowCurrent', 'WarmLantern', 'PeacefulValley'
];

const CRISIS_KEYWORDS = [
  'kill myself', 'suicide', 'end my life', 'want to die', 
  'cutting myself', 'self harm', 'hang myself', 'no reason to live'
];

const OMD = {
  // 1. Get or Generate Anonymous Session
  getSession() {
    const stored = localStorage.getItem('omd_nickname');
    return stored || null;
  },

  setSession(nickname) {
    localStorage.setItem('omd_nickname', nickname);
  },

  generateRandomName() {
    const index = Math.floor(Math.random() * RANDOM_NICKNAMES.length);
    const suffix = Math.floor(Math.random() * 90) + 10;
    return `${RANDOM_NICKNAMES[index]}${suffix}`;
  },

  // 2. Client-side Content Guard (Blocks Phone numbers, URLs, Social Handles)
  sanitizeText(text) {
    if (!text) return '';
    
    // Block URLs
    let clean = text.replace(/https?:\/\/[^\s]+/gi, '[Link Blocked]');
    
    // Block Social Handles (@user, t.me/, instagram.com, etc.)
    clean = clean.replace(/@[a-zA-Z0-9_.]+/gi, '[Handle Blocked]');
    clean = clean.replace(/(t\.me|telegram|snapchat|instagram|ig)\/[a-zA-Z0-9_.]+/gi, '[Contact Blocked]');
    
    // Block Phone Numbers (7+ contiguous or separated digits)
    clean = clean.replace(/\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[Phone Number Blocked]');

    return clean;
  },

  // 3. Crisis Keyword Check
  checkForCrisis(text) {
    const lower = (text || '').toLowerCase();
    for (const kw of CRISIS_KEYWORDS) {
      if (lower.includes(kw)) {
        return true;
      }
    }
    return false;
  },

  // 4. Auto-detect Visitor Country & Timezone for Helplines
  detectCountry() {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      if (tz.includes('Calcutta') || tz.includes('Asia/Kolkata')) return 'IN';
      if (tz.includes('New_York') || tz.includes('Chicago') || tz.includes('Los_Angeles') || tz.includes('America/')) return 'US';
      if (tz.includes('London') || tz.includes('Europe/London')) return 'GB';
      if (tz.includes('Sydney') || tz.includes('Melbourne') || tz.includes('Australia/')) return 'AU';
      if (tz.includes('Toronto') || tz.includes('Vancouver')) return 'CA';
      if (tz.includes('Berlin') || tz.includes('Paris') || tz.includes('Europe/')) return 'EU';
      return 'US'; // default fallback
    } catch (e) {
      return 'US';
    }
  }
};
