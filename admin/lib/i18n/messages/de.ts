// German is the admin panel's source-of-truth dictionary. Its shape (`typeof de`)
// defines the `Messages` type every other locale must satisfy, so a missing or
// renamed key fails the build typecheck. Simple `{token}` placeholders are
// substituted by the caller via String.replace.
const de = {
  meta: {
    title: "Kubikraum · Admin",
    description: "Verwaltung von Nutzern und Apps",
  },
  chrome: {
    adminBadge: "Admin",
    logout: "Abmelden",
  },
  nav: {
    overview: "Übersicht",
    users: "Nutzer",
    apps: "Apps",
    coupons: "Gutscheine",
    mail: "E-Mails",
    settings: "Einstellungen",
    logs: "Logs",
  },
  common: {
    save: "Speichern",
    saving: "Speichern…",
    saved: "Gespeichert.",
    saveFailed: "Speichern fehlgeschlagen.",
    notLoggedIn: "Nicht angemeldet.",
    optional: "optional",
    countTotal: "{count} gesamt",
  },
  localeToggle: {
    label: "Sprache wechseln",
  },
  login: {
    subtitle: "Bitte anmelden, um fortzufahren.",
    username: "Benutzername",
    password: "Passwort",
    signIn: "Anmelden",
    signingIn: "Anmelden…",
    wrongCredentials: "Falscher Benutzername oder falsches Passwort.",
  },
  overview: {
    title: "Übersicht",
    users: "Nutzer",
    apps: "Apps",
    published: "Veröffentlicht",
    consumedTotal: "Verbraucht (gesamt)",
    balanceTotal: "Guthaben (gesamt)",
  },
  users: {
    title: "Nutzer",
    colUser: "Nutzer",
    colRegistered: "Registriert",
    colApps: "Apps",
    colConsumed: "Verbraucht",
    colBalance: "Guthaben",
    colAdmin: "Admin",
    adminHint:
      "Admins sehen alle Apps und können jede App schreibgeschützt im Builder öffnen.",
    empty: "Noch keine Nutzer.",
  },
  apps: {
    title: "Apps",
    colApp: "App",
    colOwner: "Besitzer",
    colStatus: "Status",
    colFeatured: "Leuchtturm",
    colCreated: "Erstellt",
    colUpdated: "Aktualisiert",
    colActions: "Aktionen",
    thumbnailAlt: "Vorschau von {name}",
    statusPublished: "veröffentlicht",
    statusDraft: "Entwurf",
    empty: "Noch keine Apps.",
    publish: "Veröffentlichen",
    unpublish: "Offline nehmen",
    working: "Moment …",
    confirmPublish: "Diese App jetzt öffentlich veröffentlichen?",
    confirmUnpublish: "Diese App offline nehmen? Sie ist danach nicht mehr erreichbar.",
    featuredHint: "Als Leuchtturm auf der Landingpage vorschlagen",
    errNotConfigured: "Veröffentlichen ist nicht konfiguriert (ADMIN_API_SECRET fehlt).",
    errActionFailed: "Aktion fehlgeschlagen.",
  },
  logs: {
    title: "Fehler-Log",
    intro:
      "Server-seitige Fehler (z. B. fehlgeschlagene Wiederherstellungen), die sonst nur flüchtig im Container-Log stünden. Neueste zuerst, max. 200.",
    colTime: "Zeit",
    colScope: "Bereich",
    colApp: "App",
    colUser: "Nutzer",
    colMessage: "Meldung",
    details: "Details anzeigen",
    empty: "Keine Fehler protokolliert. 🎉",
  },
  coupons: {
    title: "Gutscheine",
    summary: "{codes} Codes · {redemptions} Einlösungen",
    newCode: "Neuer Code",
    allCodes: "Alle Codes",
    redemptionsHeading: "Einlösungen",
    colCode: "Code",
    colType: "Typ",
    colOwner: "Besitzer",
    colRecipient: "Einlöser",
    colReferrer: "Werber",
    colRedemptions: "Einlösungen",
    colExpiry: "Ablauf",
    colStatus: "Status",
    typeReferral: "Referral",
    typeAdmin: "Admin",
    statusInactive: "inaktiv",
    statusExpired: "abgelaufen",
    statusActive: "aktiv",
    emptyCodes: "Noch keine Codes.",
    redColRedeemer: "Einlöser",
    redColReferrer: "Werber",
    redColCredit: "Gutschrift",
    redColReferrerBonus: "Werber-Bonus",
    redColBonusStatus: "Bonus-Status",
    redColWhen: "Wann",
    emptyRedemptions: "Noch keine Einlösungen.",
    rewardPending: "ausstehend",
    rewardGranted: "gutgeschrieben",
    rewardExpired: "verfallen",
    rewardNone: "—",
  },
  couponForm: {
    codeLabel: "Code",
    codeHint: "(leer = generiert)",
    codePlaceholder: "KUBI-…",
    recipientLabel: "Einlöser-Betrag (€)",
    recipientPlaceholder: "10",
    referrerLabel: "Werber-Betrag (€)",
    referrerPlaceholder: "0",
    ownerEmailLabel: "Werber (E-Mail)",
    ownerEmailPlaceholder: "nutzer@…",
    maxLabel: "Max. Einlösungen",
    maxHint: "(leer = ∞)",
    expiryLabel: "Ablaufdatum",
    activeLabel: "Aktiv",
    submit: "Code anlegen",
    submitting: "Anlegen…",
    createdPrefix: "Angelegt:",
    errInvalidCode: "Ungültiger Code (nur A–Z, 0–9, Bindestrich).",
    errRecipientPositive: "Einlöser-Betrag muss größer als 0 sein.",
    errNoUser: "Kein Nutzer mit E-Mail {email}.",
    errMaxPositiveInt: "Max. Einlösungen muss eine positive ganze Zahl sein.",
    errInvalidExpiry: "Ungültiges Ablaufdatum.",
    errCodeTaken: "Code bereits vergeben oder Speichern fehlgeschlagen.",
  },
  mail: {
    title: "E-Mail-Vorlagen",
    intro:
      "Betreff und HTML für die Begrüßungs- und die Passwort-zurücksetzen-Mail. Lässt du ein Feld leer, verwendet die App ihre eingebaute Standardvorlage. Platzhalter in geschweiften Klammern werden beim Versand ersetzt.",
    welcomeLabel: "Begrüßungs-Mail",
    resetLabel: "Passwort zurücksetzen",
    subject: "Betreff",
    subjectPlaceholder: "Leer = Standardbetreff",
    html: "HTML",
    htmlPlaceholder: "Leer = eingebaute Standardvorlage",
    placeholdersLabel: "Platzhalter:",
    lastChanged: "zuletzt geändert",
  },
  settings: {
    title: "Einstellungen",
    intro:
      "Betriebs-Einstellungen für Cortecs, Billing und E-Mail. Ein gespeicherter Wert überschreibt die entsprechende Coolify-ENV-Variable – Änderungen greifen ohne Redeploy (innerhalb ~30 Sekunden). Lässt du ein Feld leer, nutzt die App den ENV-Wert bzw. ihren eingebauten Standard. Secrets (API-Key, SMTP-Passwort) bleiben in der Server-Umgebung.",
    placeholderEnvDefault: "Leer = ENV/Standard",
    placeholderStandardPrefix: "Standard: ",
    groups: {
      cortecs: {
        title: "Cortecs (LLM-Router)",
        description:
          "Modelle & Endpunkte. WICHTIG: cortecs.ai nutzt eigene Katalog-IDs, die von Anthropics Schreibweise abweichen — Opus 4.8 heißt hier claude-opus4-8 (ohne Bindestrich nach dem Wort opus), NICHT claude-opus-4-8. Verfügbare IDs: https://api.cortecs.ai/v1/models.",
      },
      billing: {
        title: "Billing / Credits",
        description: "",
      },
      referral: {
        title: "Referral / Gutscheine",
        description:
          "Standardwerte für neu aktivierte Referral-Codes. Ändert nur künftige Codes — bereits aktivierte behalten ihre gespeicherten Beträge.",
      },
      stripe: {
        title: "Stripe (Zahlungen)",
        description:
          "Statische Stripe-Payment-Links: 5€/Monat Hosting-Abo pro App + Top-Ups. Die Links werden im Stripe-Dashboard erstellt und hier eingetragen; leer = der jeweilige Button ist ausgeblendet. Der Secret-Key und das Webhook-Secret bleiben aus Sicherheitsgründen in der Server-Umgebung.",
      },
      backups: {
        title: "Backups",
        description:
          "Automatische Voll-Backups veröffentlichter Apps (Dateien + Datenbank + Nutzerkonten + Anhänge). Das Cron-Secret (BACKUP_CRON_SECRET) bleibt aus Sicherheitsgründen in der Server-Umgebung.",
      },
      smtp: {
        title: "E-Mail (SMTP)",
        description:
          "Zugangsdaten für den Mailversand. Das Passwort (SMTP_PASS) bleibt aus Sicherheitsgründen in der Server-Umgebung.",
      },
    },
    fields: {
      CORTECS_BUILD_MODEL: { label: "Builder-Modell", help: "" },
      CORTECS_CLEANUP_MODEL: { label: "Cleanup-Modell", help: "" },
      CORTECS_INTERVIEW_MODEL: {
        label: "Interview-Modell",
        help: "Erzeugt die Konzeptfragen (3 Fragen + Farbpaletten) nach dem ersten Prompt eines Projekts. Läuft über den OpenAI-Pfad.",
      },
      CORTECS_SOVEREIGN_BUILD_MODEL: {
        label: "Sovereign-Builder-Modell",
        help: "",
      },
      CORTECS_ANTHROPIC_BASE_URL: {
        label: "Anthropic Base-URL (Builder)",
        help: "OHNE /v1 — Claude Code hängt /v1/messages selbst an. Mit /v1 entsteht .../v1/v1/messages (404), und der Builder meldet fälschlich „Modell existiert nicht / kein Zugriff“.",
      },
      CORTECS_OPENAI_BASE_URL: {
        label: "OpenAI Base-URL (Cleanup/Preise)",
        help: "MIT /v1 (im Gegensatz zur Anthropic-URL oben).",
      },
      CORTECS_PRICE_TTL_MS: { label: "Preis-Cache TTL (ms)", help: "" },
      BILLING_MARGIN: {
        label: "Marge",
        help: "1.20 = +20 % Aufschlag auf die reinen Cortecs-Kosten.",
      },
      FREE_TIER_GRANT_EUR: {
        label: "Gratis-Guthaben (EUR)",
        help: "Einmalige Gutschrift bei erster Nutzung.",
      },
      CORTECS_FEE_MULTIPLIER: {
        label: "Fee-Multiplikator",
        help: "1.05, falls der Katalogpreis netto (ohne Cortecs' 5 %-Fee) ist.",
      },
      CACHE_READ_PRICE_RATIO: {
        label: "Cache-Read-Preisfaktor",
        help: "Anteil des Inputpreises für Cache-Reads (Anthropic: 0,1×). Greift nur, solange der Cortecs-Katalog keine eigenen Cache-Preise ausweist — Agent-Turns sind zu ~90 % Cache-Reads.",
      },
      CACHE_WRITE_PRICE_RATIO: {
        label: "Cache-Write-Preisfaktor",
        help: "Anteil des Inputpreises für Cache-Writes (Anthropic: 1,25×). Greift nur, solange der Cortecs-Katalog keine eigenen Cache-Preise ausweist.",
      },
      REFERRAL_RECIPIENT_EUR: {
        label: "Einlöser-Guthaben (EUR)",
        help: "Der neue Nutzer erhält dies sofort beim Einlösen.",
      },
      REFERRAL_REFERRER_EUR: {
        label: "Werber-Bonus (EUR)",
        help: "Der Werber erhält dies, sobald der Eingeladene ein Abo abschließt (später via Stripe).",
      },
      REFERRAL_WINDOW_DAYS: {
        label: "Abo-Frist (Tage)",
        help: "Zeitfenster, in dem der Eingeladene ein Abo abschließen muss, damit der Werber-Bonus gilt.",
      },
      STRIPE_SUBSCRIPTION_LINK: {
        label: "Abo Payment-Link",
        help: "Stripe-Payment-Link für das 5€/Monat Hosting-Abo (pro App). Erfolgs-URL im Dashboard auf die App zeigen lassen.",
      },
      STRIPE_TOPUP_LINK_5: { label: "Top-Up-Link 5 €", help: "" },
      STRIPE_TOPUP_LINK_10: { label: "Top-Up-Link 10 €", help: "" },
      STRIPE_TOPUP_LINK_20: { label: "Top-Up-Link 20 €", help: "" },
      SUBSCRIPTION_MONTHLY_CREDIT_EUR: {
        label: "Monats-Guthaben pro Abo (EUR)",
        help: "Guthaben, das jedes aktive Abo pro Monat gutschreibt. Verfällt bei Nichtnutzung.",
      },
      BACKUP_ENABLED: { label: "Automatische Backups", help: "" },
      BACKUP_RETENTION_DAYS: {
        label: "Aufbewahrung (Tage)",
        help: "Ältere Auto-/Täglich-Backups werden entfernt; das veröffentlichte und das neueste Backup bleiben immer erhalten.",
      },
      SMTP_HOST: { label: "Host", help: "" },
      SMTP_PORT: { label: "Port", help: "" },
      SMTP_USER: { label: "Benutzer", help: "" },
      SMTP_SECURE: { label: "TLS-Modus", help: "" },
      MAIL_FROM: {
        label: "Absender (From)",
        help: "Leer = es wird der SMTP-Benutzer als Absender verwendet.",
      },
    },
    options: {
      BACKUP_ENABLED: ["An (Standard)", "An", "Aus"],
      SMTP_SECURE: [
        "Standard (587 / STARTTLS)",
        "secure = true (465 / implizit)",
        "secure = false",
      ],
    },
  },
};

export type Messages = typeof de;
export default de;
