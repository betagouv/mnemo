"use client";
import { useRef, useState } from "react";
import Button from "@codegouvfr/react-dsfr/Button";
import Alert from "@codegouvfr/react-dsfr/Alert";
import { bcfArchiveImportResultSchema } from "@mnemo/contracts/bcf";
export function BcfExchange({
  projectId,
  canImport,
  onImported,
}: {
  projectId: string;
  canImport: boolean;
  onImported: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(
    null,
  );
  return (
    <details>
      <summary className="cursor-pointer text-[var(--text-action-high-blue-france)]">
        Importer / exporter
      </summary>
      <div className="grid gap-3 pt-3">
        <Button
          priority="secondary"
          size="small"
          linkProps={{ href: `/api/projects/${projectId}/bcf`, download: true }}
        >
          Exporter les remarques (.bcf)
        </Button>
        {canImport ? (
          <>
            <input
              ref={input}
              type="file"
              accept=".bcf,.bcfzip"
              className="sr-only"
              tabIndex={-1}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                if (file.size > 50 * 1024 * 1024) {
                  setNotice({
                    error: true,
                    text: "L’archive dépasse la limite de 50 Mio.",
                  });
                  return;
                }
                setBusy(true);
                setNotice(null);
                void (async () => {
                  const response = await fetch(
                    `/api/projects/${projectId}/bcf`,
                    {
                      method: "POST",
                      headers: { "content-type": "application/zip" },
                      body: file,
                    },
                  );
                  if (!response.ok)
                    throw new Error(
                      "L’import a échoué. Vérifiez le fichier et vos droits.",
                    );
                  const result = bcfArchiveImportResultSchema.parse(
                    await response.json(),
                  );
                  setNotice({
                    error: false,
                    text: `${result.imported.topics} remarque(s) importée(s), ${result.skippedTopics} déjà présente(s). ${result.warnings.join(" ")}`,
                  });
                  onImported();
                })()
                  .catch((error: unknown) =>
                    setNotice({
                      error: true,
                      text:
                        error instanceof Error
                          ? error.message
                          : "Import impossible.",
                    }),
                  )
                  .finally(() => setBusy(false));
              }}
            />
            <Button
              priority="secondary"
              size="small"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              {busy ? "Import…" : "Importer un fichier BCF"}
            </Button>
          </>
        ) : null}
        {notice ? (
          <Alert
            severity={notice.error ? "error" : "info"}
            small
            description={notice.text}
          />
        ) : null}
      </div>
    </details>
  );
}
