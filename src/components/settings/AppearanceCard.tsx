import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsCard } from "./SettingsCard";
import { useTheme } from "@/hooks/useTheme";

export function AppearanceCard() {
  const { theme, setTheme } = useTheme();

  return (
    <SettingsCard
      title="Appearance"
      description="Dark is the working theme; light is there for printing and bright rooms."
      action={
        <Button
          size="sm"
          variant="outline"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? (
            <Sun className="mr-1.5 h-3.5 w-3.5" />
          ) : (
            <Moon className="mr-1.5 h-3.5 w-3.5" />
          )}
          {theme === "dark" ? "Switch to light" : "Switch to dark"}
        </Button>
      }
    />
  );
}
