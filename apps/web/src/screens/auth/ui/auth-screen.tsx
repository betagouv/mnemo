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
}: {
  mode: "login" | "register";
  returnTo?: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const isRegister = mode === "register";
  const otherPath = isRegister ? "/connexion" : "/inscription";
  const otherHref =
    returnTo === "/projets"
      ? otherPath
      : `${otherPath}?retour=${encodeURIComponent(returnTo)}`;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const result = isRegister
        ? await authClient.signUp.email({ name, email, password })
        : await authClient.signIn.email({ email, password });
      if (result.error) {
        setError(
          isRegister
            ? "Impossible de créer ce compte. Vérifiez les informations saisies."
            : "Connexion impossible. Vérifiez vos identifiants.",
        );
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
        <h1>{isRegister ? "Créer un compte" : "Se connecter"}</h1>
        <p>
          {isRegister
            ? "Créez votre compte pour accéder à vos dossiers Mnemo."
            : "Retrouvez les projets auxquels vous avez accès."}
        </p>
        {isRegister ? (
          <Alert
            className="mb-6"
            severity="info"
            small
            description="Cette version ne vérifie pas l’adresse e-mail. Ne réutilisez pas un mot de passe employé ailleurs. La récupération automatique du compte n’est pas encore disponible."
          />
        ) : null}
        {error ? (
          <Alert className="mb-6" severity="error" small description={error} />
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
              autoComplete: isRegister ? "new-password" : "current-password",
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
        <p className="mt-6">
          {isRegister ? "Déjà un compte ? " : "Pas encore de compte ? "}
          <Link href={otherHref}>
            {isRegister ? "Se connecter" : "Créer un compte"}
          </Link>
        </p>
      </div>
    </main>
  );
}
