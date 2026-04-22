import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/vehicule/", "/feed/"],
        disallow: ["/dashboard", "/inventaire", "/login", "/auth/", "/api/"],
      },
    ],
    sitemap: "https://camion-hino.ca/sitemap.xml",
  };
}
