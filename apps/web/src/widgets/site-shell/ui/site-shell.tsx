import Footer from "@codegouvfr/react-dsfr/Footer";
import Header from "@codegouvfr/react-dsfr/Header";
import { headerFooterDisplayItem } from "@codegouvfr/react-dsfr/Display";

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

const operatorLogo = {
  orientation: "horizontal" as const,
  imgUrl: "/mnemo-operator.png",
  alt: "Mnemo — Mémoire numérique pour l’exploitation et la maintenance des ouvrages",
};

export function SiteHeader({
  compact = false,
  projectTitle,
  projectHref,
  authenticated = false,
  isAdmin = false,
}: {
  compact?: boolean;
  projectTitle?: string;
  projectHref?: string;
  authenticated?: boolean;
  isAdmin?: boolean;
}) {
  return (
    <Header
      brandTop={brand}
      operatorLogo={operatorLogo}
      className={`${styles.siteHeader} ${compact ? styles.compactHeader : ""}`}
      homeLinkProps={
        projectTitle && projectHref
          ? { href: projectHref, title: `Dossier ${projectTitle}` }
          : homeLinkProps
      }
      serviceTitle={projectTitle}
      quickAccessItems={[
        ...(isAdmin
          ? [
              {
                iconId: "fr-icon-admin-line" as const,
                text: "Administration",
                linkProps: { href: "/admin/utilisateurs" },
              },
            ]
          : []),
        {
          iconId: "fr-icon-folder-2-line",
          text: "Mes dossiers",
          linkProps: { href: "/projets" },
        },
        {
          iconId: "fr-icon-account-circle-line",
          text: authenticated ? "Mon compte" : "Se connecter",
          linkProps: { href: authenticated ? "/compte" : "/connexion" },
        },
      ]}
    />
  );
}

export function SiteFooter({ className }: { className?: string } = {}) {
  return (
    <Footer
      accessibility="non compliant"
      bottomItems={[headerFooterDisplayItem]}
      brandTop={brand}
      classes={{ root: `${styles.siteFooter} ${className ?? ""}` }}
      contentDescription="Mémoire Numérique pour l'Exploitation et la Maintenance des Ouvrages"
      homeLinkProps={homeLinkProps}
      operatorLogo={operatorLogo}
    />
  );
}
