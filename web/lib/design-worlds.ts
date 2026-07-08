// The curated "style world" library: design languages as CONSTRAINT DATA (no
// markup, no templates). Each world defines an epoch, inspirations, allowed
// font pairings (ids from lib/agent/font-catalog.json), layout/shape/motion
// rules, a color philosophy, and a world-specific forbidden list. The server
// SAMPLES candidates + mutation parameters (real entropy — never the LLM's
// choice), the interview LLM picks the best fits for the project and
// instantiates them, and the user chooses one as their design DNA.
//
// Every world carries a `register`: "professional" (restrained, expected,
// trustworthy — right for B2B/enterprise/institutional apps) or "expressive"
// (character-forward). Interview sampling is STRATIFIED across both registers
// (see sampleInterviewCandidates) so a B2B request always has serious options
// to offer and a playful one always has expressive ones — the LLM then matches
// the request's register. Deliberately includes a "modern-product" world so the
// 2025 SaaS canon stays available as a conscious choice, not the default.
import "server-only";
import type { StyleMutations } from "@/lib/interview";

export type { StyleMutations };

/**
 * A world's suitability register. "professional" = safe/expected/trustworthy
 * (B2B, enterprise, finance, healthcare, institutional); "expressive" =
 * character-forward. Drives the stratified interview sample.
 */
export type WorldRegister = "professional" | "expressive";

export type FontPairing = {
  /** Heading font — catalog id from lib/agent/font-catalog.json. */
  heading: string;
  /** Body font — catalog id. */
  body: string;
  /** Optional accent font (labels, code, stamps) — catalog id. */
  accent?: string;
};

export type DesignWorld = {
  id: string;
  /** Suitability register — drives the stratified interview sample. */
  register: WorldRegister;
  /** Canonical English name; the interview LLM renames per project/language. */
  name: string;
  /** One-line character sketch. */
  blurb: string;
  /** Era / movement the language comes from. */
  epoch: string;
  /** 5–10 concrete reference brands/works. */
  inspirations: string[];
  /** 2–3 allowed font pairings; the LLM picks ONE per instantiation. */
  pairings: FontPairing[];
  /** Layout & grid philosophy (prose, binding). */
  grid: string;
  /** Allowed base spacing units in px — sampled per project. */
  spacingUnits: number[];
  /** Shape rules: radius, borders, shadows (prose, binding). */
  shape: string;
  /** Allowed corner radius values — sampled per project. */
  radiusOptions: string[];
  /** Guidance the LLM turns into a concrete 5-color palette. */
  colorPhilosophy: string;
  /** Motion principles (prose, binding). */
  motion: string;
  /** World-specific VERBOTEN list (on top of the global anti-canon). */
  forbidden: string[];
  /** Allowed modular type-scale ratios — sampled per project. */
  typeScales: number[];
};

