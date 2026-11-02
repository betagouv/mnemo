import { afterEach, describe, expect, it, vi } from "vitest";

import { sendTransactionalEmail } from "./brevo-email";

const { sendTransacEmailMock, clientMock } = vi.hoisted(() => ({
  sendTransacEmailMock: vi.fn(),
  clientMock: vi.fn(),
}));

vi.mock("@getbrevo/brevo", () => ({
  BrevoClient: class {
    transactionalEmails = { sendTransacEmail: sendTransacEmailMock };

    constructor(options: unknown) {
      clientMock(options);
    }
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("Brevo transactional email", () => {
  it("requires server-side configuration", async () => {
    vi.stubEnv("BREVO_API_KEY", "");
    vi.stubEnv("BREVO_SENDER_EMAIL", "");
    await expect(
      sendTransactionalEmail({
        to: "user@example.invalid",
        subject: "Test",
        intro: "Message",
        actionLabel: "Ouvrir",
        actionUrl: "https://mnemo.example.test/connexion",
        note: "Ignorez ce message si besoin.",
      }),
    ).rejects.toThrow("not configured");
    expect(clientMock).not.toHaveBeenCalled();
  });

  it("sends accessible HTML and text through Brevo without exposing the key", async () => {
    vi.stubEnv("BREVO_API_KEY", "local-secret-test-key");
    vi.stubEnv("BREVO_SENDER_EMAIL", "sender@example.invalid");
    vi.stubEnv("BREVO_SENDER_NAME", "Mnemo");
    vi.stubEnv("BETTER_AUTH_URL", "https://mnemo.example.test");
    sendTransacEmailMock.mockResolvedValue({ messageId: "test-message-id" });

    await sendTransactionalEmail({
      to: "user@example.invalid",
      subject: "Confirmation",
      intro: "Confirmez votre adresse.",
      actionLabel: "Confirmer",
      actionUrl: "https://mnemo.example.test/confirmation",
      note: "Ignorez ce message si besoin.",
    });

    expect(clientMock).toHaveBeenCalledWith({
      apiKey: "local-secret-test-key",
      timeoutInSeconds: 10,
      maxRetries: 0,
    });
    expect(sendTransacEmailMock).toHaveBeenCalledWith({
      sender: { email: "sender@example.invalid", name: "Mnemo" },
      to: [{ email: "user@example.invalid" }],
      subject: "Confirmation",
      textContent: expect.stringContaining(
        "https://mnemo.example.test/confirmation",
      ),
      htmlContent: expect.stringContaining(
        "https://mnemo.example.test/mnemo-operator.png",
      ),
    });
    expect(JSON.stringify(sendTransacEmailMock.mock.calls)).not.toContain(
      "local-secret-test-key",
    );
  });

  it("does not include provider details or secrets in errors", async () => {
    vi.stubEnv("BREVO_API_KEY", "local-secret-test-key");
    vi.stubEnv("BREVO_SENDER_EMAIL", "sender@example.invalid");
    vi.stubEnv("BETTER_AUTH_URL", "https://mnemo.example.test");
    sendTransacEmailMock.mockRejectedValue(
      new Error("sensitive provider details local-secret-test-key"),
    );

    let error: Error | undefined;
    try {
      await sendTransactionalEmail({
        to: "user@example.invalid",
        subject: "Test",
        intro: "Message",
        actionLabel: "Ouvrir",
        actionUrl: "https://mnemo.example.test/connexion",
        note: "Ignorez ce message si besoin.",
      });
    } catch (caught) {
      error = caught as Error;
    }

    expect(error?.message).toBe("Brevo email delivery failed");
    expect(error?.cause).toBeUndefined();
  });
});
