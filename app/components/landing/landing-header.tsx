import { Link } from "react-router";
import { Moon, Sun } from "lucide-react";
import { Button } from "~/components/ui/button";
import { useDarkMode } from "~/components/use-dark-mode";

const navLinkClass =
  "text-sm font-medium text-muted-foreground transition-colors hover:text-foreground";

function ThemeToggle() {
  const { isDark, toggleDarkMode } = useDarkMode();
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      onClick={toggleDarkMode}
      className="rounded-md p-2 text-muted-foreground transition-colors hover:text-foreground"
      title={label}
      aria-label={label}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

function AccountLinks({ signedIn }: { signedIn: boolean }) {
  if (signedIn) {
    return (
      <Button asChild size="sm">
        <Link to="/dashboard">Dashboard</Link>
      </Button>
    );
  }
  return (
    <>
      <Link to="/login" className={navLinkClass}>
        Log In
      </Link>
      <Button asChild size="sm">
        <Link to="/signup">Sign Up</Link>
      </Button>
    </>
  );
}

export function LandingHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link to="/" className="text-xl font-bold tracking-tight">
          Cadence
        </Link>
        <nav className="flex items-center gap-6">
          <Link to="/courses" className={navLinkClass}>
            Courses
          </Link>
          <ThemeToggle />
          <AccountLinks signedIn={signedIn} />
        </nav>
      </div>
    </header>
  );
}
