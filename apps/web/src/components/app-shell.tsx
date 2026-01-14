'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Code2, FlaskConical, LayoutDashboard, Package, Rocket, Search, Sparkles } from 'lucide-react';
import { useTheme } from 'next-themes';

import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Kbd,
  Separator,
} from '@ai-infra-studio/ui';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, shortcut: 'g d' },
  { href: '/authoring', label: 'Authoring', icon: Code2, shortcut: 'g a' },
  { href: '/experiments', label: 'Experiments', icon: FlaskConical, shortcut: 'g e' },
  { href: '/registry', label: 'Registry', icon: Package, shortcut: 'g r' },
  { href: '/deployments', label: 'Deployments', icon: Rocket, shortcut: 'g p' },
] as const;

function isTypingTarget(target: EventTarget | null) {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || target.isContentEditable;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchRef = React.useRef<HTMLInputElement | null>(null);

  const [goMode, setGoMode] = React.useState(false);
  const goModeTimer = React.useRef<number | null>(null);

  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (isTypingTarget(event.target)) return;

      if (event.key === '/') {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }

      if (event.key === '?') {
        event.preventDefault();
        setShortcutsOpen(true);
        return;
      }

      if (event.key.toLowerCase() === 'g') {
        setGoMode(true);
        if (goModeTimer.current) window.clearTimeout(goModeTimer.current);
        goModeTimer.current = window.setTimeout(() => setGoMode(false), 900);
        return;
      }

      if (!goMode) return;

      const key = event.key.toLowerCase();
      const dest =
        key === 'd'
          ? '/'
          : key === 'e'
            ? '/experiments'
            : key === 'r'
              ? '/registry'
              : key === 'p'
                ? '/deployments'
                : key === 'a'
                  ? '/authoring'
                  : null;
      if (!dest) return;

      event.preventDefault();
      setGoMode(false);
      router.push(dest);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goMode, router]);

  return (
    <div className="grid min-h-screen grid-cols-[260px_1fr]">
      <nav
        aria-label="Primary navigation"
        className="flex flex-col border-r border-border/80 bg-background/40 backdrop-blur supports-[backdrop-filter]:bg-background/20"
      >
        <div className="flex items-center gap-2 px-4 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/40">
            <Sparkles className="h-4 w-4 text-foreground" aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold leading-5">AI Infra Studio</div>
            <div className="truncate text-xs text-muted-foreground">Internal tooling demo</div>
          </div>
        </div>
        <div className="px-2">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'group flex items-center justify-between rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active && 'bg-accent text-foreground',
                )}
              >
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4 opacity-80" aria-hidden />
                  {item.label}
                </span>
                <span className="hidden gap-1 text-[11px] text-muted-foreground group-hover:flex">
                  {item.shortcut.split(' ').map((k, idx) => (
                    <Kbd key={`${item.href}_${idx}`}>{k}</Kbd>
                  ))}
                </span>
              </Link>
            );
          })}
        </div>
        <div className="mt-auto p-3">
          <div className="rounded-xl border border-border bg-muted/20 p-3">
            <div className="text-xs font-medium text-foreground">Keyboard-first</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Press <Kbd>?</Kbd> for shortcuts, <Kbd>/</Kbd> to search.
            </div>
          </div>
        </div>
      </nav>

      <div className="flex min-w-0 flex-col">
        <header className="flex items-center gap-3 border-b border-border/80 bg-background/40 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/20">
          <div className="relative flex w-full max-w-xl items-center gap-2">
            <Search className="pointer-events-none absolute left-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
            <label className="sr-only" htmlFor="global-search">
              Global search
            </label>
              <Input
                id="global-search"
                ref={searchRef}
                placeholder="Search runs, experiments, models…"
                className="pl-9"
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key === 'Escape') (e.target as HTMLInputElement).blur();
              }}
              />
            <div className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
              <Kbd>/</Kbd>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" aria-label="Open keyboard shortcuts">
                  <span className="hidden sm:inline">Shortcuts</span>
                  <span className="sm:hidden">?</span>
                </Button>
              </DialogTrigger>
              <DialogContent aria-label="Keyboard shortcuts">
                <DialogHeader>
                  <DialogTitle>Keyboard shortcuts</DialogTitle>
                  <DialogDescription>Navigate faster and keep focus on the data.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-3">
                  <ShortcutRow label="Dashboard" keys={['g', 'd']} />
                  <ShortcutRow label="Experiments" keys={['g', 'e']} />
                  <ShortcutRow label="Registry" keys={['g', 'r']} />
                  <ShortcutRow label="Deployments" keys={['g', 'p']} />
                  <ShortcutRow label="Focus search" keys={['/']} />
                  <Separator />
                  <div className="text-xs text-muted-foreground">
                    Tip: these shortcuts ignore keypresses while you’re typing in an input.
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </header>

        <main id="main" className="min-w-0 flex-1 px-4 py-6">
          {children}
        </main>
      </div>
    </div>
  );
}

function ShortcutRow({ label, keys }: { label: string; keys: string[] }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-sm text-foreground">{label}</div>
      <div className="flex items-center gap-1">
        {keys.map((k, i) => (
          <Kbd key={`${label}_${i}`}>{k}</Kbd>
        ))}
      </div>
    </div>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isLight = theme === 'light';

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setTheme(isLight ? 'dark' : 'light')}
      aria-label={isLight ? 'Switch to dark theme' : 'Switch to light theme'}
      title="Toggle theme"
    >
      {isLight ? 'Dark' : 'Light'}
    </Button>
  );
}
