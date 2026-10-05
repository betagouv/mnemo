import Link from "next/link";

import styles from "./workspace-shell.module.css";

export function WorkspaceShell({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="Mnemo — accueil">
          <span className={styles.mark} aria-hidden="true">
            M
          </span>
          <span>
            <strong>Mnemo</strong>
            <small>Espace BIM collaboratif</small>
          </span>
        </Link>
        <nav aria-label="Navigation de l’espace de travail">
          <Link className={styles.activeLink} href="/projets">
            <span className="fr-icon-folder-2-line" aria-hidden="true" />
            Mes dossiers
          </Link>
        </nav>
        <div className={styles.actor} title="Authentification à venir">
          <span>EL</span>
          <p>
            <strong>Utilisateur local</strong>
            <small>Mode développement</small>
          </p>
        </div>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
