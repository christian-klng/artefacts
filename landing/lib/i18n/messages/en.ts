import type { Messages } from "./de";

// Must satisfy the German dictionary's shape exactly — a missing/renamed key is a
// compile error (`npm run build` typechecks).
const en: Messages = {
  meta: {
    tagline: "Create your business app in 4 minutes",
    description:
      "Describe your app in one sentence — the Kubikraum agent builds it live in your browser.  Publishing and export with one click.",
    ogLocale: "en_US",
  },
  nav: {
    login: "Sign in",
  },
  hero: {
    titleLead: "Create your business app ",
    titleHighlight: "in 4 minutes",
    titleTail: ".",
    description:
      "Describe your app in one sentence — the Kubikraum agent builds it live in your browser.  Publishing and export with one click.",
  },
  promptBox: {
    placeholder: "Create a business app..",
    hint: "Enter to send",
    build: "Continue",
    submitting: "One sec…",
    examples: [
      "A landing page for my café with menu and opening hours",
      "A Pomodoro timer with a task list",
      "A personal portfolio with a project gallery",
    ],
  },
  features: {
    items: [
      {
        title: "Room for your creativity",
        description: "Get creative design concepts at the push of a button.",
      },
      {
        title: "Data compliance",
        description: "Hosting and AI are GDPR-compliant.",
      },
      {
        title: "Pro tools",
        description: "Icons, images, and fonts are added to your app.",
      },
      {
        title: "Publish in one click",
        description: "Your app goes public with a single click.",
      },
      {
        title: "Already have a server?",
        description: "Then export your app files and host it yourself.",
      },
      {
        title: "Fair pricing",
        description: "Top up credit and pay only for what you build.",
      },
    ],
  },
  faq: {
    heading: "Frequently asked questions",
    items: [
      {
        question: "Is my data used to train the AI?",
        answer:
          "No. Your content and project data are not used to train AI models. App and database hosting run in Germany, AI processing exclusively within the EU – and your data stays yours.",
      },
      {
        question: "What prior knowledge do I need?",
        answer:
          "None. You describe your app in plain language — the AI handles the design and the code. No coding required.",
      },
      {
        question: "Can I try it for free?",
        answer:
          "Yes. New accounts get free starter credit to try out the builder. You only top up once it's used up.",
      },
      {
        question: "Is there support?",
        answer:
          "Yes. Reach us directly by email at christian@kubikraum.digital — we'll help you personally.",
      },
    ],
  },
  footer: {
    text: "Kubikraum · Professional business apps for everybody",
    badgeEu: "GDPR-compliant and hosted in the EU",
    badgeDe: "Developed in Germany",
    terms: "Terms",
    privacy: "Privacy",
    imprint: "Imprint",
  },
  themeToggle: {
    label: "Toggle bright and dark",
  },
  localeToggle: {
    label: "Switch language",
  },
};

export default en;