export const DESIGN_WORLDS: DesignWorld[] = [
  {
    id: "swiss-international",
    register: "professional",
    name: "Swiss International",
    blurb: "Rational grid, objective type, one signal color — form follows content.",
    epoch: "International Typographic Style, Zürich/Basel 1950s–60s",
    inspirations: [
      "Josef Müller-Brockmann posters",
      "Massimo Vignelli / NYC Subway",
      "Braun product graphics",
      "Lufthansa identity 1962",
      "Vitsœ",
      "Swiss Federal Railways signage",
    ],
    pairings: [
      { heading: "archivo", body: "archivo" },
      { heading: "archivo", body: "work-sans" },
      { heading: "jost", body: "work-sans" },
    ],
    grid: "Strict modular grid with visible structure; asymmetric composition; flush-left, ragged-right; hierarchy through size and weight, never decoration.",
    spacingUnits: [4, 6, 8],
    shape: "Sharp corners, hairline 1px rules, solid color blocks. No shadows of any kind.",
    radiusOptions: ["0"],
    colorPhilosophy:
      "White or paper-white ground, near-black text, exactly ONE signal color (classic red, cobalt, or similar) used decisively in large fields — never as tint gradients.",
    motion: "Essentially none: instant state changes, at most 100ms opacity on hover.",
    forbidden: [
      "rounded corners",
      "drop shadows",
      "gradients",
      "centered body text",
      "decorative illustration",
    ],
    typeScales: [1.25, 1.333, 1.414],
  },
  {
    id: "editorial-print",
    register: "expressive",
    name: "Editorial Print",
    blurb: "A magazine spread on screen: serif headlines, columns, pull quotes, restraint.",
    epoch: "Print magazines & Sunday supplements, timeless",
    inspirations: [
      "The New Yorker",
      "Monocle",
      "Kinfolk",
      "NYT Magazine",
      "Cereal Magazine",
      "Pentagram editorial work",
    ],
    pairings: [
      { heading: "playfair-display", body: "lora" },
      { heading: "fraunces", body: "work-sans" },
      { heading: "dm-serif-display", body: "libre-caslon-text", accent: "special-elite" },
    ],
    grid: "Magazine columns with generous margins; drop caps, pull quotes, italic captions; a strong headline deck; text measures of 60–75 characters.",
    spacingUnits: [6, 8],
    shape: "Square corners (max 2px), hairline dividers between sections, full-bleed imagery. Shadows do not exist in print.",
    radiusOptions: ["0", "2px"],
    colorPhilosophy:
      "Paper tones (cream, ivory, warm white) with ink-black text and ONE restrained accent (oxblood, editorial red, deep teal) for links and rules.",
    motion: "Subtle scroll reveals of sections at most; reading is the experience.",
    forbidden: [
      "cards with shadows",
      "pill-shaped buttons",
      "gradients",
      "icon-heavy layouts",
      "dark mode aesthetics",
    ],
    typeScales: [1.25, 1.333, 1.5],
  },
  {
    id: "bauhaus-geometric",
    register: "expressive",
    name: "Bauhaus Geometric",
    blurb: "Primary colors, primary shapes, mechanical order with diagonal energy.",
    epoch: "Bauhaus & De Stijl, 1919–1933",
    inspirations: [
      "Bauhaus Dessau posters",
      "László Moholy-Nagy",
      "Piet Mondrian / De Stijl",
      "HfG Ulm",
      "Kandinsky's geometric period",
      "Vitra graphics",
    ],
    pairings: [
      { heading: "jost", body: "jost" },
      { heading: "jost", body: "work-sans" },
      { heading: "bebas-neue", body: "jost" },
    ],
    grid: "Geometric composition: circles, triangles and squares as structural decoration; bold asymmetric blocks; occasional rotated or diagonal elements with mechanical precision.",
    spacingUnits: [8, 12],
    shape: "Corners are 0 or a full circle — nothing in between. Thick 2–4px borders, hard offset shadows (solid, not blurred) allowed.",
    radiusOptions: ["0", "9999px"],
    colorPhilosophy:
      "Primary red, yellow and blue plus black and white — Mondrian blocks, not tints. One primary may dominate; never pastel.",
    motion: "Mechanical and linear (no bouncy easing): rotations, straight translations, stepwise reveals.",
    forbidden: [
      "soft blurred shadows",
      "pastel colors",
      "script fonts",
      "photographic hero images",
      "hairline delicacy",
    ],
    typeScales: [1.333, 1.414, 1.5],
  },
  {
    id: "brutalist-web",
    register: "expressive",
    name: "Web Brutalism",
    blurb: "Raw document energy: system honesty, hard borders, zero decoration.",
    epoch: "Web brutalism 2014+, honoring the early web",
    inspirations: [
      "Balenciaga.com",
      "Yale School of Art site",
      "Bloomberg feature pages",
      "craigslist",
      "MoMA PS1",
      "HOTEL magazine",
    ],
    pairings: [
      { heading: "space-mono", body: "space-mono" },
      { heading: "archivo", body: "space-mono" },
      { heading: "bebas-neue", body: "ibm-plex-mono" },
    ],
    grid: "Raw document flow; dense, table-like structures with visible 1–3px borders; underlined default-looking links; no hero staging — content starts immediately.",
    spacingUnits: [4, 8],
    shape: "Radius 0. Solid black borders everywhere. No shadows, or a hard 4px offset block at most.",
    radiusOptions: ["0"],
    colorPhilosophy:
      "White (or raw gray) and black plus ONE aggressive accent — acid green, electric blue, or warning red. Default-blue links are a legitimate choice.",
    motion: "None, or abrupt without easing: hover inverts colors, nothing floats or fades.",
    forbidden: [
      "rounded corners",
      "gradients",
      "soft shadows",
      "polished marketing layouts",
      "generous decorative whitespace",
    ],
    typeScales: [1.2, 1.25],
  },
  {
    id: "terminal-mono",
    register: "expressive",
    name: "Terminal",
    blurb: "Phosphor on glass: a character grid, cursor blink, engineering as aesthetic.",
    epoch: "CRT terminals & early computing, 1970s–80s",
    inspirations: [
      "DEC VT100",
      "IBM 3278",
      "Teenage Engineering OS interfaces",
      "Hundred Rabbits",
      "classic man pages",
      "phosphor CRT displays",
    ],
    pairings: [
      { heading: "jetbrains-mono", body: "jetbrains-mono" },
      { heading: "ibm-plex-mono", body: "ibm-plex-mono" },
      { heading: "vt323", body: "ibm-plex-mono" },
    ],
    grid: "Everything aligns to the character grid (ch units); ASCII-style dividers (─ │ ┌); status-bar headers and footers; dense, information-first.",
    spacingUnits: [4, 8],
    shape: "Radius 0–2px, 1px borders. A soft phosphor glow (text-shadow in the accent color) is the ONE allowed shadow.",
    radiusOptions: ["0", "2px"],
    colorPhilosophy:
      "Near-black ground (deep green-black or blue-black) with phosphor green, amber, or cyan text — or inverted 'printout' mode: paper white with ink. Accent = brighter phosphor.",
    motion: "Cursor blink, typewriter reveals, instant state changes — all disabled under prefers-reduced-motion.",
    forbidden: [
      "serif display type",
      "soft drop shadows",
      "stock photography",
      "pastel gradients",
      "rounded cards",
    ],
    typeScales: [1.2, 1.25],
  },
  {
    id: "art-deco",
    register: "expressive",
    name: "Art Déco",
    blurb: "Gatsby geometry: symmetry, gold hairlines, sunbursts, vertical elegance.",
    epoch: "Art déco, 1920s–30s",
    inspirations: [
      "Chrysler Building ornament",
      "A.M. Cassandre posters",
      "Gatsby title design",
      "vintage Champagne labels",
      "Claridge's",
      "Bugatti Type 57 era",
    ],
    pairings: [
      { heading: "abril-fatface", body: "josefin-sans" },
      { heading: "josefin-sans", body: "eb-garamond" },
      { heading: "dm-serif-display", body: "josefin-sans" },
    ],
    grid: "Symmetric, centered composition with strong vertical rhythm; ornamental frames (double rules, corner motifs as inline SVG); sunburst and fan geometry as decoration.",
    spacingUnits: [8, 12],
    shape: "Square corners; ornament instead of radius — double-line borders, gold hairlines, stepped frames. No blurred shadows.",
    radiusOptions: ["0"],
    colorPhilosophy:
      "Black, deep navy, or emerald ground with gold/champagne metallic accents and ivory text — high glamour contrast, never neon.",
    motion: "Slow, elegant fades (400–600ms); a single subtle shimmer accent at most.",
    forbidden: [
      "casual rounded UI",
      "neon colors",
      "emoji",
      "flat material-style cards",
      "left-ragged asymmetric grunge",
    ],
    typeScales: [1.333, 1.5],
  },
  {
    id: "organic-hand",
    register: "expressive",
    name: "Organic Handcraft",
    blurb: "Warm, imperfect, human: hand-drawn lines, kraft paper, market-stand charm.",
    epoch: "Contemporary craft & farmers-market culture",
    inspirations: [
      "Innocent Drinks",
      "Flow Magazine",
      "Anthropologie",
      "Burt's Bees",
      "Le Pain Quotidien",
      "independent café branding",
    ],
    pairings: [
      { heading: "amatic-sc", body: "lora" },
      { heading: "fraunces", body: "lora" },
      { heading: "fraunces", body: "work-sans", accent: "amatic-sc" },
    ],
    grid: "Relaxed rhythm with slight irregularity: gently rotated elements (±1–2°), hand-drawn SVG dividers and doodles, asymmetric but warm composition.",
    spacingUnits: [6, 10],
    shape: "Irregular 'hand-cut' radii (mix values, e.g. 255px 15px 225px 15px), sketchy 2px borders, organic blob shapes as color fields — earthy, never glossy.",
    radiusOptions: ["6px", "12px 4px 14px 6px"],
    colorPhilosophy:
      "Warm naturals: terracotta, sage, mustard, cream, kraft-brown — as if mixed from pigments. Accent stays earthy (burnt orange, olive), never electric.",
    motion: "A gentle wobble or bounce on hover, sparingly; nothing slick or mechanical.",
    forbidden: [
      "corporate grid rigidity",
      "neon or electric hues",
      "glassmorphism",
      "thin technical hairlines",
      "chrome/metal effects",
    ],
    typeScales: [1.2, 1.25],
  },
  {
    id: "luxury-maison",
    register: "expressive",
    name: "Luxury Maison",
    blurb: "Vast silence, tracked-out capitals, hairlines — wealth whispers.",
    epoch: "Timeless haute maison, Paris/Milan",
    inspirations: [
      "Hermès",
      "Aesop",
      "Cartier",
      "The Row",
      "Céline",
      "Claridge's",
    ],
    pairings: [
      { heading: "cormorant-garamond", body: "eb-garamond" },
      { heading: "dm-serif-display", body: "work-sans" },
      { heading: "playfair-display", body: "eb-garamond" },
    ],
    grid: "Vast whitespace; centered or classical two-column composition; small type sizes with wide letter-spaced uppercase for nav and labels; few elements, perfectly placed.",
    spacingUnits: [8, 12, 16],
    shape: "Square corners, 0.5–1px hairline borders, NO shadows. Imagery muted and art-directed.",
    radiusOptions: ["0"],
    colorPhilosophy:
      "Monochrome ivory-and-ink, or one deep house color (forest, burgundy, midnight) with ivory; at most a whisper of gold. Saturation is vulgar here.",
    motion: "Slow and understated: 400–600ms fades, subtle parallax at most.",
    forbidden: [
      "bright saturated colors",
      "heavy font weights throughout",
      "badges and pills",
      "loud CTA buttons",
      "dense layouts",
    ],
    typeScales: [1.25, 1.333],
  },
  {
    id: "retro-diner",
    register: "expressive",
    name: "Retro Diner",
    blurb: "1950s roadside optimism: script signs, starbursts, cherry-red vinyl.",
    epoch: "American diner & roadside signage, 1950s",
    inspirations: [
      "vintage Coca-Cola ads",
      "Route 66 signage",
      "In-N-Out",
      "classic jukebox design",
      "Shake Shack's retro cues",
      "Googie architecture",
    ],
    pairings: [
      { heading: "pacifico", body: "work-sans" },
      { heading: "alfa-slab-one", body: "bitter" },
      { heading: "bebas-neue", body: "work-sans", accent: "pacifico" },
    ],
    grid: "Playful symmetric layouts; badge and starburst shapes (inline SVG); banner ribbons; menu-board sections with dotted leader lines.",
    spacingUnits: [8, 10],
    shape: "Chunky: full pill radii AND thick 3px borders together; hard offset shadows in a solid color (retro print misregistration).",
    radiusOptions: ["9999px", "12px"],
    colorPhilosophy:
      "Cream base with cherry red, teal/mint, and mustard — jukebox colors with warmth; black only for text and outlines.",
    motion: "Bouncy micro-interactions (spring easing), a gently pulsing 'OPEN' sign energy.",
    forbidden: [
      "minimalist restraint",
      "hairline borders",
      "corporate blue",
      "glassmorphism",
      "muted gray palettes",
    ],
    typeScales: [1.25, 1.333],
  },
  {
    id: "y2k-cyber",
    register: "expressive",
    name: "Y2K Cyber",
    blurb: "Chrome, acid, pixel gloss — the millennium bug as an aesthetic.",
    epoch: "Y2K digital culture, 1998–2004",
    inspirations: [
      "Winamp skins",
      "PlayStation 2 menus",
      "The Designers Republic",
      "Wipeout graphics",
      "early MTV.com",
      "Nokia-era advertising",
    ],
    pairings: [
      { heading: "syne", body: "space-grotesk" },
      { heading: "vt323", body: "space-grotesk" },
      { heading: "space-grotesk", body: "ibm-plex-sans", accent: "vt323" },
    ],
    grid: "Layered and overlapping: stickers, badges, rotated elements, marquee strips; controlled chaos over a simple underlying column.",
    spacingUnits: [4, 8],
    shape: "Chrome/metallic gradients are DELIBERATE here; beveled edges, pixel borders, scanline overlays; mixed sharp and pill shapes.",
    radiusOptions: ["0", "9999px"],
    colorPhilosophy:
      "Silver/chrome grays with acid green, hot pink, or cyber blue — on near-white or deep black. Glossy, saturated, unapologetic.",
    motion: "Glitch accents, blinking highlights, marquee-style motion — all strictly behind prefers-reduced-motion.",
    forbidden: [
      "tasteful minimalism",
      "serif body text",
      "muted natural palettes",
      "editorial whitespace",
      "hand-drawn warmth",
    ],
    typeScales: [1.2, 1.25],
  },
  {
    id: "soft-pop",
    register: "expressive",
    name: "Soft Pop",
    blurb: "Memphis-descended play: confetti geometry, thick outlines, happy color.",
    epoch: "Memphis Group 1980s → contemporary playful branding",
    inspirations: [
      "Memphis Group furniture",
      "Camille Walala murals",
      "Duolingo's energy",
      "Gumroad rebrand",
      "LEGO adult lines",
      "Sonos Move campaigns",
    ],
    pairings: [
      { heading: "bricolage-grotesque", body: "work-sans" },
      { heading: "outfit", body: "lexend" },
      { heading: "syne", body: "outfit" },
    ],
    grid: "Modular but playful: confetti geometric shapes (circles, zigzags, half-moons) scattered with intent; big friendly sections; asymmetric balance.",
    spacingUnits: [8, 10],
    shape: "Mixed radii (some 0, some full pills), thick 2–3px dark outlines, hard offset shadows in a CONTRAST COLOR (not black blur).",
    radiusOptions: ["9999px", "16px", "0"],
    colorPhilosophy:
      "Saturated but friendly: coral, cobalt, lemon, mint on warm white — 3 brights max, anchored by near-black outlines and text.",
    motion: "Springy hovers, tilt-on-hover cards, staggered pop-in entrances.",
    forbidden: [
      "purple-blob gradients",
      "gray-on-gray corporate looks",
      "hairline elegance",
      "photorealistic heroes",
      "dark moody palettes",
    ],
    typeScales: [1.25, 1.333],
  },
  {
    id: "modern-product",
    register: "professional",
    name: "Modern Product",
    blurb: "The contemporary product-web canon — chosen deliberately, executed sharply.",
    epoch: "Product web, 2020s",
    inspirations: [
      "Linear",
      "Stripe",
      "Vercel",
      "Raycast",
      "Arc Browser",
      "Figma marketing",
    ],
    pairings: [
      { heading: "sora", body: "ibm-plex-sans" },
      { heading: "outfit", body: "work-sans" },
      { heading: "space-grotesk", body: "work-sans", accent: "jetbrains-mono" },
    ],
    grid: "Clean container grid, consistent card system, sticky nav; feature sections with strong screenshots/diagrams; dark-mode-friendly structure.",
    spacingUnits: [8],
    shape: "Radius 8–16px, subtle layered shadows, restrained 1px borders on dark; gradients only as quiet background washes.",
    radiusOptions: ["8px", "12px", "16px"],
    colorPhilosophy:
      "Disciplined neutral ramp (warm or cool gray) plus ONE strong brand hue; high-contrast text; optional dark theme with the same hue.",
    motion: "Tasteful 150–250ms micro-transitions, soft scroll reveals, one polished hero moment.",
    forbidden: [
      "the purple-blob gradient hero cliché",
      "emoji as icons",
      "fake testimonials/logos",
      "more than one brand hue",
      "decorative clutter",
    ],
    typeScales: [1.2, 1.25],
  },
  {
    id: "dark-academia",
    register: "expressive",
    name: "Dark Academia",
    blurb: "University press meets candlelit library: Garamond, parchment, footnotes.",
    epoch: "Classic book & university-press typography",
    inspirations: [
      "Penguin Classics",
      "Oxford University Press",
      "Folio Society editions",
      "The Morgan Library",
      "old bookplates & ex libris",
      "19th-century lecture posters",
    ],
    pairings: [
      { heading: "eb-garamond", body: "eb-garamond" },
      { heading: "libre-caslon-text", body: "lora", accent: "special-elite" },
      { heading: "playfair-display", body: "eb-garamond" },
    ],
    grid: "A single readable column (60–72ch) like a well-set book page; numbered sections, footnote-style asides, drop caps; small caps for labels.",
    spacingUnits: [6, 8],
    shape: "Square corners (max 2px); thin rules between sections; ornaments as typographic marks (❦, §) rather than icons. No shadows.",
    radiusOptions: ["0", "2px"],
    colorPhilosophy:
      "Parchment and sepia grounds with oxblood, forest, or navy ink — candlelight warmth; accents from wax-seal red or gilt edges.",
    motion: "Nearly none; a page-turn quietness. At most soft fades.",
    forbidden: [
      "sans-serif-only typography",
      "cards and tiles",
      "bright saturated hues",
      "modern pill buttons",
      "big hero photography",
    ],
    typeScales: [1.25, 1.333],
  },
  {
    id: "nordic-minimal",
    register: "professional",
    name: "Nordic Minimal",
    blurb: "Scandinavian daylight: function, air, birch wood and muted nature tones.",
    epoch: "Scandinavian functionalism, 1960s → today",
    inspirations: [
      "HAY",
      "Muuto",
      "Bang & Olufsen",
      "Marimekko (restrained)",
      "Normann Copenhagen",
      "Kinfolk interiors",
    ],
    pairings: [
      { heading: "work-sans", body: "work-sans" },
      { heading: "jost", body: "lora" },
      { heading: "outfit", body: "lora" },
    ],
    grid: "Airy functionalism: generous light-filled sections, product imagery forward, quiet navigation; alignment does the design work.",
    spacingUnits: [8, 12],
    shape: "Radius 0–4px, barely-there 1px borders in warm gray, no shadows or a single whisper-soft one.",
    radiusOptions: ["0", "4px"],
    colorPhilosophy:
      "White and birch-light neutrals with muted nature tones — fog blue, moss, clay — and near-black text. Never loud, never cold-corporate.",
    motion: "Calm fades and gentle position shifts; daylight, not disco.",
    forbidden: [
      "loud display typography",
      "thick borders",
      "saturated neon",
      "dense information layouts",
      "dark themes",
    ],
    typeScales: [1.2, 1.25],
  },
  {
    id: "industrial-utility",
    register: "expressive",
    name: "Industrial Utility",
    blurb: "Mil-spec labels and factory signage: stencils, hazard accents, data density.",
    epoch: "Industrial signage & utilitarian print, 20th century",
    inspirations: [
      "Carhartt WIP",
      "A-COLD-WALL*",
      "mil-spec crate labels",
      "shipping manifests",
      "OSHA signage",
      "Leatherman packaging",
    ],
    pairings: [
      { heading: "bebas-neue", body: "ibm-plex-sans", accent: "special-elite" },
      { heading: "archivo", body: "ibm-plex-mono" },
      { heading: "bitter", body: "ibm-plex-sans" },
    ],
    grid: "Dense, information-first: spec tables, labeled sections (01/02/03), stamp and label motifs, monospaced data callouts; edge-to-edge structure.",
    spacingUnits: [4, 6],
    shape: "Radius 0; 2px borders; stencil cutouts and hazard-stripe accents used sparingly; hard functional contrast, no shadows.",
    radiusOptions: ["0"],
    colorPhilosophy:
      "Asphalt, charcoal, and off-white with safety orange or caution yellow as the working accent — palette of a well-worn toolbox.",
    motion: "None or instant; this design ships pallets, it does not dance.",
    forbidden: [
      "elegant serifs",
      "script fonts",
      "pastels",
      "generous decorative whitespace",
      "soft shadows",
    ],
    typeScales: [1.2, 1.25],
  },
  {
    id: "corporate-trust",
    register: "professional",
    name: "Corporate Trust",
    blurb: "Dependable enterprise software: structured, blue, reassuringly unflashy.",
    epoch: "Enterprise & B2B software, 2010s–today",
    inspirations: [
      "IBM Carbon",
      "Salesforce Lightning",
      "SAP Fiori",
      "Microsoft Fluent",
      "Atlassian Design",
      "Cisco",
    ],
    pairings: [
      { heading: "ibm-plex-sans", body: "ibm-plex-sans" },
      { heading: "archivo", body: "ibm-plex-sans" },
      { heading: "ibm-plex-sans", body: "work-sans", accent: "ibm-plex-mono" },
    ],
    grid: "Structured container grid with a consistent card and section system; clear top navigation; feature grids, dashboards and comparison tables are welcome; hierarchy through weight and spacing, not decoration.",
    spacingUnits: [8, 12],
    shape: "Moderate radius (4–8px), restrained 1px borders, a single subtle elevation shadow for cards. Nothing floats dramatically.",
    radiusOptions: ["4px", "6px", "8px"],
    colorPhilosophy:
      "White or near-white ground, a disciplined cool-gray neutral ramp, near-black text, and ONE dependable corporate blue (navy→azure) as the primary that signals trust. Accents stay within that blue family — no second loud hue.",
    motion: "Minimal and functional: 150–200ms ease transitions and quiet fades; never playful or bouncy.",
    forbidden: [
      "neon or acid colors",
      "playful script or hand-drawn type",
      "more than one accent hue",
      "brutalist raw edges",
      "meme or novelty energy",
    ],
    typeScales: [1.2, 1.25],
  },
  {
    id: "professional-services",
    register: "professional",
    name: "Professional Services",
    blurb: "Consultancy authority: serif headlines, restrained sans, quiet confidence.",
    epoch: "Consultancy, finance & legal communication, timeless",
    inspirations: [
      "McKinsey",
      "Deloitte",
      "Goldman Sachs",
      "Financial Times",
      "Bain & Company",
      "top-tier law firm identities",
    ],
    pairings: [
      { heading: "lora", body: "work-sans" },
      { heading: "libre-caslon-text", body: "ibm-plex-sans" },
      { heading: "eb-garamond", body: "work-sans", accent: "ibm-plex-mono" },
    ],
    grid: "Structured multi-column with generous margins; understated authority through alignment and restraint; charts, figures and key statistics carry the page; a confident but quiet headline hierarchy.",
    spacingUnits: [8, 12],
    shape: "Square to barely-soft corners (0–4px), hairline dividers between sections, no or whisper-soft shadows. Substance over ornament.",
    radiusOptions: ["0", "2px", "4px"],
    colorPhilosophy:
      "Deep navy or charcoal with a white/ivory ground and near-black text; ONE restrained accent (oxblood, deep teal, or muted gold) for links and key figures. Muted and confident, never bright.",
    motion: "Quiet and composed: subtle fades and section scroll-reveals at most. Authority does not animate.",
    forbidden: [
      "bright saturated colors",
      "playful illustration or emoji",
      "loud pill-shaped CTAs",
      "gradients",
      "trendy startup gimmicks",
    ],
    typeScales: [1.25, 1.333],
  },
  {
    id: "clean-clinical",
    register: "professional",
    name: "Clear & Accessible",
    blurb: "Public-service clarity: calm, high-contrast, task-first, trustworthy.",
    epoch: "Digital public services, health & fintech, 2015–today",
    inspirations: [
      "GOV.UK Design System",
      "NHS digital service manual",
      "US Web Design System",
      "Stripe (its calmer surfaces)",
      "Wise",
      "health-insurance portals",
    ],
    pairings: [
      { heading: "lexend", body: "lexend" },
      { heading: "work-sans", body: "work-sans" },
      { heading: "sora", body: "ibm-plex-sans" },
    ],
    grid: "Plain, task-first layout with clear steps and generous line-height; one primary action per view; forms and content designed for comprehension, not persuasion; obvious, strong focus states.",
    spacingUnits: [8, 12],
    shape: "Modest radius (4–8px), clear 2px focus outlines, restrained borders, minimal shadow. Interactive affordances are visible and obvious.",
    radiusOptions: ["4px", "8px"],
    colorPhilosophy:
      "Calm and trustworthy: white or very-light ground, a confident but non-aggressive blue or teal as the primary action color, and near-black text at WCAG-AAA contrast. Success-green and warning-amber only for status, never decoration.",
    motion: "Minimal and never distracting: short functional transitions only; motion never carries required information.",
    forbidden: [
      "low-contrast gray-on-gray text",
      "decorative gradients",
      "dark moody themes",
      "tiny type",
      "more than one accent hue",
    ],
    typeScales: [1.2, 1.25],
  },
];

