// api/session.js - Issues a cryptographically signed, stateless session token
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const crypto = require('crypto');

const SESSION_SECRET = process.env.SESSION_SECRET || 'dev_secret_omd_2026_fallback';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        const querystring = require('querystring');
        body = querystring.parse(body);
      }
    }
    const { nickname } = body || {};

    // Sanitize nickname (letters, numbers, underscores, max 20 chars)
    const cleanName = (nickname || 'Anonymous')
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .substring(0, 20) || 'SilentPeer';

    // Generate unique session ID
    const sessionId = 'usr_' + crypto.randomUUID();

    // Sign payload
    const token = jwt.sign(
      {
        sessionId,
        nickname: cleanName,
        createdAt: Date.now()
      },
      SESSION_SECRET,
      { expiresIn: '24h' }
    );

    // Set HttpOnly, Secure, SameSite=Lax cookie
    res.setHeader(
      'Set-Cookie',
      cookie.serialize('omd_session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 86400, // 24 hours
        path: '/'
      })
    );

    return res.status(200).json({
      success: true,
      sessionId,
      nickname: cleanName
    });
  } catch (err) {
    console.error('Session creation error:', err);
    return res.status(500).json({ error: 'Failed to create anonymous session' });
  }
};
