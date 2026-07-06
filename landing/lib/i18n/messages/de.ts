// German is the landing site's source-of-truth dictionary. Its shape (via
// `typeof de`) defines the `Messages` type every other locale must satisfy, so a
// missing or renamed key fails the build typecheck.
const de = {
  meta: {
    tagline: "Aus einem Satz wird deine Web-App.",
    description:
      "Beschreibe eine Web-App in einem Satz — ein KI-Agent baut sie live in deinem Browser und veröffentlicht sie per Klick. Datenschutzkonform, Hosting in Deutschland.",
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
  features: {
    // Order matters — the grid pairs each item with an icon by position.
    items: [
      {
        title: "Viel Raum für deine Kreativität",
        description: "Erhalte Design-Konzepte für deine neue App.",
      },
      {
        title: "Datenschutz-konform",
        description: "Das Hosting findet komplett in Deutschland statt.",
      },
      {
        title: "Profi-Werkzeuge",
        description: "Icons, Bilder und Schriftarten direkt in deiner App.",
      },
      {
        title: "Stelle es direkt online",
        description: "Mit nur einem Klick ist deine App öffentlich.",
      },
      {
        title: "Du hast schon einen Server?",
        description: "Dann exportiere deine App-Dateien und veröffentliche selbst.",
      },
      {
        title: "Faires Preismodell",
        description:
          "Bezahle per Guthaben-Aufladung nur für die erstellten Leistungen.",
      },
    ],
  },
  faq: {
    heading: "Häufige Fragen",
    items: [
      {
        question: "Werden meine Daten zum Training der KI verwendet?",
        answer:
          "Nein. Deine Inhalte und Projektdaten werden nicht zum Training von KI-Modellen verwendet. Das gesamte Hosting läuft in Deutschland, und deine Daten gehören dir.",
      },
      {
        question: "Welche Vorkenntnisse brauche ich?",
        answer:
          "Keine. Du beschreibst deine App in normaler Sprache — die KI übernimmt Design und Code. Programmierkenntnisse sind nicht nötig.",
      },
      {
        question: "Kann ich kostenlos testen?",
        answer:
          "Ja. Neue Konten erhalten ein kostenloses Start-Guthaben, mit dem du den Builder ausprobieren kannst. Erst wenn es aufgebraucht ist, lädst du Guthaben nach Bedarf auf.",
      },
      {
        question: "Gibt es einen Support?",
        answer:
          "Ja. Bei Fragen erreichst du uns direkt per E-Mail unter christian@kubikraum.digital — wir helfen dir persönlich weiter.",
      },
    ],
  },
  footer: {
    text: "Kubikraum · self-hosted App-Builder",
    contact: "Kontakt",
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
