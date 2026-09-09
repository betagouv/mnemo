import Button from "@codegouvfr/react-dsfr/Button";

import styles from "./home-screen.module.css";

const capabilities = [
  {
    icon: "fr-icon-building-line",
    title: "Comprendre la maquette",
    description:
      "Explorez la structure IFC, sélectionnez un objet et retrouvez ses propriétés sans perdre le contexte 3D.",
  },
  {
    icon: "fr-icon-focus-3-line",
    title: "Comparer au réel",
    description:
      "Superposez un nuage de points avec un rendu progressif et conservez précisément son alignement.",
  },
  {
    icon: "fr-icon-discuss-line",
    title: "Partager les décisions",
    description:
      "Centralisez les remarques BCF, les points de vue et les échanges liés aux éléments de la maquette.",
  },
] as const;

const steps = [
  [
    "01",
    "Créez un projet",
    "Un espace durable pour une opération et ses membres.",
  ],
  [
    "02",
    "Ajoutez vos relevés",
    "IFC et nuages de points restent disponibles ensemble.",
  ],
  [
    "03",
    "Explorez et échangez",
    "Filtres, propriétés, assistant et remarques au même endroit.",
  ],
] as const;

export function HomeScreen() {
  return (
    <main>
      <section className={styles.hero} id="decouvrir">
        <div className={`fr-container ${styles.heroGrid}`}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>PATRIMOINE · BIM · COLLABORATION</p>
            <h1>Comprendre une maquette, ensemble.</h1>
            <p className={styles.lead}>
              Mnemo réunit modèles IFC, nuages de points et remarques métier
              dans une vue claire, fluide et partageable.
            </p>
            <div className={styles.actions}>
              <Button
                iconId="fr-icon-arrow-right-line"
                iconPosition="right"
                linkProps={{ href: "#demarrer" }}
                size="large"
              >
                Découvrir l’espace projet
              </Button>
              <Button
                linkProps={{ href: "#fonctionnalites" }}
                priority="tertiary"
                size="large"
              >
                Voir les fonctionnalités
              </Button>
            </div>
          </div>

          <div className={styles.viewerPreview} aria-hidden="true">
            <div className={styles.previewTopbar}>
              <span />
              <span />
              <span />
              <p>Vue coordonnée</p>
            </div>
            <div className={styles.previewCanvas}>
              <div className={styles.blueprintGrid} />
              <div className={styles.modelBlock} />
              <div className={styles.modelTower} />
              <div className={styles.pointCloud} />
              <div className={styles.selectionPin} />
              <p className={styles.previewLabel}>IFC + NUAGE DE POINTS</p>
            </div>
          </div>
        </div>
      </section>

      <section
        className={`fr-container ${styles.capabilities}`}
        id="fonctionnalites"
        aria-labelledby="capabilities-title"
      >
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>UN SEUL ESPACE DE TRAVAIL</p>
          <h2 id="capabilities-title">Du modèle à la décision</h2>
          <p>
            Les outils restent au service de la lecture du bâtiment, sans
            encombrer la scène 3D.
          </p>
        </div>
        <div className={styles.capabilityGrid}>
          {capabilities.map((capability) => (
            <article className={styles.capability} key={capability.title}>
              <span
                className={`${capability.icon} ${styles.capabilityIcon}`}
                aria-hidden="true"
              />
              <h3>{capability.title}</h3>
              <p>{capability.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.method} id="methode">
        <div className="fr-container">
          <div className={styles.methodHeading}>
            <p className={styles.eyebrow}>UNE MÉTHODE SIMPLE</p>
            <h2>Conserver le fil du projet</h2>
          </div>
          <ol className={styles.steps}>
            {steps.map(([number, title, description]) => (
              <li key={number}>
                <span>{number}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className={`fr-container ${styles.start}`} id="demarrer">
        <div>
          <p className={styles.eyebrow}>PRÊT À EXPLORER ?</p>
          <h2>Votre projet mérite une vue commune.</h2>
          <p>
            Le prochain espace réunira vos fichiers, leur état de traitement et
            l’accès au viewer.
          </p>
        </div>
        <Button
          disabled
          iconId="fr-icon-arrow-right-line"
          iconPosition="right"
          size="large"
          title="L’espace projets sera activé à la prochaine étape"
        >
          Accéder aux projets
        </Button>
      </section>
    </main>
  );
}
