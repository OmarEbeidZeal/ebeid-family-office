import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  DEFAULT_SIGNS,
  DEFAULT_THEME,
  SIGNS_STORAGE_KEY,
  THEME_STORAGE_KEY,
  isSignPalette,
  isThemeChoice,
  resolveTheme,
  signsAttribute,
  themeMode,
  type SignPalette,
  type ThemeChoice,
  type ThemeMode,
  type ThemeName,
} from "@/lib/themes";

type ThemeContextValue = {
  /** What the person picked, which may be `system`. */
  choice: ThemeChoice;
  /** What is actually on screen. */
  theme: ThemeName;
  mode: ThemeMode;
  signs: SignPalette;
  setChoice: (choice: ThemeChoice) => void;
  setSigns: (signs: SignPalette) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStored<T>(key: string, guard: (value: unknown) => value is T, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.localStorage.getItem(key);
    return guard(stored) ? stored : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* A private window that refuses storage still gets the right theme now. */
  }
}

/**
 * Appearance is per person, not per device: the choice is recorded on the
 * profile so Omar and Haya each get their own, and mirrored into local storage
 * purely so the next load paints the right colours before React starts.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const [choice, setChoiceState] = useState<ThemeChoice>(DEFAULT_THEME);
  const [signs, setSignsState] = useState<SignPalette>(DEFAULT_SIGNS);
  const [prefersDark, setPrefersDark] = useState(true);
  /** Once a profile's stored preference has been adopted, stop re-adopting it. */
  const adopted = useRef<string | null>(null);

  // Local storage first: it is what the pre-paint script already applied, so
  // reading it keeps React's first render identical to what is on screen.
  useEffect(() => {
    setChoiceState(readStored(THEME_STORAGE_KEY, isThemeChoice, DEFAULT_THEME));
    setSignsState(readStored(SIGNS_STORAGE_KEY, isSignPalette, DEFAULT_SIGNS));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    setPrefersDark(query.matches);
    const onChange = (event: MediaQueryListEvent) => setPrefersDark(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // The profile is the record. When it arrives, it wins — signing in on a
  // borrowed laptop should still look like your own.
  useEffect(() => {
    if (!profile || adopted.current === profile.id) return;
    adopted.current = profile.id;
    const storedChoice = isThemeChoice(profile.theme_name) ? profile.theme_name : DEFAULT_THEME;
    const storedSigns = isSignPalette(profile.sign_palette) ? profile.sign_palette : DEFAULT_SIGNS;
    setChoiceState(storedChoice);
    setSignsState(storedSigns);
    write(THEME_STORAGE_KEY, storedChoice);
    write(SIGNS_STORAGE_KEY, storedSigns);
  }, [profile]);

  const theme = resolveTheme(choice, prefersDark);
  const mode = themeMode(theme);

  // Applying is instant: attributes on <html>, no reload, no repaint of data.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    root.setAttribute("data-mode", mode);
    root.setAttribute("data-signs", signsAttribute(signs));
    // Kept for the few shadcn primitives that key off the class.
    root.classList.remove("dark", "light");
    root.classList.add(mode);
  }, [theme, mode, signs]);

  // The browser chrome follows the ground colour, so the notch on a phone
  // stops being a black bar over a light theme.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    const ground = getComputedStyle(document.documentElement)
      .getPropertyValue("--background")
      .trim();
    if (ground) meta.setAttribute("content", ground);
  }, [theme]);

  const persist = useMutation({
    mutationFn: async (patch: { theme_name?: ThemeChoice; sign_palette?: SignPalette }) => {
      if (!profile) return;
      const { error } = await supabase.from("profiles").update(patch).eq("id", profile.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["session-context"] }),
    onError: () => toast.error("Your appearance is applied, but couldn't be saved to your profile."),
  });

  const setChoice = useCallback(
    (next: ThemeChoice) => {
      setChoiceState(next);
      write(THEME_STORAGE_KEY, next);
      persist.mutate({ theme_name: next });
    },
    [persist],
  );

  const setSigns = useCallback(
    (next: SignPalette) => {
      setSignsState(next);
      write(SIGNS_STORAGE_KEY, next);
      persist.mutate({ sign_palette: next });
    },
    [persist],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ choice, theme, mode, signs, setChoice, setSigns }),
    [choice, theme, mode, signs, setChoice, setSigns],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}

/** True where the surface underneath is a light one. Charts read this. */
export function useChartMode(): ThemeMode {
  return useTheme().mode;
}
