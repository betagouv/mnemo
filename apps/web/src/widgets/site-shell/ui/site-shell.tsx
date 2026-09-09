import Footer from "@codegouvfr/react-dsfr/Footer";
import Header from "@codegouvfr/react-dsfr/Header";

import styles from "./site-shell.module.css";

const brand = (
  <>
    RÉPUBLIQUE
    <br />
    FRANÇAISE
  </>
);

const homeLinkProps = {
  href: "/",
  title: "Accueil — Mnemo",
};

export function SiteShell({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={styles.shell}>
      <Header
        brandTop={brand}
        homeLinkProps={homeLinkProps}
        serviceTitle="Mnemo"
        serviceTagline="Espace BIM collaboratif"
        navigation={[
          {
            text: "Découvrir",
            linkProps: { href: "/#decouvrir" },
          },
          {
            text: "Fonctionnalités",
            linkProps: { href: "/#fonctionnalites" },
          },
          {
            text: "Méthode",
            linkProps: { href: "/#methode" },
          },
        ]}
        quickAccessItems={[
          {
            iconId: "fr-icon-folder-2-line",
            text: "Accéder aux projets",
            linkProps: { href: "/#demarrer" },
          },
        ]}
      />
      <div className={styles.content}>{children}</div>
      <Footer
        accessibility="non compliant"
        brandTop={brand}
        contentDescription="Mnemo rassemble maquettes BIM, relevés 3D et échanges métier dans un espace de travail commun."
        homeLinkProps={homeLinkProps}
      />
    </div>
  );
}
