// api/config.js - Public configuration for client real-time connection
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');

  return res.status(200).json({
    pusherKey: process.env.PUSHER_KEY || '',
    pusherCluster: process.env.PUSHER_CLUSTER || 'mt1',
    configured: Boolean(process.env.PUSHER_KEY && process.env.PUSHER_APP_ID && process.env.PUSHER_SECRET)
  });
};
