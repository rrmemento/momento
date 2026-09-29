import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

// Adresse publique de l'app (aperçus de partage) : NEXT_PUBLIC_SITE_URL, sinon celle fournie par Vercel.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

// Icônes (favicon.ico, icon.png, apple-icon.png), manifest et image de partage (opengraph-image.png) sont
// des fichiers de src/app : Next.js ajoute tout seul les balises correspondantes. Pour les régénérer : npm run icones.
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "MOMENTO",
  description: "Préparer et structurer les One-on-One mensuels avec ses commerciaux.",
  applicationName: "MOMENTO",
  appleWebApp: { capable: true, title: "MOMENTO", statusBarStyle: "default" },
  openGraph: {
    type: "website",
    siteName: "MOMENTO",
    title: "MOMENTO",
    description: "Les One-on-One qui font progresser.",
    locale: "fr_FR",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1c4b39", // barre du navigateur mobile aux couleurs MOMENTO
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${inter.variable} ${bricolage.variable}`}>
      <body>{children}</body>
    </html>
  );
}
