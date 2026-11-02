import { afterEach, describe, expect, it, vi } from "vitest";

import { sendAuthEmail } from "./brevo-email";

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
      sendAuthEmail({
        to: "user@example.invalid",
        subject: "Test",
        text: "Message",
      }),
    ).rejects.toThrow("not configured");
    expect(clientMock).not.toHaveBeenCalled();
  });

  it("sends text through the Brevo SDK without exposing the API key in the message", async () => {
    vi.stubEnv("BREVO_API_KEY", "local-secret-test-key");
    vi.stubEnv("BREVO_SENDER_EMAIL", "sender@example.invalid");
    vi.stubEnv("BREVO_SENDER_NAME", "Mnemo");
    sendTransacEmailMock.mockResolvedValue({ messageId: "test-message-id" });

    await sendAuthEmail({
      to: "user@example.invalid",
      subject: "Confirmation",
      text: "Click the link",
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
      textContent: "Click the link",
    });
    expect(JSON.stringify(sendTransacEmailMock.mock.calls)).not.toContain(
      "local-secret-test-key",
    );
  });

  it("does not include provider details or secrets in errors", async () => {
    vi.stubEnv("BREVO_API_KEY", "local-secret-test-key");
    vi.stubEnv("BREVO_SENDER_EMAIL", "sender@example.invalid");
    sendTransacEmailMock.mockRejectedValue(
      new Error("sensitive provider details local-secret-test-key"),
    );

    let error: Error | undefined;
    try {
      await sendAuthEmail({
        to: "user@example.invalid",
        subject: "Test",
        text: "Message",
      });
    } catch (caught) {
      error = caught as Error;
    }

    expect(error?.message).toBe("Brevo email delivery failed");
    expect(error?.cause).toBeUndefined();
  });
});
