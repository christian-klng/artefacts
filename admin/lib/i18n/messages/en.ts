import type { Messages } from "./de";

// Must satisfy the German dictionary's shape exactly — a missing/renamed key is a
// compile error (`npm run build` typechecks).
const en: Messages = {
  meta: {
    title: "Kubikraum · Admin",
    description: "User and app management",
  },
  chrome: {
    adminBadge: "Admin",
    logout: "Sign out",
  },
  nav: {
    overview: "Overview",
    users: "Users",
    apps: "Apps",
    coupons: "Coupons",
    mail: "Emails",
    settings: "Settings",
    logs: "Logs",
  },
  common: {
    save: "Save",
    saving: "Saving…",
    saved: "Saved.",
    saveFailed: "Saving failed.",
    notLoggedIn: "Not signed in.",
    optional: "optional",
    countTotal: "{count} total",
  },
  localeToggle: {
    label: "Switch language",
  },
  login: {
    subtitle: "Please sign in to continue.",
    username: "Username",
    password: "Password",
    signIn: "Sign in",
    signingIn: "Signing in…",
    wrongCredentials: "Wrong username or password.",
  },
  overview: {
    title: "Overview",
    users: "Users",
    apps: "Apps",
    published: "Published",
    consumedTotal: "Consumed (total)",
    balanceTotal: "Balance (total)",
  },
  users: {
    title: "Users",
    colUser: "User",
    colRegistered: "Registered",
    colApps: "Apps",
    colConsumed: "Consumed",
    colBalance: "Balance",
    empty: "No users yet.",
  },
  apps: {
    title: "Apps",
    colApp: "App",
    colOwner: "Owner",
    colStatus: "Status",
    colCreated: "Created",
    colUpdated: "Updated",
    thumbnailAlt: "Preview of {name}",
    statusPublished: "published",
    statusDraft: "Draft",
    empty: "No apps yet.",
  },
  logs: {
    title: "Error log",
    intro:
      "Server-side errors (e.g. failed restores) that would otherwise only live briefly in the container log. Newest first, max. 200.",
    colTime: "Time",
    colScope: "Scope",
    colApp: "App",
    colUser: "User",
    colMessage: "Message",
    details: "Show details",
    empty: "No errors logged. 🎉",
  },
  coupons: {
    title: "Coupons",
    summary: "{codes} codes · {redemptions} redemptions",
    newCode: "New code",
    allCodes: "All codes",
    redemptionsHeading: "Redemptions",
    colCode: "Code",
    colType: "Type",
    colOwner: "Owner",
    colRecipient: "Redeemer",
    colReferrer: "Referrer",
    colRedemptions: "Redemptions",
    colExpiry: "Expiry",
    colStatus: "Status",
    typeReferral: "Referral",
    typeAdmin: "Admin",
    statusInactive: "inactive",
    statusExpired: "expired",
    statusActive: "active",
    emptyCodes: "No codes yet.",
    redColRedeemer: "Redeemer",
    redColReferrer: "Referrer",
    redColCredit: "Credit",
    redColReferrerBonus: "Referrer bonus",
    redColBonusStatus: "Bonus status",
    redColWhen: "When",
    emptyRedemptions: "No redemptions yet.",
    rewardPending: "pending",
    rewardGranted: "granted",
    rewardExpired: "expired",
    rewardNone: "—",
  },
  couponForm: {
    codeLabel: "Code",
    codeHint: "(blank = generated)",
    codePlaceholder: "KUBI-…",
    recipientLabel: "Redeemer amount (€)",
    recipientPlaceholder: "10",
    referrerLabel: "Referrer amount (€)",
    referrerPlaceholder: "0",
    ownerEmailLabel: "Referrer (email)",
    ownerEmailPlaceholder: "user@…",
    maxLabel: "Max. redemptions",
    maxHint: "(blank = ∞)",
    expiryLabel: "Expiry date",
    activeLabel: "Active",
    submit: "Create code",
    submitting: "Creating…",
    createdPrefix: "Created:",
    errInvalidCode: "Invalid code (only A–Z, 0–9, hyphen).",
    errRecipientPositive: "Redeemer amount must be greater than 0.",
    errNoUser: "No user with email {email}.",
    errMaxPositiveInt: "Max. redemptions must be a positive integer.",
    errInvalidExpiry: "Invalid expiry date.",
    errCodeTaken: "Code already taken or saving failed.",
  },
  mail: {
    title: "Email templates",
    intro:
      "Subject and HTML for the welcome and password-reset emails. Leave a field blank to use the app's built-in default template. Placeholders in curly braces are replaced when the mail is sent.",
    welcomeLabel: "Welcome email",
    resetLabel: "Password reset",
    subject: "Subject",
    subjectPlaceholder: "Blank = default subject",
    html: "HTML",
    htmlPlaceholder: "Blank = built-in default template",
    placeholdersLabel: "Placeholders:",
    lastChanged: "last changed",
  },
  settings: {
    title: "Settings",
    intro:
      "Operational settings for Cortecs, billing and email. A saved value overrides the matching Coolify ENV variable – changes take effect without a redeploy (within ~30 seconds). Leave a field blank to use the ENV value or the built-in default. Secrets (API key, SMTP password) stay in the server environment.",
    placeholderEnvDefault: "Blank = ENV/default",
    placeholderStandardPrefix: "Default: ",
    groups: {
      cortecs: {
        title: "Cortecs (LLM router)",
        description:
          "Models & endpoints. IMPORTANT: cortecs.ai uses its own catalog IDs that differ from Anthropic's spelling — Opus 4.8 is claude-opus4-8 here (no hyphen after the word opus), NOT claude-opus-4-8. Available IDs: https://api.cortecs.ai/v1/models.",
      },
      billing: {
        title: "Billing / credits",
        description: "",
      },
      referral: {
        title: "Referral / coupons",
        description:
          "Defaults for newly activated referral codes. Only affects future codes — already-activated ones keep their stored amounts.",
      },
      stripe: {
        title: "Stripe (payments)",
        description:
          "Static Stripe Payment Links: a 5€/month per-app hosting subscription + top-ups. Create the links in the Stripe dashboard and paste them here; blank = the corresponding button is hidden. The secret key and webhook secret stay in the server environment for security.",
      },
      backups: {
        title: "Backups",
        description:
          "Automatic full backups of published apps (files + database + user accounts + attachments). The cron secret (BACKUP_CRON_SECRET) stays in the server environment for security.",
      },
      smtp: {
        title: "Email (SMTP)",
        description:
          "Credentials for sending mail. The password (SMTP_PASS) stays in the server environment for security.",
      },
    },
    fields: {
      CORTECS_BUILD_MODEL: { label: "Builder model", help: "" },
      CORTECS_CLEANUP_MODEL: { label: "Cleanup model", help: "" },
      CORTECS_INTERVIEW_MODEL: {
        label: "Interview model",
        help: "Generates the concept questions (3 questions + colour palettes) after a project's first prompt. Runs over the OpenAI path.",
      },
      CORTECS_SOVEREIGN_BUILD_MODEL: {
        label: "Sovereign builder model",
        help: "",
      },
      CORTECS_ANTHROPIC_BASE_URL: {
        label: "Anthropic base URL (builder)",
        help: "WITHOUT /v1 — Claude Code appends /v1/messages itself. With /v1 you get .../v1/v1/messages (404), and the builder wrongly reports “model does not exist / no access”.",
      },
      CORTECS_OPENAI_BASE_URL: {
        label: "OpenAI base URL (cleanup/prices)",
        help: "WITH /v1 (unlike the Anthropic URL above).",
      },
      CORTECS_PRICE_TTL_MS: { label: "Price cache TTL (ms)", help: "" },
      BILLING_MARGIN: {
        label: "Margin",
        help: "1.20 = +20% markup on the raw Cortecs cost.",
      },
      FREE_TIER_GRANT_EUR: {
        label: "Free credit (EUR)",
        help: "One-time credit on first use.",
      },
      CORTECS_FEE_MULTIPLIER: {
        label: "Fee multiplier",
        help: "1.05 if the catalog price is net (without Cortecs' 5% fee).",
      },
      CACHE_READ_PRICE_RATIO: {
        label: "Cache read price factor",
        help: "Share of the input price for cache reads (Anthropic: 0.1×). Applies only while the Cortecs catalog exposes no cache prices of its own — agent turns are ~90% cache reads.",
      },
      CACHE_WRITE_PRICE_RATIO: {
        label: "Cache write price factor",
        help: "Share of the input price for cache writes (Anthropic: 1.25×). Applies only while the Cortecs catalog exposes no cache prices of its own.",
      },
      REFERRAL_RECIPIENT_EUR: {
        label: "Redeemer credit (EUR)",
        help: "The new user receives this immediately on redemption.",
      },
      REFERRAL_REFERRER_EUR: {
        label: "Referrer bonus (EUR)",
        help: "The referrer receives this once the invitee subscribes (later via Stripe).",
      },
      REFERRAL_WINDOW_DAYS: {
        label: "Subscription window (days)",
        help: "The window within which the invitee must subscribe for the referrer bonus to apply.",
      },
      STRIPE_SUBSCRIPTION_LINK: {
        label: "Subscription Payment Link",
        help: "Stripe Payment Link for the 5€/month hosting subscription (per app). Point its success URL at the app in the dashboard.",
      },
      STRIPE_TOPUP_LINK_5: { label: "Top-up link 5 €", help: "" },
      STRIPE_TOPUP_LINK_10: { label: "Top-up link 10 €", help: "" },
      STRIPE_TOPUP_LINK_20: { label: "Top-up link 20 €", help: "" },
      SUBSCRIPTION_MONTHLY_CREDIT_EUR: {
        label: "Monthly credit per subscription (EUR)",
        help: "Credit each active subscription grants per month. Expires if unused.",
      },
      BACKUP_ENABLED: { label: "Automatic backups", help: "" },
      BACKUP_RETENTION_DAYS: {
        label: "Retention (days)",
        help: "Older auto/daily backups are removed; the published and the newest backup are always kept.",
      },
      SMTP_HOST: { label: "Host", help: "" },
      SMTP_PORT: { label: "Port", help: "" },
      SMTP_USER: { label: "User", help: "" },
      SMTP_SECURE: { label: "TLS mode", help: "" },
      MAIL_FROM: {
        label: "Sender (From)",
        help: "Blank = the SMTP user is used as the sender.",
      },
    },
    options: {
      BACKUP_ENABLED: ["On (default)", "On", "Off"],
      SMTP_SECURE: [
        "Default (587 / STARTTLS)",
        "secure = true (465 / implicit)",
        "secure = false",
      ],
    },
  },
};

export default en;
