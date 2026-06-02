// Safe account snapshot — returns only user-safe fields.
// Supabase query wired here when session flow is confirmed.

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Prototype: return mock safe account data.
  // Replace with Supabase lookup keyed on verified session/code.
  const snapshot = {
    email:               'member@example.com',
    access_status:       'Active',
    pass_type:           'Paid Access',
    entry_code_status:   'Verified',
    oracle_credits:      12,
    support_credits:     5,
    trial_expiry:        null,
    last_support_access: 'Today',
  };

  return res.status(200).json(snapshot);
}
