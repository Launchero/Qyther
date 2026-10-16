import React, { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import {
  GearSixIcon,
  PaintBrushIcon,
  KeyboardIcon,
  CpuIcon,
  PuzzlePieceIcon,
  LockIcon,
  TerminalWindowIcon,
  InfoIcon,
  XIcon,
  MagnifyingGlassIcon,
} from '@phosphor-icons/react';
import { GeneralSection } from './GeneralSection';
import { AppearanceSection } from './AppearanceSection';
import { ShortcutsSection } from './ShortcutsSection';
import { ModelApiSection } from './ModelApiSection';
import { ToolsSection } from './ToolsSection';
import { PrivacySection } from './PrivacySection';
import { AdvancedSection } from './AdvancedSection';
import { AboutSection } from './AboutSection';

type SectionId =
  | 'general'
  | 'appearance'
  | 'shortcuts'
  | 'model'
  | 'tools'
  | 'privacy'
  | 'advanced'
  | 'about';

interface Section {
  id: SectionId;
  label: string;
  icon: React.ElementType;
  component: React.ComponentType;
}

const SECTIONS: Section[] = [
  { id: 'general', label: 'General', icon: GearSixIcon, component: GeneralSection },
  { id: 'appearance', label: 'Appearance', icon: PaintBrushIcon, component: AppearanceSection },
  { id: 'shortcuts', label: 'Shortcuts', icon: KeyboardIcon, component: ShortcutsSection },
  { id: 'model', label: 'Model & API', icon: CpuIcon, component: ModelApiSection },
  { id: 'tools', label: 'Tools & Providers', icon: PuzzlePieceIcon, component: ToolsSection },
  { id: 'privacy', label: 'Privacy & Data', icon: LockIcon, component: PrivacySection },
  { id: 'advanced', label: 'Advanced', icon: TerminalWindowIcon, component: AdvancedSection },
  { id: 'about', label: 'About', icon: InfoIcon, component: AboutSection },
];

export function SettingsApp() {
  const [active, setActive] = useState<SectionId>('general');
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS.filter((section) => section.label.toLowerCase().includes(q));
  }, [query]);

  const ActiveSection = SECTIONS.find((section) => section.id === active)?.component;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Frameless: the whole bar is a drag region; only the close button is interactive (no-drag). */}
      <header className="flex items-center justify-between border-b border-border px-4 py-2 [-webkit-app-region:drag]">
        <span className="select-none text-sm font-medium text-muted-foreground">Qyther Settings</span>
        <button
          type="button"
          onClick={() => window.close()}
          aria-label="Close settings"
          className="rounded-[var(--radius-md)] p-1 text-muted-foreground hover:bg-accent hover:text-foreground [-webkit-app-region:no-drag]"
        >
          <XIcon className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-60 shrink-0 flex-col border-r border-border">
          <div className="px-3 pb-2 pt-3">
            <div className="relative">
              <MagnifyingGlassIcon
                className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search settings"
                aria-label="Search settings"
                className="pl-7"
              />
            </div>
          </div>

          <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 pb-3" aria-label="Settings sections">
            {visible.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => setActive(section.id)}
                aria-current={active === section.id ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-left text-sm',
                  active === section.id
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                )}
              >
                <section.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{section.label}</span>
              </button>
            ))}
            {visible.length === 0 && (
              <p className="px-2 py-1 text-xs text-muted-foreground">No settings match “{query}”.</p>
            )}
          </nav>
        </aside>

        <main className="min-h-0 flex-1 overflow-y-auto p-6">
          {ActiveSection ? <ActiveSection /> : null}
        </main>
      </div>
    </div>
  );
}
