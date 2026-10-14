// ThemeToggle remains in AppShell so light/dark mode is always available.
import { ThemeToggle } from "@/components/theme-toggle";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <ThemeToggle />
      <main className="pt-28 pb-32">{children}</main>
    </div>
  );
}
