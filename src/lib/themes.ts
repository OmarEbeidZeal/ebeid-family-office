/**
 * The theme catalogue.
 *
 * A theme sets surfaces and one accent — nothing else. It deliberately does
 * not touch the chart palette: a categorical palette validated for
 * colour-vision separation stops being validated the moment it is repainted to
 * match a brand colour. Gain and loss are a separate choice again, because
 * red/green is the common colour-vision deficiency and that pair carries the
 * most important signal in this app.
 *
 * The swatch values here are for the picker's previews only. The tokens the
 * app actually renders from live in `src/styles.css`, keyed off `data-theme`.
 */

export type ThemeName = "midnight" | "parchment" | "slate" | "linen" | "contrast";

/** What a person picked. `system` follows the device. */
export type ThemeChoice = ThemeName | "system";

export type ThemeMode = "dark" | "light";

export type SignPalette = "green_red" | "blue_orange";

export type ThemeMeta = {
  name: ThemeName;
  label: string;
  mode: ThemeMode;
  /** One line, in the picker, describing what it is for. */
  note: string;
  swatch: {
    ground: string;
    raised: string;
    border: string;
    accent: string;
    text: string;
  };
};

export const THEMES: ThemeMeta[] = [
  {
    name: "midnight",
    label: "Midnight",
    mode: "dark",
    note: "The working theme. Near-black ground, antique gold.",
    swatch: {
      ground: "#0A0B0D",
      raised: "#121417",
      border: "#1A1D21",
      accent: "#C9A961",
      text: "#E8E6E1",
    },
  },
  {
    name: "parchment",
    label: "Parchment",
    mode: "light",
    note: "Warm paper and aged bronze — for print and bright rooms.",
    swatch: {
      ground: "#FAF9F7",
      raised: "#FFFFFF",
      border: "#E3DFD8",
      accent: "#8C6A2B",
      text: "#1E1C18",
    },
  },
  {
    name: "slate",
    label: "Slate",
    mode: "dark",
    note: "Cool graphite and steel blue. Quieter than Midnight.",
    swatch: {
      ground: "#0E1116",
      raised: "#161B22",
      border: "#232A34",
      accent: "#7FA8D9",
      text: "#E3E8EF",
    },
  },
  {
    name: "linen",
    label: "Linen",
    mode: "light",
    note: "Cool paper and deep teal. A light theme with no warmth in it.",
    swatch: {
      ground: "#F7F6F3",
      raised: "#FFFFFF",
      border: "#E2E0DA",
      accent: "#146B5E",
      text: "#1B1E1D",
    },
  },
  {
    name: "contrast",
    label: "Contrast",
    mode: "dark",
    note: "Pure black, amber, thicker focus rings. Body text at 7:1 or better.",
    swatch: {
      ground: "#000000",
      raised: "#0D0D0D",
      border: "#3A3A3A",
      accent: "#FFC857",
      text: "#FFFFFF",
    },
  },
];

const BY_NAME = new Map(THEMES.map((theme) => [theme.name, theme]));

export const DEFAULT_THEME: ThemeName = "midnight";
export const DEFAULT_SIGNS: SignPalette = "green_red";

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === "system" || (typeof value === "string" && BY_NAME.has(value as ThemeName));
}

export function isSignPalette(value: unknown): value is SignPalette {
  return value === "green_red" || value === "blue_orange";
}

export function themeMeta(name: ThemeName): ThemeMeta {
  return BY_NAME.get(name) ?? BY_NAME.get(DEFAULT_THEME)!;
}

/** `system` maps to Midnight or Parchment; everything else is itself. */
export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): ThemeName {
  if (choice === "system") return prefersDark ? "midnight" : "parchment";
  return BY_NAME.has(choice) ? choice : DEFAULT_THEME;
}

export function themeMode(name: ThemeName): ThemeMode {
  return themeMeta(name).mode;
}

/** The CSS attribute value; the stored value uses an underscore. */
export function signsAttribute(palette: SignPalette): "green-red" | "blue-orange" {
  return palette === "blue_orange" ? "blue-orange" : "green-red";
}

export type SignPaletteMeta = {
  id: SignPalette;
  label: string;
  note: string;
  dark: { gain: string; loss: string };
  light: { gain: string; loss: string };
};

export const SIGN_PALETTES: SignPaletteMeta[] = [
  {
    id: "green_red",
    label: "Green / red",
    note: "The convention. Familiar at a glance.",
    dark: { gain: "#4ADE80", loss: "#F87171" },
    light: { gain: "#2E6A4C", loss: "#98372F" },
  },
  {
    id: "blue_orange",
    label: "Blue / orange",
    note: "Colour-vision safe. Separates for red–green deficiency.",
    dark: { gain: "#3987E5", loss: "#D95926" },
    light: { gain: "#2A78D6", loss: "#EB6834" },
  },
];

export function signPaletteMeta(id: SignPalette): SignPaletteMeta {
  return SIGN_PALETTES.find((palette) => palette.id === id) ?? SIGN_PALETTES[0]!;
}

/** Storage keys for the pre-paint cache. The profile remains the record. */
export const THEME_STORAGE_KEY = "efo.theme";
export const SIGNS_STORAGE_KEY = "efo.signs";

/**
 * Runs before first paint, inlined in the document head, so a person who
 * chose Parchment never sees a black flash on the way in.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{
var names={midnight:'dark',parchment:'light',slate:'dark',linen:'light',contrast:'dark'};
var c=localStorage.getItem('${THEME_STORAGE_KEY}')||'${DEFAULT_THEME}';
var s=localStorage.getItem('${SIGNS_STORAGE_KEY}')||'${DEFAULT_SIGNS}';
var t=c==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'midnight':'parchment'):c;
if(!names[t])t='${DEFAULT_THEME}';
var m=names[t];
var r=document.documentElement;
r.setAttribute('data-theme',t);
r.setAttribute('data-mode',m);
r.setAttribute('data-signs',s==='blue_orange'?'blue-orange':'green-red');
r.classList.remove('dark','light');r.classList.add(m);
}catch(e){}})();`;
