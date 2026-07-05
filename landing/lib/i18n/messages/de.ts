// German is the landing site's source-of-truth dictionary. Its shape (via
// `typeof de`) defines the `Messages` type every other locale must satisfy, so a
// missing or renamed key fails the build typecheck.
const de = {
  meta: {
    tagline: "Aus einem Satz wird deine Web-App.",
    description:
      "Beschreibe eine Web-App in einem Satz — ein KI-Agent baut sie live in deinem Browser, Datei für Datei, und du veröffentlichst sie mit einem Klick. Self-hosted.",
    ogLocale: "de_DE",
  },
  nav: {
    login: "Anmelden",
  },
  hero: {
    titleLead: "Aus einem Satz wird deine ",
    titleHighlight: "Web-App",
    titleTail: ".",
    description:
      "Beschreibe, was du brauchst — ein Agent baut es live, Datei für Datei, direkt in deinem Browser. Du schaust live zu und veröffentlichst mit einem Klick.",
    helper:
      "Mit „App bauen“ geht es weiter zur Registrierung — dein Prompt wird dort direkt zu deiner ersten App.",
  },
  promptBox: {
    placeholder: "Beschreibe die Web-App, die du bauen willst…",
    hint: "Enter zum Senden · Shift+Enter für neue Zeile",
    build: "App bauen",
    submitting: "Moment…",
    examples: [
      "Eine Landingpage für mein Café mit Speisekarte und Öffnungszeiten",
      "Ein Pomodoro-Timer mit Aufgabenliste",
      "Ein persönliches Portfolio mit Projekt-Galerie",
    ],
  },
  footer: {
    text: "Kubikraum · self-hosted App-Builder",
  },
  themeToggle: {
    label: "Theme umschalten",
  },
  localeToggle: {
    label: "Sprache wechseln",
  },
};

export type Messages = typeof de;
export default de;
