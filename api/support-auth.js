// Step 2 of Star Support gate — Reader Entry Code verification.
// Validates email + 6-digit code. Returns session confirmation on success.
// Supabase lookup wired here when session flow is confirmed.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, reason: 'method_not_allowed' });
  }

  const { email, code } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanCode  = String(code  || '').trim();

  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(200).json({ ok: false, reason: 'invalid_email' });
  }

  if (!/^\d{6}$/.test(cleanCode)) {
    return res.status(200).json({ ok: false, reason: 'invalid_code_format' });
  }

  // Prototype: accept any valid email + 6-digit code.
  // Replace with:
  //   const row = await getLatestUnusedCode(cleanEmail)
  //   verify hash, check expiry, check attempt count
  //   mark code used, update last_login, sign session token

  return res.status(200).json({
    ok: true,
    verified: true,
    user: {
      email:         cleanEmail,
      access_status: 'Active',
      pass_type:     'Paid Access',
    }
  });
}
