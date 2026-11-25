// api/messages.js - Retrieves recent messages for a room (ephemeral buffer)
const cookie = require('cookie');
const jwt = require('jsonwebtoken');

const SESSION_SECRET = process.env.SESSION_SECRET || 'dev_secret_omd_2026_fallback';
global._OMD_ROOM_MESSAGES = global._OMD_ROOM_MESSAGES || {};

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { channel, since } = req.query;

  if (!channel) {
    return res.status(400).json({ error: 'Missing channel parameter' });
  }

  const list = global._OMD_ROOM_MESSAGES[channel] || [];
  const sinceTime = parseInt(since, 10) || 0;

  const filtered = sinceTime > 0
    ? list.filter(m => m.timestamp > sinceTime)
    : list.slice(-30);

  return res.status(200).json({
    channel,
    count: filtered.length,
    messages: filtered
  });
};
