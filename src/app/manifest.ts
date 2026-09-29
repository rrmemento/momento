import type { MetadataRoute } from "next";

// L'appli ajoutée à l'écran d'accueil (Android, ordinateur) : nom, couleurs et icônes MOMENTO.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MOMENTO",
    short_name: "MOMENTO",
    description: "Préparer et structurer les One-on-One mensuels avec ses commerciaux.",
    lang: "fr",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f2ec", // crème MOMENTO
    theme_color: "#1c4b39", // vert foncé MOMENTO
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
