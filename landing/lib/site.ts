// Canonical public origin of the landing site. Override via env for staging.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://kubikraum.digital";

export const SITE_NAME = "Kubikraum";
export const SITE_TAGLINE = "Aus einem Satz wird deine Web-App.";
export const SITE_DESCRIPTION =
  "Beschreibe eine Web-App in einem Satz — ein KI-Agent baut sie live in deinem Browser, Datei für Datei, und du veröffentlichst sie mit einem Klick. Self-hosted.";
