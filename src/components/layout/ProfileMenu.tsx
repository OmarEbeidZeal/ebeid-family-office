import { useNavigate } from "@tanstack/react-router";
import { LogOut, Moon, Settings as SettingsIcon, Sun, UserRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";

export function ProfileMenu() {
  const { profile, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  const name = profile?.display_name ?? profile?.full_name ?? profile?.email ?? "Account";
  const initials = name
    .split(" ")
    .map((part) => part.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="num flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface text-[0.7rem] text-foreground transition-colors hover:border-gold-line hover:text-gold lg:h-8 lg:w-8"
        >
          {initials || <UserRound className="h-4 w-4" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 border-border bg-popover">
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm text-foreground">{name}</p>
          <p className="truncate text-xs text-muted-foreground">{profile?.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void navigate({ to: "/settings" })}>
          <SettingsIcon className="mr-2 h-4 w-4" /> Settings
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? (
            <>
              <Sun className="mr-2 h-4 w-4" /> Light theme
            </>
          ) : (
            <>
              <Moon className="mr-2 h-4 w-4" /> Dark theme
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut className="mr-2 h-4 w-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
