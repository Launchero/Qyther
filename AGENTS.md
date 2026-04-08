# Agent Instructions

## Stack
- Electron 35, React 19, TypeScript 5.7, Vite 6
- Global shortcut: Alt+Space
- Performance target: <500ms cold start

## Essential Commands
```bash
npm run dev        # Start dev server
npm run build      # Build for production
npm run typecheck  # TypeScript check
npm run lint       # ESLint check
```

## Critical Constraints
- Context Isolation + Sandbox enabled (security-first)
- All IPC calls validated in `src/main/ipc/handlers.ts`
- Follow patterns in existing components

## Canonical Examples
- Main process: `src/main/main.ts`
- Window management: `src/main/windows.ts`
- Component pattern: `src/renderer/components/CommandPalette.tsx`
- IPC handlers: `src/main/ipc/handlers.ts`
- Custom hook: `src/renderer/hooks/useKeyboard.ts`

## Design Systems

- **Kraken Design Language**: Follow `@design-systems/kraken/DESIGN.md` for alternative UI implementation
  - Brand: Kraken Purple (`#7132f5`) with darker variants (`#5741d8`, `#5b1ecf`)
  - Background: White (`#ffffff`) with near-black text (`#101114`)
  - Typography: Kraken-Brand (display) + Kraken-Product/UI (IBM Plex Sans fallback)
  - Buttons: 12px radius (rounded, not pill)
  - Shadows: Subtle (`rgba(0,0,0,0.03) 0px 4px 24px`)
  - Preview: Open `@design-systems/kraken/preview.html` (light) or `preview-dark.html` (dark)

## Web & MCP Tools
- Use WebSearch for current info (2025-2026)
- Use WebFetch for documentation URLs
- Use Context7 MCP for library APIs
- Use browser for frontend testing


## Auto-Update Rule
This file is automatically maintained by Cursor subagents. Before updating, subagents MUST reference `@AGENT-INSTRUCTION-BEST-PRACTICES.md` to ensure minimal, relevant context only.
