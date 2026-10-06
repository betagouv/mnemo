import type { Metadata } from "next";

import { DsfrProvider, StartDsfrOnHydration } from "@/shared/config/dsfr";
import { DsfrHead, getHtmlAttributes } from "@/shared/config/dsfr/server-only";
import { NotificationProvider } from "@/shared/ui/notifications";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Mnemo — espace BIM collaboratif",
    template: "%s — Mnemo",
  },
  description:
    "Explorez des maquettes IFC et des nuages de points dans un espace BIM collaboratif.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const lang = "fr";

  return (
    <html {...getHtmlAttributes({ lang })}>
      <head>
        <DsfrHead
          doDisableFavicon
          preloadFonts={[
            "Marianne-Regular",
            "Marianne-Medium",
            "Marianne-Bold",
          ]}
        />
      </head>
      <body>
        <DsfrProvider lang={lang}>
          <StartDsfrOnHydration />
          <NotificationProvider>{children}</NotificationProvider>
        </DsfrProvider>
      </body>
    </html>
  );
}
