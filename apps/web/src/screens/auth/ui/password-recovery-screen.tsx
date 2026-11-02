"use client";

import Alert from "@codegouvfr/react-dsfr/Alert";
import Button from "@codegouvfr/react-dsfr/Button";
import Input from "@codegouvfr/react-dsfr/Input";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/shared/lib/auth-client";

export function PasswordRecoveryScreen({ token }: { token?: string }) {
  const router = useRouter();
  const isReset = token !== undefined;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (isReset && password !== confirmation) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setPending(true);
    try {
      if (isReset) {
        const result = await authClient.resetPassword({
          newPassword: password,
          token,
        });
        if (result.error) {
          setError("Ce lien n'est plus valable. Demandez un nouveau lien.");
          return;
        }
        router.replace("/connexion?reinitialisation=ok");
      } else {
        const result = await authClient.requestPasswordReset({
          email,
          redirectTo: "/reinitialiser-mot-de-passe",
        });
        if (result.error) {
          setError("Le service est momentanément indisponible.");
          return;
        }
        // The same message is shown whether or not the account exists.
        setSent(true);
      }
    } catch {
      setError("Le service est momentanément indisponible.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="fr-container flex min-h-[65vh] items-center py-10">
      <div className="mx-auto w-full max-w-[32rem]">
        <h1>
          {isReset ? "Choisir un nouveau mot de passe" : "Mot de passe oublié"}
        </h1>
        {sent ? (
          <Alert
            severity="info"
            small
            description="Votre demande est prise en compte. Si un compte correspond à cette adresse et que l'envoi aboutit, vous recevrez un lien de réinitialisation. Vérifiez aussi vos courriers indésirables."
          />
        ) : (
          <>
            <p>
              {isReset
                ? "Saisissez votre nouveau mot de passe."
                : "Saisissez votre adresse e-mail pour recevoir un lien de réinitialisation."}
            </p>
            {error ? (
              <Alert
                className="mb-6"
                severity="error"
                small
                description={error}
              />
            ) : null}
            {isReset && !token ? (
              <Alert
                severity="error"
                small
                description="Ce lien n'est pas valable. Demandez un nouveau lien."
              />
            ) : (
              <form
                aria-busy={pending}
                onSubmit={(event) => void submit(event)}
              >
                {isReset ? (
                  <>
                    <Input
                      label="Nouveau mot de passe"
                      hintText="12 caractères minimum"
                      nativeInputProps={{
                        autoComplete: "new-password",
                        minLength: 12,
                        maxLength: 512,
                        onChange: (event) => setPassword(event.target.value),
                        required: true,
                        type: "password",
                        value: password,
                      }}
                    />
                    <Input
                      label="Confirmer le nouveau mot de passe"
                      nativeInputProps={{
                        autoComplete: "new-password",
                        minLength: 12,
                        maxLength: 512,
                        onChange: (event) =>
                          setConfirmation(event.target.value),
                        required: true,
                        type: "password",
                        value: confirmation,
                      }}
                    />
                  </>
                ) : (
                  <Input
                    label="Adresse e-mail"
                    nativeInputProps={{
                      autoComplete: "email",
                      maxLength: 320,
                      onChange: (event) => setEmail(event.target.value),
                      required: true,
                      type: "email",
                      value: email,
                    }}
                  />
                )}
                <Button
                  disabled={pending}
                  nativeButtonProps={{ type: "submit" }}
                >
                  {pending
                    ? "Veuillez patienter…"
                    : isReset
                      ? "Enregistrer le mot de passe"
                      : "Recevoir un lien"}
                </Button>
              </form>
            )}
          </>
        )}
        <p className="mt-6">
          <Link href="/connexion">Retour à la connexion</Link>
        </p>
        {isReset && !token ? (
          <p>
            <Link href="/mot-de-passe-oublie">Demander un nouveau lien</Link>
          </p>
        ) : null}
      </div>
    </main>
  );
}
