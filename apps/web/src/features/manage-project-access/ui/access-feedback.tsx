"use client";

import Alert from "@codegouvfr/react-dsfr/Alert";

export function Feedback({
  error,
  success,
}: {
  error: string;
  success: string;
}) {
  return error ? (
    <Alert className="mb-4" severity="error" small description={error} />
  ) : success ? (
    <Alert className="mb-4" severity="success" small description={success} />
  ) : null;
}
