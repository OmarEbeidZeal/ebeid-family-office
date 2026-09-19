import { ArrowDownRight, ArrowUpRight, Check, Monitor } from "lucide-react";
import { SettingsCard } from "./SettingsCard";
import { ThemeTile } from "./ThemeTile";
import { useTheme } from "@/hooks/useTheme";
import { SIGN_PALETTES, THEMES, themeMeta } from "@/lib/themes";
import { cn } from "@/lib/utils";

/**
 * Two independent choices, in the order they matter.
 *
 * The theme sets surfaces and one accent. The gain/loss pair is separate,
 * because red/green is the common colour-vision deficiency and that pair
 * carries the most important signal in this app. Neither choice touches the
 * chart palette: data colour is not brand colour.
 */
export function AppearanceCard() {
  const { choice, theme, mode, signs, setChoice, setSigns } = useTheme();
  const systemLabel = choice === "system" ? `following the device — ${themeMeta(theme).label}` : "";

  return (
    <SettingsCard
      title="Appearance"
      description="Your own choice, saved to your profile rather than to this browser. Applies the moment you pick it."
    >
      <div className="space-y-6">
        <div>
          <p className="eyebrow">Theme</p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {THEMES.map((entry) => (
              <ThemeTile
                key={entry.name}
                label={entry.label}
                note={entry.note}
                swatch={entry.swatch}
                selected={choice === entry.name}
                onSelect={() => setChoice(entry.name)}
              />
            ))}
            <ThemeTile
              label="Match system"
              note={
                systemLabel
                  ? `Midnight after dark, Parchment by day — ${systemLabel}.`
                  : "Midnight after dark, Parchment by day."
              }
              swatch={themeMeta("midnight").swatch}
              secondSwatch={themeMeta("parchment").swatch}
              selected={choice === "system"}
              onSelect={() => setChoice("system")}
            />
          </div>
          {choice === "system" && (
            <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Monitor className="size-3.5 shrink-0" />
              Showing {themeMeta(theme).label} because that is what this device asks for.
            </p>
          )}
        </div>

        <div className="border-t border-border pt-5">
          <p className="eyebrow">Gain and loss colours</p>
          <p className="mt-1.5 max-w-xl text-xs leading-relaxed text-muted-foreground">
            Independent of the theme. Whichever you choose, no figure in the app is ever marked by
            colour alone — every one carries a sign or an arrow as well.
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {SIGN_PALETTES.map((palette) => {
              const pair = mode === "light" ? palette.light : palette.dark;
              const selected = signs === palette.id;
              return (
                <button
                  key={palette.id}
                  type="button"
                  onClick={() => setSigns(palette.id)}
                  aria-pressed={selected}
                  className={cn(
                    "flex flex-col gap-3 rounded-lg border p-3 text-left transition-colors",
                    selected
                      ? "border-gold bg-gold-soft"
                      : "border-border bg-surface hover:border-border-strong",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm text-foreground">{palette.label}</span>
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded-full border",
                        selected
                          ? "border-gold bg-gold text-primary-foreground"
                          : "border-border-strong",
                      )}
                    >
                      {selected && <Check className="size-2.5" strokeWidth={3} />}
                    </span>
                  </span>

                  <span className="flex flex-wrap items-center gap-x-5 gap-y-1">
                    <span
                      className="num inline-flex items-center gap-1 text-sm"
                      style={{ color: pair.gain }}
                    >
                      <ArrowUpRight className="size-3.5" />
                      +£12,480
                    </span>
                    <span
                      className="num inline-flex items-center gap-1 text-sm"
                      style={{ color: pair.loss }}
                    >
                      <ArrowDownRight className="size-3.5" />
                      −£3,150
                    </span>
                  </span>

                  <span className="text-[0.7rem] leading-snug text-muted-foreground">
                    {palette.note}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </SettingsCard>
  );
}
