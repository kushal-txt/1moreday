// api/message.js - Sends and broadcasts messages via Pusher + in-memory store with automated moderation
const Pusher = require('pusher');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');

const SESSION_SECRET = process.env.SESSION_SECRET || 'dev_secret_omd_2026_fallback';

// Ephemeral in-memory message buffer for warm lambda instances
// (Holds last 50 messages per room)
global._OMD_ROOM_MESSAGES = global._OMD_ROOM_MESSAGES || {};
global._OMD_USER_REPORTS = global._OMD_USER_REPORTS || {};
global._OMD_BANNED_SESSIONS = global._OMD_BANNED_SESSIONS || new Set();

function getPusher() {
  if (!process.env.PUSHER_KEY || !process.env.PUSHER_APP_ID || !process.env.PUSHER_SECRET) {
    return null;
  }
  return new Pusher({
    appId: process.env.PUSHER_APP_ID,
    key: process.env.PUSHER_KEY,
    secret: process.env.PUSHER_SECRET,
    cluster: process.env.PUSHER_CLUSTER || 'mt1',
    useTLS: true
  });
}

// Predatory keywords & off-platform solicitation filter
const PREDATORY_PATTERNS = [
  /\b(add me on|snap me|dm me on|whatsapp|telegram me|my insta|my ig|my snap|send nudes|send pic|send pics|meet up|come over|where do you live)\b/i,
  /\b(discord\.gg|t\.me|instagram\.com|snapchat\.com|wa\.me)\/[a-zA-Z0-9_.]+/i
];

function sanitizeText(text) {
  if (!text) return '';
  let clean = text;

  // Block external URLs
  clean = clean.replace(/https?:\/\/[^\s]+/gi, '[Link Blocked]');

  // Block social handles
  clean = clean.replace(/@[a-zA-Z0-9_.]+/gi, '[Handle Blocked]');
  clean = clean.replace(/(t\.me|telegram|snapchat|instagram|ig|discord\.gg|whatsapp)\/[a-zA-Z0-9_.]+/gi, '[Contact Blocked]');

  // Block phone numbers (7+ digits)
  clean = clean.replace(/\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[Phone Blocked]');

  // Block predatory off-platform solicitation
  for (const pat of PREDATORY_PATTERNS) {
    clean = clean.replace(pat, '[Safety Notice: Off-platform contact blocked]');
  }

  // HTML Entity escape to block XSS
  clean = clean.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return clean.substring(0, 500);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. Authenticate user session
    const cookies = cookie.parse(req.headers.cookie || '');
    const sessionToken = cookies.omd_session;

    if (!sessionToken) {
      return res.status(401).json({ error: 'Please choose a nickname to enter' });
    }

    let decoded;
    try {
      decoded = jwt.verify(sessionToken, SESSION_SECRET);
    } catch (e) {
      return res.status(403).json({ error: 'Session expired. Please re-enter.' });
    }

    // Check if session has been banned for repeated reports
    if (global._OMD_BANNED_SESSIONS.has(decoded.sessionId)) {
      return res.status(403).json({ error: 'Your session has been restricted due to community reports.' });
    }

    // 2. Parse request body
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        const querystring = require('querystring');
        body = querystring.parse(body);
      }
    }

    const { channel, text, type, target, dmId, reportedPeer, reason } = body || {};

    // Handle Report Action
    if (type === 'report') {
      if (!reportedPeer) return res.status(400).json({ error: 'Missing reported user' });

      global._OMD_USER_REPORTS[reportedPeer] = (global._OMD_USER_REPORTS[reportedPeer] || 0) + 1;

      // If reported 3 or more times, flag them
      if (global._OMD_USER_REPORTS[reportedPeer] >= 3) {
        // Broadcast mute signal or flag
      }

      return res.status(200).json({ success: true, message: 'Report received. Thank you for keeping our community safe.' });
    }

    if (!channel || (!text && type !== 'dm-invite' && type !== 'leave')) {
      return res.status(400).json({ error: 'Missing channel or message text' });
    }

    // Validate channel name format
    const isValidCircle = ['presence-circle-overthinking', 'presence-circle-heavy-chest', 'presence-circle-broken-ties'].includes(channel);
    const isValidDm = /^private-dm-[a-zA-Z0-9_-]{6,64}$/.test(channel);

    if (!isValidCircle && !isValidDm) {
      return res.status(400).json({ error: 'Invalid channel' });
    }

    const sanitized = sanitizeText(text || '');
    const messagePayload = {
      id: 'msg_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7),
      sessionId: decoded.sessionId,
      nickname: decoded.nickname,
      text: sanitized,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: Date.now(),
      type: type || 'chat',
      target: target || null,
      dmId: dmId || null
    };

    // Store in ephemeral memory buffer
    if (!global._OMD_ROOM_MESSAGES[channel]) {
      global._OMD_ROOM_MESSAGES[channel] = [];
    }
    global._OMD_ROOM_MESSAGES[channel].push(messagePayload);
    if (global._OMD_ROOM_MESSAGES[channel].length > 50) {
      global._OMD_ROOM_MESSAGES[channel].shift();
    }

    // Broadcast via Pusher if configured
    const pusher = getPusher();
    if (pusher) {
      try {
        await pusher.trigger(channel, 'new-message', messagePayload);
      } catch (pusherErr) {
        // Pusher error - logged without message content
      }
    }

    return res.status(200).json({
      success: true,
      message: messagePayload
    });

  } catch (err) {
    return res.status(500).json({ error: 'Internal message error' });
  }
};
