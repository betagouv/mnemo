import Link from "next/link";

import styles from "./workspace-shell.module.css";

export function WorkspaceShell({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-[#f6f6f6]">
      <header
        className={`${styles.header} sticky top-0 z-10 grid min-h-18 grid-cols-[minmax(14rem,1fr)_auto_minmax(14rem,1fr)] items-center gap-8 border-b border-[var(--border-default-grey)] px-[clamp(1rem,3vw,2.5rem)] py-[0.65rem] max-[769px]:grid-cols-[1fr_auto]`}
      >
        <Link
          className={`${styles.brand} flex w-fit items-center gap-[0.7rem]`}
          href="/"
          aria-label="Mnemo — accueil"
        >
          <span className={styles.mark} aria-hidden="true">
            M
          </span>
          <span>
            <strong>Mnemo</strong>
            <small>Espace BIM collaboratif</small>
          </span>
        </Link>
        <nav
          aria-label="Navigation de l’espace de travail"
          className="max-[769px]:hidden"
        >
          <Link className={styles.activeLink} href="/projets">
            <span className="fr-icon-folder-2-line" aria-hidden="true" />
            Mes dossiers
          </Link>
        </nav>
        <div
          className={`${styles.actor} flex items-center justify-self-end gap-[0.7rem]`}
          title="Authentification à venir"
        >
          <span>EL</span>
          <p>
            <strong>Utilisateur local</strong>
            <small>Mode développement</small>
          </p>
        </div>
      </header>
      <main className="min-h-[calc(100vh-4.5rem)]">{children}</main>
    </div>
  );
}
