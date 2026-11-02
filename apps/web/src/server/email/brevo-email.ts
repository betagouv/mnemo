import "server-only";

import { BrevoClient } from "@getbrevo/brevo";

import { renderMnemoEmail } from "./mnemo-email";

type TransactionalEmail = {
  to: string;
  subject: string;
  intro: string;
  actionLabel: string;
  actionUrl: string;
  note: string;
};

export async function sendTransactionalEmail(message: TransactionalEmail) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const appUrl = process.env.BETTER_AUTH_URL;
  if (!apiKey || !senderEmail || !appUrl) {
    throw new Error("Brevo email delivery is not configured");
  }

  const { text, html } = renderMnemoEmail(
    { title: message.subject, ...message },
    appUrl,
  );
  const client = new BrevoClient({
    apiKey,
    timeoutInSeconds: 10,
    maxRetries: 0,
  });

  try {
    await client.transactionalEmails.sendTransacEmail({
      sender: {
        email: senderEmail,
        name: process.env.BREVO_SENDER_NAME || "Mnemo",
      },
      to: [{ email: message.to }],
      subject: message.subject,
      textContent: text,
      htmlContent: html,
    });
  } catch {
    // Provider errors can include recipient addresses and request details.
    throw new Error("Brevo email delivery failed");
  }
}
