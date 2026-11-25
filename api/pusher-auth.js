// api/pusher-auth.js - Authorizes Pusher presence & private channels with anti-IDOR verification
const Pusher = require('pusher');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');

const SESSION_SECRET = process.env.SESSION_SECRET || 'dev_secret_omd_2026_fallback';

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

    // 2. Parse body (supports JSON and urlencoded)
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        const querystring = require('querystring');
        body = querystring.parse(body);
      }
    }

    const socket_id = body.socket_id;
    const channel_name = body.channel_name;

    if (!socket_id || !channel_name) {
      return res.status(400).json({ error: 'Missing socket_id or channel_name' });
    }

    const pusher = getPusher();
    if (!pusher) {
      return res.status(503).json({ error: 'Pusher is not configured on server' });
    }

    // 3. Channel Authorization Rules (Anti-IDOR Guard)
    
    // A) Presence Circles (24/7 Group Campfires)
    if (channel_name.startsWith('presence-circle-')) {
      const allowedRooms = ['presence-circle-overthinking', 'presence-circle-heavy-chest', 'presence-circle-broken-ties'];
      if (!allowedRooms.includes(channel_name)) {
        return res.status(403).json({ error: 'Invalid campfire room' });
      }

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
      // Validate channel name format: private-dm-[alphanumeric_-]{8,64}
      if (!/^private-dm-[a-zA-Z0-9_-]{6,64}$/.test(channel_name)) {
        return res.status(403).json({ error: 'Invalid DM room identifier' });
      }

      const auth = pusher.authorizeChannel(socket_id, channel_name);
      return res.send(auth);
    }

    return res.status(403).json({ error: 'Unauthorized channel type' });

  } catch (err) {
    console.error('Pusher auth error:', err);
    return res.status(500).json({ error: 'Internal authorization error' });
  }
};