const worldById = new Map(DESIGN_WORLDS.map((w) => [w.id, w]));

export function getWorld(id: string): DesignWorld | null {
  return worldById.get(id) ?? null;
}

export type WorldCandidate = {
  world: DesignWorld;
  mutations: StyleMutations;
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function sampleMutations(world: DesignWorld): StyleMutations {
  return {
    spacingUnit: pick(world.spacingUnits),
    typeScale: pick(world.typeScales),
    radius: pick(world.radiusOptions),
  };
}

function shuffled<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function toCandidate(world: DesignWorld): WorldCandidate {
  return { world, mutations: sampleMutations(world) };
}

/**
 * Samples n candidate worlds (without replacement) with per-project mutations.
 * Register-BLIND — used only for the interview-generation-failure fallback,
 * where no request register is known. The interview itself uses the stratified
 * sampler below. The LLM only ever picks among and instantiates what the dice
 * offered — asked freely, it would converge on the same three answers.
 */
export function sampleWorldCandidates(n = 6): WorldCandidate[] {
  return shuffled(DESIGN_WORLDS)
    .slice(0, Math.min(n, DESIGN_WORLDS.length))
    .map(toCandidate);
}

/**
 * The interview's candidate pool: a STRATIFIED sample that always spans both
 * registers, so the LLM can offer an all-professional trio to a B2B request OR
 * an all-expressive one to a playful request — then it picks by fit. Real
 * server entropy still decides WHICH worlds within each register; the LLM only
 * ever instantiates what the dice offered. Backfills from the other register if
 * one can't meet its quota (it never can't with the current library).
 */
export function sampleInterviewCandidates(
  total = 6,
  professional = 3,
): WorldCandidate[] {
  const pool = (r: WorldRegister) =>
    shuffled(DESIGN_WORLDS.filter((w) => w.register === r));
  const picked: DesignWorld[] = [
    ...pool("professional").slice(0, professional),
    ...pool("expressive").slice(0, total - professional),
  ];
  if (picked.length < total) {
    const chosen = new Set(picked);
    for (const w of shuffled(DESIGN_WORLDS)) {
      if (picked.length >= total) break;
      if (!chosen.has(w)) {
        chosen.add(w);
        picked.push(w);
      }
    }
  }
  // Re-shuffle so professional worlds aren't always presented first.
  return shuffled(picked).map(toCandidate);
}
