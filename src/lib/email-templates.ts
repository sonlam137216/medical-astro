/** Email presentation only. Database timestamps remain UTC; readers see Vietnam time. */
export const EMAIL_TIME_ZONE = 'Asia/Ho_Chi_Minh';
export const EMAIL_TIME_LABEL = 'Vietnam time (UTC+7)';

const dateFormatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: EMAIL_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function formatEmailDate(value: string | number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  const parts = Object.fromEntries(dateFormatter.formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts.day}/${parts.month}/${parts.year} · ${parts.hour}:${parts.minute}`;
}

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}
interface Detail {
  label: string;
  value: string;
  monospace?: boolean;
}
interface Template {
  subject: string;
  category: string;
  title: string;
  intro: string;
  details: Detail[];
  action: string;
  url: string;
  note: string;
  footer: string;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Tables and inline styles work in email clients without external images, fonts or scripts. */
function render(template: Template): EmailContent {
  const esc = escapeHtml;
  const details = template.details
    .map(
      (detail) => `<tr><td style="padding:0 0 18px">
    <p style="margin:0 0 5px;font-size:12px;line-height:18px;color:#5a6780">${esc(detail.label)}</p>
    <p style="margin:0;font-family:${detail.monospace ? 'Consolas,monospace' : 'Arial,Helvetica,sans-serif'};font-size:${detail.monospace ? '13px' : '15px'};line-height:23px;font-weight:600;color:#14213d;word-break:break-all;overflow-wrap:anywhere">${esc(detail.value)}</p>
  </td></tr>`,
    )
    .join('');
  const text = [
    'MELATEC DENTAL CLINIC',
    template.title,
    template.intro,
    ...template.details.map((detail) => `${detail.label}: ${detail.value}`),
    `${template.action}:\n${template.url}`,
    template.note,
    template.footer,
  ].join('\n\n');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(template.subject)}</title>
<style>@media only screen and (max-width:480px){.email-shell{padding:16px 10px!important}.email-content{padding:28px 22px!important}.email-title{font-size:26px!important;line-height:33px!important}}</style>
</head><body style="margin:0;padding:0;background-color:#f0f4fa;color:#14213d;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">
<div style="display:none;font-size:1px;line-height:1px;color:#f0f4fa;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${esc(template.intro)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#f0f4fa"><tr><td class="email-shell" align="center" style="padding:40px 16px">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border:1px solid #dfe7f2;border-radius:16px;background-color:#ffffff">
<tr><td style="padding:26px 32px;background-color:#0a1a3d;border-radius:15px 15px 0 0">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td width="42" height="42" align="center" style="width:42px;height:42px;background-color:#0056e5;border-radius:10px;color:#ffffff;font-size:24px;font-weight:700">M</td>
    <td style="padding-left:14px;color:#ffffff"><p style="margin:0;font-size:20px;line-height:25px;font-weight:700;letter-spacing:0.5px">Melatec</p><p style="margin:3px 0 0;font-size:10px;line-height:15px;letter-spacing:2px;color:#c9d4ee">DENTAL CLINIC</p></td>
  </tr></table>
</td></tr>
<tr><td class="email-content" style="padding:36px 36px 32px">
  <p style="margin:0 0 12px;font-size:11px;line-height:18px;font-weight:700;letter-spacing:1.5px;color:#0056e5">${esc(template.category)}</p>
  <h1 class="email-title" style="margin:0 0 16px;font-size:30px;line-height:38px;font-weight:700;letter-spacing:-0.5px;color:#0a1a3d">${esc(template.title)}</h1>
  <p style="margin:0 0 26px;font-size:16px;line-height:26px;color:#5a6780">${esc(template.intro)}</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#f3f7fd;border:1px solid #e1e8f3;border-radius:10px"><tr><td style="padding:22px 22px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${details}</table></td></tr></table>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px"><tr><td bgcolor="#0056e5" style="background-color:#0056e5;border:1px solid #0056e5;border-radius:8px;mso-padding-alt:15px 24px"><a href="${esc(template.url)}" style="display:inline-block;padding:15px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:20px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px">${esc(template.action)}</a></td></tr></table>
  <p style="margin:18px 0 0;font-size:13px;line-height:21px;color:#5a6780">${esc(template.note)}</p>
  <p style="margin:24px 0 0;padding-top:22px;border-top:1px solid #e1e8f3;font-size:12px;line-height:20px;color:#68758a">${esc(template.footer)}</p>
</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
<p style="margin:20px 0 0;font-size:11px;line-height:18px;color:#68758a">Melatec Dental Clinic &nbsp;·&nbsp; Admin notifications</p>
</td></tr></table></body></html>`;
  return { subject: template.subject, text, html };
}

export function consultationEmail(
  origin: string,
  requestId: string,
  receivedAt: string,
): EmailContent {
  return render({
    subject: 'New Melatec consultation request',
    category: 'NEW CONSULTATION',
    title: 'A new request is waiting.',
    intro:
      'Someone has requested a consultation. Open the admin to review the request and follow up.',
    details: [
      { label: 'Request received · Vietnam time (UTC+7)', value: formatEmailDate(receivedAt) },
      { label: 'Request ID', value: requestId, monospace: true },
    ],
    action: 'View consultation request',
    url: `${origin}/admin/consultations/${encodeURIComponent(requestId)}`,
    note: 'Sign in with your Melatec admin account to view this request.',
    footer:
      'Patient contact details are available only in the admin. This email contains no patient information.',
  });
}

export function testEmail(origin: string, requestedAt: string): EmailContent {
  return render({
    subject: 'Melatec notification test',
    category: 'EMAIL TEST',
    title: 'Your test email is here.',
    intro:
      'This is a test of your consultation notifications. Receiving this message confirms that this mailbox can receive Melatec emails.',
    details: [
      { label: 'Test requested · Vietnam time (UTC+7)', value: formatEmailDate(requestedAt) },
      { label: 'Email type', value: 'Notification test' },
    ],
    action: 'Open email settings',
    url: `${origin}/admin/email`,
    note: 'Return to Email notifications to check your settings and enable consultation alerts.',
    footer:
      'This test does not create a consultation request or change your notification settings.',
  });
}

export function verificationEmail(origin: string, token: string, expiresAt: number): EmailContent {
  return render({
    subject: 'Confirm Melatec email notifications',
    category: 'VERIFY YOUR EMAIL',
    title: 'Confirm your notification email.',
    intro:
      'An administrator selected this mailbox to receive new consultation alerts from Melatec.',
    details: [
      { label: 'Link expires · Vietnam time (UTC+7)', value: formatEmailDate(expiresAt) },
      { label: 'Link validity', value: 'One hour · one use' },
    ],
    action: 'Confirm email address',
    url: `${origin}/admin/email/confirm#token=${encodeURIComponent(token)}`,
    note: 'Sign in to the Melatec admin, open this link and press Confirm recipient to finish verification.',
    footer:
      'If you did not expect this email, you can ignore it. Your notification recipient will stay unchanged until you confirm.',
  });
}
