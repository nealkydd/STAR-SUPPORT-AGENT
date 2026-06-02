// Reader Entry Code verification.
// Supabase lookup wired here when session flow is confirmed.

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code } = req.body || {};

  if (!code || typeof code !== 'string' || !code.trim()) {
    return res.status(400).json({ valid: false, reason: 'No code supplied' });
  }

  // Prototype: accept any non-empty code.
  // Replace with: query Supabase for matching entry_code where active = true.
  return res.status(200).json({ valid: true });
}
