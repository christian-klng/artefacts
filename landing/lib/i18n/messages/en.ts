import type { Messages } from "./de";

// Must satisfy the German dictionary's shape exactly — a missing/renamed key is a
// compile error (`npm run build` typechecks).
const en: Messages = {
  meta: {
    tagline: "Turn a sentence into your web app.",
    description:
      "Describe a web app in one sentence — an AI agent builds it live in your browser and publishes it with one click. Privacy-compliant, hosted in Germany.",
    ogLocale: "en_US",
  },
  nav: {
    login: "Sign in",
  },
  hero: {
    titleLead: "Turn a sentence into your ",
    titleHighlight: "web app",
    titleTail: ".",
    description:
      "Describe what you need — an agent builds it live, file by file, right in your browser. You watch it happen and publish with one click.",
    helper:
      "“Build app” takes you to sign-up — your prompt turns straight into your first app there.",
  },
  promptBox: {
    placeholder: "Describe the web app you want to build…",
    hint: "Enter to send · Shift+Enter for a new line",
    build: "Build app",
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
        description: "Get design concepts for your new app.",
      },
      {
        title: "GDPR-compliant",
        description: "Hosting takes place entirely in Germany.",
      },
      {
        title: "Pro tools",
        description: "Icons, images, and fonts right inside your app.",
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
          "No. Your content and project data are not used to train AI models. All hosting runs in Germany, and your data stays yours.",
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
    text: "Kubikraum · self-hosted app builder",
    imprint: "Imprint",
    privacy: "Privacy",
  },
  themeToggle: {
    label: "Toggle theme",
  },
  localeToggle: {
    label: "Switch language",
  },
};

export default en;
