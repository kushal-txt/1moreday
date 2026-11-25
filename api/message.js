// api/message.js - Sends and broadcasts messages via Pusher + in-memory store
const Pusher = require('pusher');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');

const SESSION_SECRET = process.env.SESSION_SECRET || 'dev_secret_omd_2026_fallback';

// Ephemeral in-memory message buffer for warm lambda instances
// (Holds last 50 messages per room)
global._OMD_ROOM_MESSAGES = global._OMD_ROOM_MESSAGES || {};

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

function sanitizeText(text) {
  if (!text) return '';
  let clean = text.replace(/https?:\/\/[^\s]+/gi, '[Link Blocked]');
  clean = clean.replace(/@[a-zA-Z0-9_.]+/gi, '[Handle Blocked]');
  clean = clean.replace(/(t\.me|telegram|snapchat|instagram|ig|discord\.gg)\/[a-zA-Z0-9_.]+/gi, '[Contact Blocked]');
  clean = clean.replace(/\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[Phone Blocked]');
  clean = clean.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return clean.substring(0, 500);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. Authenticate user
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

    const { channel, text, type, target, dmId } = body || {};

    if (!channel || (!text && type !== 'dm-invite')) {
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
        console.warn('Pusher broadcast warning:', pusherErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: messagePayload
    });

  } catch (err) {
    console.error('Message endpoint error:', err);
    return res.status(500).json({ error: 'Internal message error' });
  }
};
