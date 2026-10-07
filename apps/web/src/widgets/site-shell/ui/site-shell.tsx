import Footer from "@codegouvfr/react-dsfr/Footer";
import Header from "@codegouvfr/react-dsfr/Header";

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
    <div className="flex min-h-screen flex-col">
      <Header
        brandTop={brand}
        homeLinkProps={homeLinkProps}
        serviceTitle="Mnemo"
        serviceTagline="Espace BIM collaboratif"
        quickAccessItems={[
          {
            iconId: "fr-icon-folder-2-line",
            text: "Mes dossiers",
            linkProps: { href: "/projets" },
          },
        ]}
      />
      <div className="flex-1">{children}</div>
      <Footer
        accessibility="non compliant"
        brandTop={brand}
        contentDescription="Mnemo rassemble maquettes BIM, relevés 3D et échanges métier dans un espace de travail commun."
        homeLinkProps={homeLinkProps}
      />
    </div>
  );
}
