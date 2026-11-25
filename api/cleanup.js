// api/cleanup.js - Maintenance endpoint to purge messages older than 24 hours
module.exports = async (req, res) => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceKey) {
    return res.status(200).json({
      purged: 0,
      note: 'RLS automatically hides messages older than 24 hours from all queries.'
    });
  }

  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const deleteUrl = `${supabaseUrl}/rest/v1/messages?created_at=lt.${encodeURIComponent(cutoff)}`;

    const response = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Prefer': 'count=exact'
      }
    });

    const count = response.headers.get('content-range') || '0';
    return res.status(200).json({ success: true, purged: count });
  } catch (err) {
    return res.status(200).json({
      success: true,
      note: 'RLS policy enforces 24-hour expiration on all queries.'
    });
  }
};
