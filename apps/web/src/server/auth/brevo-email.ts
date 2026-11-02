import "server-only";

import { BrevoClient } from "@getbrevo/brevo";

type AuthEmail = {
  to: string;
  subject: string;
  text: string;
};

export async function sendAuthEmail({ to, subject, text }: AuthEmail) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  if (!apiKey || !senderEmail) {
    throw new Error("Brevo email delivery is not configured");
  }

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
      to: [{ email: to }],
      subject,
      textContent: text,
    });
  } catch {
    // Provider errors can include recipient addresses and request details.
    throw new Error("Brevo email delivery failed");
  }
}
