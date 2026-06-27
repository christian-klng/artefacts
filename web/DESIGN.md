# artefacts — Design Guide (Builder UI)

The design system for the **builder app** (the artefacts UI itself), and for its
future **landing page**. This is the **target state**: it codifies the conventions
that already live, implicitly, across `web/components/` and makes them the rule.
Where today's code diverges, see **§10 Known gaps / to-fix**.

> Scope: this guide governs the *builder* and *landing page* only. It does **not**
> govern the HTML the agent generates for end-user apps — those are styled
> independently (see `lib/agent/system-prompt.ts`). Keep the two separate.

---

## 1. Principles

1. **Neutral and quiet.** The UI is a frame around the user's work (chat + live
   preview). Black and greys carry the interface; colour is reserved for **meaning**
   (success, error, warning, info) — plus a single **brand accent** (the logo's
   yellow) used **very sparingly**, never as decoration.
2. **Content first.** Generous whitespace, restrained type scale, no gradients or
   shadows except where they communicate layering (overlays).
3. **Consistency through reuse.** There is no component library — consistency comes
   from copying the canonical class chains in §7. When in doubt, match an existing
   component rather than inventing a variant.
4. **Light and dark are equals.** Every surface, border, and text colour ships a
   `dark:` counterpart. A screen is not done until it looks right in both — and the
   correct logo variant is used per background (§3).

---

## 2. Foundations & tooling

- **Tailwind CSS v4**, configured inline via `@theme` in `app/globals.css` — there
  is **no `tailwind.config`**. Add design tokens as CSS variables under `@theme`,
  not via a JS config.
- **`@tailwindcss/typography`** (`prose`) is enabled, used for rendered Markdown in
  chat.
- **Semantic colour tokens** (§4) live under `@theme` as `--color-*` so Tailwind
  exposes them as utilities (`bg-success`, `text-danger`, `bg-warning/10`, …). This
  is the single source of truth — never hardcode the hex values inline.

---

## 3. Logo & brand mark

