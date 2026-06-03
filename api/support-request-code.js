// Step 1 of Star Support gate — email lookup and code dispatch.
//
// Checks whether the email belongs to a user with:
//   - at least one active product entitlement (any Stoic Qabalah product), OR
//   - support_access_enabled = true (admin/lifetime override)
//   - AND support_chat_credits_remaining > 0 (unless admin override)
//
// If approved, generates a 6-digit code, stores the hash, and sends it via Brevo.

import {
  normalizeEmail,
  isValidEmail,
  getUserByEmail,
  getActiveEntitlements,
  isApprovedForSupport,
  approvalReason,
  createSupportCode,
} from '../lib/supportAccess.js';
import { sendEmail } from '../lib/sendEmail.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, reason: 'method_not_allowed' });
  }

  try {
    const { email } = req.body || {};
    const cleanEmail = normalizeEmail(email);

    if (!isValidEmail(cleanEmail)) {
      return res.status(200).json({ ok: false, reason: 'invalid_email' });
    }

    // 1. Look up user record
    const user = await getUserByEmail(cleanEmail);

    // 2. Look up active product entitlements
    const entitlements = user ? await getActiveEntitlements(cleanEmail) : [];

    // 3. Check approval across all products
    if (!isApprovedForSupport(user, entitlements)) {
      const reason = approvalReason(user, entitlements);
      console.info('[support-request-code] not approved', { email: cleanEmail, reason });
      // Return generic account_not_found — do not reveal internal reason to frontend
      return res.status(200).json({ ok: false, reason: 'account_not_found' });
    }

    // 4. Generate and store 6-digit code
    const result = await createSupportCode(cleanEmail);
    if (!result.ok) {
      return res.status(200).json({ ok: false, reason: result.reason });
    }

    // 5. Send code via Brevo transactional email
    const supportUrl = process.env.SUPPORT_URL || 'https://starsupport.astroqabalah.com';

    const sent = await sendEmail({
      to:      cleanEmail,
      subject: 'Your Star Support Code',
      html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#10100E;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#10100E;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="620" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;width:100%;background-color:#181611;border:1px solid #3A3122;border-radius:16px;overflow:hidden;">

          <tr>
            <td style="padding:34px 40px 26px 40px;border-bottom:1px solid #3A3122;">
              <p style="margin:0 0 6px 0;color:#C9A45D;font-family:Georgia,serif;font-size:11px;font-weight:bold;letter-spacing:0.2em;text-transform:uppercase;">Stoic Qabalah Presents</p>
              <p style="margin:0;color:#F5EFE2;font-family:Georgia,serif;font-size:30px;font-weight:normal;letter-spacing:-0.01em;">Star Support</p>
              <p style="margin:8px 0 0 0;color:#A89880;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;">Your Stoic Qabalah Support Agent</p>
            </td>
          </tr>

          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 8px 0;color:#C9A45D;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;letter-spacing:0.18em;text-transform:uppercase;">Paid Access</p>
              <h1 style="margin:0 0 10px 0;color:#F5EFE2;font-family:Georgia,serif;font-size:28px;font-weight:normal;line-height:1.2;">Your Star Support Code</h1>
              <p style="margin:0 0 24px 0;color:#B8A98D;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.7;">Use this code to continue into Star Support.</p>

              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
                <tr>
                  <td align="center" style="background-color:#211D16;border:1px solid #3A3122;border-left:4px solid #008C00;border-radius:8px;padding:26px 24px;">
                    <p style="margin:0 0 10px 0;color:#00B000;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;letter-spacing:0.18em;text-transform:uppercase;">Ready to Go</p>
                    <p style="margin:0;color:#F5EFE2;font-family:'Cormorant Garamond',Georgia,serif;font-size:34px;font-weight:700;letter-spacing:0.18em;line-height:1.05;">${result.code}</p>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background-color:#16140F;border:1px solid #3A3122;border-radius:8px;padding:18px 20px;">
                    <p style="margin:0;color:#B8A98D;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;">This code expires in 10 minutes. Do not share it. If you did not request this code, you can ignore this email.</p>
                  </td>
                </tr>
              </table>

              <a href="${supportUrl}" style="display:inline-block;background-color:rgba(0,140,0,0.72);color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;letter-spacing:0.12em;text-transform:uppercase;text-decoration:none;padding:12px 24px;border-radius:999px;">Open Star Support</a>

              <p style="margin:26px 0 0 0;color:#6E6050;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;">This access code was requested for ${cleanEmail}.</p>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 40px 30px 40px;border-top:1px solid #3A3122;background-color:#15130F;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 18px auto;">
                <tr>
                  <td align="center" width="25%" style="padding:0 8px;">
                    <img src="${supportUrl}/email-assets/elem-fire.jpg" width="56" height="56" alt="Fire" style="display:block;width:56px;height:56px;border-radius:8px;margin:0 auto 4px auto;object-fit:cover;">
                    <div style="color:#C9A45D;font-family:Georgia,serif;font-size:16px;line-height:1;margin-bottom:6px;">△</div>
                    <div style="color:#7E705E;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;">Fire</div>
                  </td>
                  <td align="center" width="25%" style="padding:0 8px;">
                    <img src="${supportUrl}/email-assets/elem-water.jpg" width="56" height="56" alt="Water" style="display:block;width:56px;height:56px;border-radius:8px;margin:0 auto 4px auto;object-fit:cover;">
                    <div style="color:#C9A45D;font-family:Georgia,serif;font-size:16px;line-height:1;margin-bottom:6px;">▽</div>
                    <div style="color:#7E705E;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;">Water</div>
                  </td>
                  <td align="center" width="25%" style="padding:0 8px;">
                    <img src="${supportUrl}/email-assets/elem-air.jpg" width="56" height="56" alt="Air" style="display:block;width:56px;height:56px;border-radius:8px;margin:0 auto 4px auto;object-fit:cover;">
                    <div style="color:#C9A45D;font-family:Georgia,serif;font-size:16px;line-height:1;margin-bottom:6px;">🜁</div>
                    <div style="color:#7E705E;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;">Air</div>
                  </td>
                  <td align="center" width="25%" style="padding:0 8px;">
                    <img src="${supportUrl}/email-assets/elem-earth.jpg" width="56" height="56" alt="Earth" style="display:block;width:56px;height:56px;border-radius:8px;margin:0 auto 4px auto;object-fit:cover;">
                    <div style="color:#C9A45D;font-family:Georgia,serif;font-size:16px;line-height:1;margin-bottom:6px;">🜃</div>
                    <div style="color:#7E705E;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;">Earth</div>
                  </td>
                </tr>
              </table>

              <p style="margin:0;color:#6E6050;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;">
                Stoic Qabalah · Star Support<br>
                AstroQabalah &mdash; The Tree of Life Reader &amp; Hermetic Oracle
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim(),
    });

    if (!sent.ok) {
      return res.status(200).json({ ok: false, reason: sent.reason });
    }

    return res.status(200).json({ ok: true, code_sent: true, expires_in_minutes: 10 });

  } catch (err) {
    console.error('[support-request-code] error', err);
    return res.status(500).json({ ok: false, reason: 'server_error' });
  }
}
