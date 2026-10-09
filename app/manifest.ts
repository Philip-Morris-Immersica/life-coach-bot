import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Life Coach",
    short_name: "Коуч",
    description: "Личен AI коуч за навици, вярвания и идентичност.",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f3ee",
    theme_color: "#2f6f5e",
    lang: "bg",
    categories: ["lifestyle", "health", "productivity"],
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/pwa-icon/512?maskable=1",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Разговор с коуча", url: "/chat", description: "Отвори чата" },
      { name: "Дневен check-in", url: "/chat?checkin=1" },
      { name: "Напомняния", url: "/settings#reminders" },
    ],
  };
}
