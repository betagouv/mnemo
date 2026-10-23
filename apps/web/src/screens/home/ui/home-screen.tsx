import Button from "@codegouvfr/react-dsfr/Button";

import styles from "./home-screen.module.css";

export function HomeScreen() {
  return (
    <main className="grid min-h-160 grid-cols-1 bg-[var(--background-default-grey)] text-[var(--text-default-grey)] min-[993px]:grid-cols-2">
      <section
        className="flex items-center p-[clamp(2.5rem,6vw,6rem)]"
        aria-labelledby="mission-title"
      >
        <div className={`${styles.content} max-w-[37rem]`}>
          <p className="fr-badge fr-badge--sm">Comprendre ses données</p>
          <h1 id="mission-title">
            Piloter vos décisions numériques pour le bâtiment patrimonial
          </h1>
          <p className="fr-text--lead">
            Maquettes BIM, relevés 3D et documents techniques : rassemblez les
            données de vos bâtiments pour mieux les explorer et les partager.
          </p>
          <p>
            Un même espace relie vos fichiers, la vue 3D et les remarques sur le
            projet.
          </p>
          <Button
            iconId="fr-icon-arrow-right-line"
            iconPosition="right"
            linkProps={{ href: "#acces" }}
            priority="secondary"
            size="large"
          >
            Accéder à mon espace
          </Button>
        </div>
      </section>

      <section
        className="flex items-center bg-[var(--background-alt-blue-france)] p-[clamp(2.5rem,6vw,6rem)]"
        id="acces"
        aria-labelledby="access-title"
      >
        <div className={`${styles.content} max-w-[37rem]`}>
          <p className="fr-badge fr-badge--sm">Espace de travail</p>
          <h2 id="access-title">Accéder à vos fichiers et à vos données</h2>
          <p className="fr-text--lead">
            Retrouvez vos dossiers, leurs maquettes IFC et leurs nuages de
            points au même endroit.
          </p>
          <Button
            iconId="fr-icon-folder-2-line"
            linkProps={{ href: "/projets" }}
            size="large"
          >
            Explorer mes dossiers
          </Button>
          <p className="fr-hint-text">
            IFC, LAS, LAZ, PLY et E57 peuvent être ajoutés à un dossier.
          </p>
        </div>
      </section>
    </main>
  );
}