The mark is an isometric **cube** with one **yellow (#ffd166)** face; the remaining
faces are white/neutral with outlined edges. Two variants ship — pick by background,
not by theme name:

| Background        | Variant                | Asset                                |
| ----------------- | ---------------------- | ------------------------------------ |
| **Light** surface | Dark-outline cube      | `public/brand/logo-on-light.svg`     |
| **Dark** surface  | Light/white-outline cube | `public/brand/logo-on-dark.svg`    |

The SVGs are generated geometry (isometric cube, rounded faces, one `#ffd166`
face). On-dark differs only in stroke colour (white vs. `#1F2933`).

Rules:
- The yellow face is **part of the logo** — it is the one place yellow always
  appears. Outside the logo, yellow follows the sparing-accent rule in §4.
- Never recolour, rotate, add effects to, or place the mark on a busy/low-contrast
  background. Keep clear space ≈ the cube's corner radius on all sides.
- In the builder header use the variant matching the current theme (dark-outline in
  light mode, light-outline in dark mode) — swap via the same `.dark` signal as §8.
- Favicon / app icon: derive from the dark-outline variant on a transparent ground.

---

## 4. Colour

### Primary — black & neutral scale (Tailwind `neutral-*`)
Black/neutral is the primary colour and carries the entire chrome. Canonical roles:

| Role                    | Light                      | Dark                            |
| ----------------------- | -------------------------- | ------------------------------- |
| Page background         | `bg-white` / `#ffffff`     | `dark:bg-neutral-950` / `#0a0a0a` |
| Primary text            | `text-neutral-900`         | `dark:text-neutral-100` / white |
| Secondary / muted text  | `text-neutral-500`         | `text-neutral-500` (shared)     |
| Subtle surface (cards)  | `bg-neutral-100`           | `dark:bg-neutral-800`           |
| Border (default)        | `border-neutral-300`       | `dark:border-neutral-700`       |
| Border (strong / hover) | `border-neutral-900`       | `dark:border-white`             |

`--background` / `--foreground` (in `globals.css`) mirror page bg/text and switch
on theme; use `bg-background` / `text-foreground` for the root shell.

### Semantic palette — meaning only
Defined as `@theme` tokens (§2). Used **only** to convey state — never as brand or
decoration. Apply as a saturated value for icons/text/dots and a low-opacity tint
(`/10`–`/15`) for backgrounds.

| Meaning              | Hex       | Token              | Typical use                                  |
| -------------------- | --------- | ------------------ | -------------------------------------------- |
| Error / destructive  | `#EF476F` | `--color-danger`   | error text, destructive actions, invalid     |
| Warning / caution    | `#FFD166` | `--color-warning`  | warnings, "are you sure", non-blocking risk  |
| Success / published  | `#06D6A0` | `--color-success`  | success toasts, published status, valid      |
| Info / hint          | `#118AB2` | `--color-info`     | hints, neutral notices, tips                 |
| Info deep / accent   | `#073B4C` | `--color-info-deep`| text on info tints, deep info surfaces       |

Example usage (token-based utilities):
```
success badge: bg-success/10 text-success   ·  dot: bg-success
error text:    text-danger
info notice:   bg-info/10 text-info-deep border border-info/20
warning note:  bg-warning/15 text-neutral-900   (see brand-accent caveat below)
```

### Brand accent — #ffd166, rare and subtle
The logo's yellow. **Same hex as `--color-warning`** — so treat it carefully:

- Yellow's *primary* role in the UI is **warning**. Any decorative/brand use must be
  so rare it can't be mistaken for a warning.
- Allowed brand-accent uses: the logo, at most **one** tiny touch per screen (e.g. a
  thin active-tab underline, a single highlight dot), and hero flourishes on the
  landing page (§9).
- **Never** use yellow for a large fill, a primary button, or anywhere next to
  warning UI. Primary actions stay black/neutral (§7).

---

## 5. Typography

- **Sans:** Geist (`--font-geist-sans`), loaded in `app/layout.tsx`. Default UI
  font; apply to `<body>` via `font-sans`.
- **Mono:** Geist Mono (`--font-geist-mono`) — tool-call output, code, file paths.
  Use `font-mono`.

### Scale (Tailwind)
| Token       | Use                                              |
| ----------- | ------------------------------------------------ |
| `text-2xl`  | Page / auth headings (`font-semibold tracking-tight`) |
| `text-sm`   | Default body, buttons, inputs, chat text         |
| `text-xs`   | Meta: tool output, status chips, timestamps      |

Weights: `font-medium` for emphasis (labels, buttons), `font-semibold` for
headings. Headings use `tracking-tight`. Avoid sizes outside this set — the
restraint is the point.

---

## 6. Spacing, radii, borders, elevation

- **Padding rhythm:** horizontal `px-2 / px-3 / px-4`, vertical `py-1 / py-1.5 / py-2`.
  Small controls use `px-2 py-0.5`.
- **Gaps / stacks:** `space-y-1 / 1.5 / 4 / 6`, `gap-6` for form-level spacing.
- **Radii:** `rounded-md` (buttons, inputs), `rounded-lg` (panels), `rounded-2xl`
  (chat bubbles), `rounded-full` (status dots, pills).
- **Borders:** 1px, neutral (see §4). Focus/hover promotes the border to the
  strong neutral, not a coloured ring.
- **Elevation:** flat by default. `shadow-lg` **only** for floating overlays
  (dropdowns, modals). No shadows on inline content.

---

## 7. Component patterns (canonical class chains)

Copy these verbatim as the starting point for new instances.

### Primary button (black/neutral — the only primary)
```
rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition
hover:bg-neutral-700 disabled:opacity-50
dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200
```
*(`components/auth-form.tsx`)*

### Success accent button (sparingly — confirm/publish only)
```
rounded bg-success px-2 py-0.5 text-xs font-medium text-white hover:opacity-90
```

### Input / field
```
w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm
outline-none focus:border-neutral-900
dark:border-neutral-700 dark:focus:border-white
```
Pair with a `<label>` whose text is `text-sm font-medium`. *(`auth-form.tsx`)*

### Chat bubbles
- **User** (right, inverted): `rounded-2xl bg-neutral-900 px-3 py-2 text-sm text-white dark:bg-white dark:text-neutral-900`
- **Assistant** (left, subtle): `rounded-2xl bg-neutral-100 px-3 py-2 text-sm text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100`
  — Markdown via `prose prose-sm max-w-none dark:prose-invert`
- **Tool output:** `font-mono text-xs text-neutral-500`

*(`components/chat-panel.tsx`)*

### Status chip / dot
```
inline-flex items-center gap-1.5 text-xs
└ dot: h-1.5 w-1.5 rounded-full bg-success   (success — swap token per state)
```
States use the §4 tokens: `bg-success` / `bg-warning` / `bg-danger` / `bg-info`.
Error chip: `bg-danger/10 px-2 py-0.5 text-xs text-danger`.

### Dropdown / modal surface
```
rounded-md bg-white p-1 shadow-lg dark:bg-neutral-950
border border-neutral-200 dark:border-neutral-800
```
*(`components/project-switcher.tsx`)*

### Muted / secondary text & links
`text-sm text-neutral-500`; inline links use `underline` (no colour change).

---

## 8. Dark mode

**Target strategy: class-based.** Toggle a `.dark` class on `<html>` (e.g.
`<html class="dark">`) rather than relying on the OS. This enables a future in-app
theme switch and makes dark mode testable without changing OS settings.

- Configure Tailwind v4 for class strategy and remove the `@media
  (prefers-color-scheme: dark)` block in `globals.css` (move those values behind
  the `.dark` selector).
- The same `.dark` signal selects the logo variant (§3).
- Persist the user's choice (localStorage) and apply it before paint to avoid a
  flash. Default to the OS preference on first visit.
- Every new colour utility ships its `dark:` counterpart per §4. No exceptions.

---

## 9. Landing page (forthcoming — conventions)

Public marketing surface, but it **inherits this system** — same tokens, fonts,
neutrals, logo, and the sparing yellow accent. It may go *slightly* bolder than the
builder chrome, within these rails:

- **Type scale extension:** the builder caps at `text-2xl`; the landing page may add
  display sizes (`text-4xl` … `text-6xl`, `font-semibold tracking-tight`) for hero
  headlines only. Body copy stays on the §5 scale.
- **Sections:** vertical rhythm via large `py-` (e.g. `py-20`/`py-24`), centred
  `max-w-*` containers, generous whitespace. Backgrounds stay neutral (white /
  `neutral-950`); use one subtle surface (`neutral-50` / `neutral-900`) to separate
  sections — no gradients.
- **Primary CTA:** the §7 primary (black/neutral) button, optionally scaled up
  (`px-5 py-2.5 text-base`). The CTA is **not** yellow.
- **Yellow accent:** at most one small brand flourish per viewport (a logo, an
  underline, a highlighted word) — echoing the cube's yellow face. Keep it rare so
  it stays special and never reads as a warning.
- **Imagery / product shots:** framed with `rounded-lg` + `border-neutral-200` /
  `shadow-lg` (the one place generous shadow is on-brand).
- **Dark mode:** same class-based strategy (§8); must look right in both themes, with
  the matching logo variant.

When the landing page is built, expand this section with its real component chains
the way §7 documents the builder.

---

## 10. Known gaps / to-fix

Where current code diverges from this guide. Track and fix:

**Done**
- ~~Semantic colour tokens~~ — defined under `@theme` in `globals.css`
  (`--color-danger/warning/success/info/info-deep`).
- ~~Logo assets~~ — `public/brand/logo-on-light.svg` + `logo-on-dark.svg` added.
- ~~`<body>` forced Arial~~ — `font-family` dropped; `<body>` now uses `font-sans` (Geist).
- ~~Stale metadata~~ — `layout.tsx` now `title: "artefacts"`.

**Open**
- **Migrate components to tokens.** Existing components still use raw Tailwind
  `emerald-*` / `red-*`; switch them to `success` / `danger` (and add `warning` /
  `info` where states are currently uncoloured).
- **Place the logo in the header / favicon.** Assets exist but aren't wired into the
  UI yet; add the mark to the header (theme-matched variant) and derive a favicon.
- **Dark mode is OS-driven** (`@media prefers-color-scheme`) — migrate to the
  class-based strategy in §8 (one `@custom-variant dark` line + a pre-paint theme
  script; do it as a single change so OS-dark users don't regress).

---

*Source of truth lives in code: `app/globals.css` (tokens), `app/layout.tsx`
(fonts/metadata), `public/brand/` (logo), `components/*` (patterns). When this guide
and the code disagree, update whichever is wrong — and keep them in sync.*
