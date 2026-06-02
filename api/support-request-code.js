// Step 1 of Star Support gate — email lookup.
// Checks whether the email is a recognised Paid Access member.
// If valid, generates and sends a Reader Entry Code to that email.
// Supabase lookup + email send wired here when session flow is confirmed.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, reason: 'method_not_allowed' });
  }

  const { email } = req.body || {};
  const clean = String(email || '').trim().toLowerCase();

  if (!clean || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
    return res.status(200).json({ ok: false, reason: 'invalid_email' });
  }

  // Prototype: accept any valid email format.
  // Replace with:
  //   const user = await supabase.from('users').select().eq('email', clean).single()
  //   if (!user || !user.access_active) return { ok: false, reason: 'account_not_found' }
  //   generate 6-digit code, store hash, send via email provider

  return res.status(200).json({ ok: true, code_sent: true, expires_in_minutes: 10 });
}
