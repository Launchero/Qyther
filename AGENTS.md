# Agent Instructions

## Stack

- Electron 42, React 19, TypeScript 6.0, Vite 8
- Global shortcut: Alt+Space
- Performance target: <500ms cold start

## Essential Commands

```bash
npm run dev           # Start dev server
npm run build         # Build for production
npm run preview       # Preview production build
npm run typecheck     # TypeScript check
npm run lint          # ESLint check
npm run test          # Run tests
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage
npm run build:win     # Build Windows installer
```

## Critical Constraints

- All IPC calls validated in `src/main/ipc/handlers.ts`
- Follow patterns in existing components

## Canonical Examples

- Main process: `src/main/main.ts`
- Window management: `src/main/windows.ts`
- Component pattern: `src/renderer/components/CommandPalette.tsx`
- IPC handlers: `src/main/ipc/handlers.ts`
- Custom hook: `src/renderer/hooks/useKeyboard.ts`

## Key Dependencies

- **AI/LLM**: LangGraph, LangChain, OpenAI SDK, MCP SDK
- **Database**: better-sqlite3
- **UI**: Radix UI, shadcn/ui, CVA, Recharts, Phosphor Icons
- **Validation**: Zod v4
- **Search**: Fuse.js
- **Windows Native**: libwin32, koffi

## Web & MCP Tools

- Use WebSearch for current info (2025-2026)
- Use WebFetch for documentation URLs
- Use Context7 MCP for library APIs
- Use browser for frontend testing

## Karpathy Principles

### Core Operating Principles (from Andrej Karpathy, 2026)

1. **Sync in macro actions** - Think in features, not lines. Delegate whole features, review system-level.
2. **Instructions as tunable code** - SKILL.md files are code you iterate on.
3. **Context engineering over implementation** - Context quality dominates output.
4. **Simplicity bias** - "All else equal, simpler is better." No speculative code.
5. **Bounded autonomy** - Maximum freedom within tight constraints.
6. **Instruction-first development** - Write intent before opening editor.

### Skill Navigation

| Situation | Use This Skill |
|---|---|
| **Executing approved plan (DEFAULT)** | `plan-executor-orchestrator` |
| Sequential subagent handoff & verification | `agent-handoff-verification` (rule) |
| Electron main process / architecture | `electron-core` |
| Electron + React integration | `electron-react-core` |
| IPC patterns (main <-> renderer) | `electron-react-ipc` |
| Security best practices | `electron-react-security` |
| Performance optimization | `electron-react-performance` |
| Component design patterns | `electron-react-components` |
| Electron-vite build config | `electron-react-build` |
| React 19 state patterns | `electron-react-state` |
| Testing patterns | `electron-react-testing` |
| LangGraph StateGraph / research agent | `langgraph-agent-patterns` |
| MCP server integration (tool calling) | `mcp-server-integration` |
| Structured LLM output to React components | `generative-ui-components` |
| Electron data persistence (SQLite, better-sqlite3) | `electron-data` |
| Electron performance profiling | `electron-performance` |
| TypeScript type patterns | `typescript-core` |
| TypeScript performance optimization | `typescript-performance` |
| TypeScript security patterns | `typescript-security` |
| TypeScript UI patterns | `typescript-ui` |
| Raw SQLite patterns (hooks state) | `sqlite-patterns` |
| Windows-specific hook development | `cursor-hooks-windows-dev` |

### Simplicity Rules (Enforced)

- Maximum 50 lines per function; extract helpers beyond that
- No error handling for impossible scenarios
- No "flexibility" or "configurability" not requested
- No abstractions for single-use code
- Every changed line must trace to the user's request

### Bounded Autonomy Defaults

| Constraint | Default |
| --------------- | ----------------------- |
| Scope           | 1-3 files max per agent |
| Time budget     | 300s per experiment     |
| Metric          | One unambiguous metric  |
| Rollback        | Git reset on failure    |
| Max experiments | 100 (standard) |

## UI & Design System

### Token-Driven Architecture (MANDATORY)

All UI features MUST use the design token system. See `@design-tokens-enforcement` rule for full token documentation, usage rules, and Tailwind v4 guidance.

Key rules: NEVER hardcode pixel values or OKLCH colors. ALWAYS use `var(--token-name)` or Tailwind utilities from `@theme inline`.

### shadcn/ui Patterns

- **Components are source code**: Treat `components/ui/` as owned code, not dependencies
- **File organization**:
  - `components/ui/` - shadcn primitives (keep pristine for updates)
  - `components/common/` - Wrapper components with custom logic (USE FOR DOMAIN-SPECIFIC)
  - `components/ask-mode/` - Ask mode domain components (chat, browser, generative UI)
  - `components/` root - Top-level app components (CommandPalette, SearchBar, etc)
- **Theming**: Use CSS variables in token files (never hardcode colors)
  - Follow `name` / `name-foreground` convention
  - OKLCH color format (REQUIRED)
  - Dark mode via `.dark` selector + `@variant dark`
- **Component patterns**:
  - Use `cn()` for class merging (clsx + tailwind-merge)
  - Use CVA for component variants
  - Preserve Radix UI accessibility attributes
  - Test in light + dark mode
- **Updates**: Run `npx shadcn@latest diff` monthly, apply selectively

### Best Practices

- Use semantic color tokens (`bg-primary`, not `bg-blue-500`)
- Create wrapper components for domain-specific logic in `components/common/`
- Lazy load heavy components (Dialog, Sheet, Calendar, Chart)
- See `@design-tokens-enforcement` rule for complete token usage rules and drift prevention

### Documentation

- See `design-systems/SHADCN-DESIGN-SYSTEM.md` for design system guide (audited for accuracy)
