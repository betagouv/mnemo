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
}: {
  compact?: boolean;
  projectTitle?: string;
  projectHref?: string;
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
        {
          iconId: "fr-icon-folder-2-line",
          text: "Mes dossiers",
          linkProps: { href: "/projets" },
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

export function SiteShell({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}
