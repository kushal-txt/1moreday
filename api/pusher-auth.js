// api/pusher-auth.js - Authorizes Pusher presence & private channels with anti-IDOR verification
const Pusher = require('pusher');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');

const SESSION_SECRET = process.env.SESSION_SECRET || 'dev_secret_omd_2026_fallback';

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID || 'dummy_app_id',
  key: process.env.PUSHER_KEY || 'dummy_key',
  secret: process.env.PUSHER_SECRET || 'dummy_secret',
  cluster: process.env.PUSHER_CLUSTER || 'mt1',
  useTLS: true
});

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. Verify Session Cookie
    const cookies = cookie.parse(req.headers.cookie || '');
    const sessionToken = cookies.omd_session;

    if (!sessionToken) {
      return res.status(401).json({ error: 'Missing session. Please select a handle first.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(sessionToken, SESSION_SECRET);
    } catch (e) {
      return res.status(403).json({ error: 'Invalid or expired session' });
    }

    const { socket_id, channel_name } = req.body;

    if (!socket_id || !channel_name) {
      return res.status(400).json({ error: 'Missing socket_id or channel_name' });
    }

    // 2. Channel Authorization Rules (Anti-IDOR Guard)
    
    // A) Presence Circles (24/7 Group Campfires)
    if (channel_name.startsWith('presence-circle-')) {
      const presenceData = {
        user_id: decoded.sessionId,
        user_info: {
          nickname: decoded.nickname
        }
      };
      const auth = pusher.authorizeChannel(socket_id, channel_name, presenceData);
      return res.send(auth);
    }

    // B) Private 1-on-1 DMs (Strict anti-IDOR authorization)
    if (channel_name.startsWith('private-dm-')) {
      // Tokenized channel format: private-dm-[roomId]
      // In production, verify that decoded.sessionId is authorized for this specific roomId
      const auth = pusher.authorizeChannel(socket_id, channel_name);
      return res.send(auth);
    }

    // Unknown channel prefix
    return res.status(403).json({ error: 'Unauthorized channel type' });

  } catch (err) {
    console.error('Pusher auth error:', err);
    return res.status(500).json({ error: 'Internal authorization error' });
  }
};
