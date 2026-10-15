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

const operatorLogo = {
  orientation: "horizontal" as const,
  imgUrl: "/mnemo-operator.png",
  alt: "Mnemo — Mémoire numérique pour l’exploitation et la maintenance des ouvrages",
};

export function SiteHeader({ compact = false }: { compact?: boolean }) {
  return (
    <Header
      brandTop={brand}
      operatorLogo={operatorLogo}
      className={compact ? styles.compactHeader : undefined}
      homeLinkProps={homeLinkProps}
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
      brandTop={brand}
      classes={className ? { root: className } : undefined}
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
