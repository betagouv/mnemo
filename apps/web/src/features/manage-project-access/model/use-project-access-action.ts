"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function useProjectAccessAction() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function run(action: () => Promise<unknown>, successMessage: string) {
    setPending(true);
    setError("");
    setSuccess("");
    try {
      const result = await action();
      setSuccess(successMessage);
      router.refresh();
      return { ok: true as const, value: result };
    } catch {
      setError("L’opération a échoué. Vérifiez les valeurs et réessayez.");
      return { ok: false as const };
    } finally {
      setPending(false);
    }
  }

  return { pending, error, success, run };
}
