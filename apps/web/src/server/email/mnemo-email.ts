type MnemoEmail = {
  title: string;
  intro: string;
  actionLabel: string;
  actionUrl: string;
  note: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

export function renderMnemoEmail(
  { title, intro, actionLabel, actionUrl, note }: MnemoEmail,
  appUrl: string,
) {
  const baseUrl = new URL(appUrl);
  const destination = new URL(actionUrl, baseUrl);
  if (destination.origin !== baseUrl.origin) {
    throw new Error("Email action must use the Mnemo origin");
  }

  const logoUrl = new URL("/mnemo-operator.png", baseUrl).href;
  const text = `${title}\n\n${intro}\n\n${actionLabel} : ${destination.href}\n\n${note}\n\nMnemo - Mémoire Numérique pour l'Exploitation et la Maintenance des Ouvrages`;
  const html = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f6f6f6;color:#161616;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f6f6f6;">
      <tr><td align="center" style="padding:32px 16px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;background:#ffffff;border:1px solid #dddddd;border-top:4px solid #000091;">
          <tr><td style="padding:32px 36px 16px;">
            <img src="${escapeHtml(logoUrl)}" width="180" height="50" alt="Mnemo" style="display:block;width:180px;height:auto;border:0;">
          </td></tr>
          <tr><td style="padding:8px 36px 32px;">
            <h1 style="margin:0 0 20px;font-size:28px;line-height:1.25;color:#161616;">${escapeHtml(title)}</h1>
            <p style="margin:0 0 28px;font-size:16px;line-height:1.6;">${escapeHtml(intro)}</p>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="#000091" style="background:#000091;">
              <a href="${escapeHtml(destination.href)}" style="display:inline-block;padding:14px 20px;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;">${escapeHtml(actionLabel)}</a>
            </td></tr></table>
            <p style="margin:28px 0 8px;font-size:14px;line-height:1.5;color:#666666;">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :</p>
            <p style="margin:0;overflow-wrap:anywhere;word-break:break-word;font-size:14px;line-height:1.5;"><a href="${escapeHtml(destination.href)}" style="color:#000091;">${escapeHtml(destination.href)}</a></p>
          </td></tr>
          <tr><td style="padding:20px 36px;border-top:1px solid #dddddd;background:#f6f6f6;">
            <p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#666666;">${escapeHtml(note)}</p>
            <p style="margin:0;font-size:12px;line-height:1.5;color:#666666;">Mnemo · Mémoire Numérique pour l'Exploitation et la Maintenance des Ouvrages</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  return { text, html };
}
