import type { Messages } from "./de";

// Must satisfy the German dictionary's shape exactly — a missing/renamed key is a
// compile error (`npm run build` typechecks).
const en: Messages = {
  meta: {
    tagline: "Turn a sentence into your web app.",
    description:
      "Describe a web app in one sentence — an AI agent builds it live in your browser, file by file, and you publish it with one click. Self-hosted.",
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
  footer: {
    text: "Kubikraum · self-hosted app builder",
  },
  themeToggle: {
    label: "Toggle theme",
  },
  localeToggle: {
    label: "Switch language",
  },
};

export default en;
