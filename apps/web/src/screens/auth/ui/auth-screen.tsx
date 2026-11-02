"use client";

import Alert from "@codegouvfr/react-dsfr/Alert";
import Button from "@codegouvfr/react-dsfr/Button";
import Input from "@codegouvfr/react-dsfr/Input";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/shared/lib/auth-client";

export function AuthScreen({
  mode,
  returnTo = "/projets",
  notice,
}: {
  mode: "login" | "register";
  returnTo?: string;
  notice?: "verified" | "password-reset";
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [verificationSent, setVerificationSent] = useState(false);
  const [resent, setResent] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const isRegister = mode === "register";
  const otherPath = isRegister ? "/connexion" : "/inscription";
  const otherHref =
    returnTo === "/projets"
      ? otherPath
      : `${otherPath}?retour=${encodeURIComponent(returnTo)}`;
  const loginHref =
    returnTo === "/projets"
      ? "/connexion"
      : `/connexion?retour=${encodeURIComponent(returnTo)}`;
  const verificationCallback =
    returnTo === "/projets"
      ? "/connexion?verification=ok"
      : `/connexion?verification=ok&retour=${encodeURIComponent(returnTo)}`;

  async function resendVerification() {
    setPending(true);
    setError("");
    try {
      const result = await authClient.sendVerificationEmail({
        email,
        callbackURL: verificationCallback,
      });
      if (result.error) {
        setError("Le service est momentanément indisponible.");
        return;
      }
      setResent(true);
    } catch {
      setError("Le service est momentanément indisponible.");
    } finally {
      setPending(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setNeedsVerification(false);
    try {
      const result = isRegister
        ? await authClient.signUp.email({
            name,
            email,
            password,
            callbackURL: verificationCallback,
          })
        : await authClient.signIn.email({ email, password });
      if (result.error) {
        setNeedsVerification(result.error.code === "EMAIL_NOT_VERIFIED");
        setError(
          result.error.code === "EMAIL_NOT_VERIFIED"
            ? "Confirmez votre adresse e-mail avant de vous connecter. Vérifiez votre boîte de réception."
            : isRegister
              ? "Impossible de créer ce compte. Vérifiez les informations saisies."
              : "Connexion impossible. Vérifiez vos identifiants.",
        );
        return;
      }
      if (isRegister) {
        setVerificationSent(true);
        setPassword("");
        return;
      }
      router.replace(returnTo);
      router.refresh();
    } catch {
      setError("Le service est momentanément indisponible.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="fr-container flex min-h-[65vh] items-center py-10">
      <div className="mx-auto w-full max-w-[32rem]">
        {verificationSent ? (
          <>
            <h1>Confirmez votre adresse e-mail</h1>
            <Alert
              className="mb-6"
              severity="info"
              small
              description={`Votre demande est prise en compte pour ${email}. Si l'envoi aboutit, vous recevrez un lien de confirmation. Consultez également vos courriers indésirables.`}
            />
            {resent ? (
              <Alert
                className="mb-6"
                severity="info"
                small
                description="Votre demande est prise en compte. Si l'adresse peut recevoir des e-mails, vous recevrez un nouveau lien."
              />
            ) : null}
            {error ? (
              <Alert
                className="mb-6"
                severity="error"
                small
                description={error}
              />
            ) : null}
            <Button
              priority="secondary"
              disabled={pending}
              onClick={() => void resendVerification()}
            >
              Renvoyer le lien
            </Button>
            <p className="mt-6">
              <Link href={loginHref}>Retour à la connexion</Link>
            </p>
          </>
        ) : (
          <>
            <h1>{isRegister ? "Créer un compte" : "Se connecter"}</h1>
            <p>
              {isRegister
                ? "Créez votre compte pour accéder à vos dossiers Mnemo."
                : "Retrouvez les projets auxquels vous avez accès."}
            </p>
            {notice ? (
              <Alert
                className="mb-6"
                severity="success"
                small
                description={
                  notice === "verified"
                    ? "Votre adresse e-mail est confirmée. Vous pouvez vous connecter."
                    : "Votre mot de passe a été modifié. Connectez-vous avec le nouveau mot de passe."
                }
              />
            ) : null}
            {error ? (
              <Alert
                className="mb-6"
                severity="error"
                small
                description={error}
              />
            ) : null}
            {needsVerification ? (
              <p>
                <Button
                  priority="tertiary no outline"
                  disabled={pending}
                  onClick={() => void resendVerification()}
                >
                  Renvoyer le lien de confirmation
                </Button>
                {resent
                  ? " Votre demande est prise en compte. Si l'envoi aboutit, vous recevrez un lien."
                  : null}
              </p>
            ) : null}
            <form aria-busy={pending} onSubmit={(event) => void submit(event)}>
              {isRegister ? (
                <Input
                  label="Nom affiché"
                  nativeInputProps={{
                    autoComplete: "name",
                    maxLength: 160,
                    onChange: (event) => setName(event.target.value),
                    required: true,
                    value: name,
                  }}
                />
              ) : null}
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
              <Input
                label="Mot de passe"
                hintText={isRegister ? "12 caractères minimum" : undefined}
                nativeInputProps={{
                  autoComplete: isRegister
                    ? "new-password"
                    : "current-password",
                  maxLength: 512,
                  minLength: isRegister ? 12 : undefined,
                  onChange: (event) => setPassword(event.target.value),
                  required: true,
                  type: "password",
                  value: password,
                }}
              />
              <Button disabled={pending} nativeButtonProps={{ type: "submit" }}>
                {pending
                  ? "Veuillez patienter…"
                  : isRegister
                    ? "Créer mon compte"
                    : "Se connecter"}
              </Button>
            </form>
            {!isRegister ? (
              <p className="mt-4">
                <Link href="/mot-de-passe-oublie">Mot de passe oublié ?</Link>
              </p>
            ) : null}
            <p className="mt-6">
              {isRegister ? "Déjà un compte ? " : "Pas encore de compte ? "}
              <Link href={otherHref}>
                {isRegister ? "Se connecter" : "Créer un compte"}
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
