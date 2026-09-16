// functions/_lib/email.js
//
// Cloudflare Workers can't open raw SMTP sockets the way nodemailer needs,
// so this replaces it with a plain HTTP call to Resend (https://resend.com).
// Any HTTP-based email API works the same way (Mailgun, SendGrid, Postmark) —
// just swap the fetch call below.
//
// Set as a Cloudflare Pages secret: RESEND_API_KEY (free tier: 3,000 emails/month)
// Also verify your sending domain/email in the Resend dashboard first.

const FROM = 'DistilleryHub <thedistillerymaster@gmail.com>'; // must be a verified sender in Resend
const APP_URL = 'https://distilleryhub.github.io/DistilleryHub';

export async function sendConfirmDeletionEmail(env, toEmail, name, uid, token, step) {
  const link = `${APP_URL}/confirm-delete?uid=${uid}&token=${token}`;
  const html = `<p>Hi ${name || ''},</p>
    <p>Yeh confirmation ${step} of 3 hai aapke DistilleryHub account delete karne ke request ke liye.</p>
    <p><a href="${link}">Yahan click karke confirm karein</a></p>
    <p>Agar yeh request aapne nahi ki, to Settings mein jaake "Cancel deletion" dabayein.</p>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM,
      to: toEmail,
      subject: `Account deletion confirmation (${step}/3) — DistilleryHub`,
      html,
    }),
  });
  if (!res.ok) throw new Error('Email send failed: ' + (await res.text()));
}
