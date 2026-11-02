import { describe, expect, it } from "vitest";

import { renderMnemoEmail } from "./mnemo-email";

describe("Mnemo email template", () => {
  it("escapes project names and keeps the action on the Mnemo origin", () => {
    const result = renderMnemoEmail(
      {
        title: 'Invitation à <Dossier & "équipe">',
        intro: "Vous êtes invité à consulter ce dossier.",
        actionLabel: "Voir l'invitation",
        actionUrl: "/invitations/test-token?foo=1&bar=2",
        note: "Lien valable 7 jours.",
      },
      "https://mnemo.example.test",
    );

    expect(result.html).toContain(
      "Invitation à &lt;Dossier &amp; &quot;équipe&quot;&gt;",
    );
    expect(result.html).toContain("/mnemo-operator.png");
    expect(result.html).toContain("foo=1&amp;bar=2");
    expect(result.text).toContain(
      "https://mnemo.example.test/invitations/test-token",
    );
    expect(result.html).not.toContain("<Dossier &");
  });

  it("rejects links to another origin", () => {
    expect(() =>
      renderMnemoEmail(
        {
          title: "Test",
          intro: "Test",
          actionLabel: "Ouvrir",
          actionUrl: "https://other.example.test/steal",
          note: "Test",
        },
        "https://mnemo.example.test",
      ),
    ).toThrow("Mnemo origin");
  });
});
