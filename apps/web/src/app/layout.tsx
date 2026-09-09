import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mnemo",
  description: "Espace de travail BIM collaboratif",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
