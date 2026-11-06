"use client";

import { useState } from "react";
import Image from "next/image";
import Button from "@codegouvfr/react-dsfr/Button";

/** Anonymous CORS permits S3 redirects inside the COEP-isolated viewer. */
export function BcfSnapshot({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  if (failed)
    return (
      <div className="grid gap-2 p-3 border border-[var(--border-default-grey)]">
        <p role="status" className="!m-0 fr-text--sm">
          Cette capture n’a pas pu être chargée.
        </p>
        <Button
          size="small"
          priority="secondary"
          onClick={() => {
            setFailed(false);
            setAttempt((value) => value + 1);
          }}
        >
          Réessayer le chargement
        </Button>
      </div>
    );
  return (
    <Image
      unoptimized
      crossOrigin="anonymous"
      width={640}
      height={360}
      className={className}
      src={attempt ? `${src}?retry=${attempt}` : src}
      alt={alt}
      onError={() => setFailed(true)}
    />
  );
}
