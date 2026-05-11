# Agent Instructions

## Stack

- Electron 42, React 19, TypeScript 6.0, Vite 8
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

- All IPC calls validated in `src/main/ipc/handlers.ts`
- Follow patterns in existing components

## Canonical Examples

- Main process: `src/main/main.ts`
- Window management: `src/main/windows.ts`
- Component pattern: `src/renderer/components/CommandPalette.tsx`
- IPC handlers: `src/main/ipc/handlers.ts`
- Custom hook: `src/renderer/hooks/useKeyboard.ts`

## Web & MCP Tools

- Use WebSearch for current info (2025-2026)
- Use WebFetch for documentation URLs
- Use Context7 MCP for library APIs
- Use browser for frontend testing

## Karpathy Principles

### 12 Core Operating Principles (from Andrej Karpathy, 2026)

1. **Sync in macro actions** - Think in features, not lines. Delegate whole features, review system-level.
2. **Skill issue first** - When agents fail, fix instructions/context before fixing code.
3. **Remove yourself as bottleneck** - Autonomous loops > interactive sessions.
4. **Muscle memory for orchestration** - Parallel agents, batch review rhythm.
5. **Instructions as tunable code** - SKILL.md files are code you iterate on.
6. **Replace apps with agent API glue** - Natural language over manual UIs.
7. **Persistent looping setups** - Run overnight, keep what works.
8. **Jagged model improvements** - Know agent blind spots, design around them.
9. **Context engineering over implementation** - Context quality dominates output.
10. **Simplicity bias** - "All else equal, simpler is better." No speculative code.
11. **Bounded autonomy** - Maximum freedom within tight constraints.
12. **Instruction-first development** - Write intent before opening editor.

### Skill Navigation


| Situation | Use This Skill |
| ----------------------------------------- | ------------------------------------------------ |
| Agent produced wrong output | `skill-issue-diagnosis` |
| **Executing approved plan (DEFAULT)** | `plan-executor-orchestrator` |
| Sequential subagent handoff & verification | `agent-handoff-verification` (rule) |
| Electron main process / architecture | `electron-core` |
| Electron + React integration | `electron-react-core` |
| IPC patterns (main <-> renderer) | `electron-react-ipc` |
| Security best practices | `electron-react-security` |
| Performance optimization | `electron-react-performance` |
| Component design patterns | `electron-react-components` |
| Library API research | `context7-integration` |
| Browser UI testing | `browser-use-testing` |
| Electron-vite build config | `electron-react-build` |
| React 19 state patterns | `electron-react-state` |
| Parallel Context7 research | `context7-parallel-research` |
| LangGraph StateGraph / research agent | `langgraph-agent-patterns` |
| MCP server integration (tool calling) | `mcp-server-integration` |
| Structured LLM output to React components | `generative-ui-components` |
| Cost tracking, source citations, trust | `source-transparency` |
| Electron data persistence (SQLite, better-sqlite3) | `electron-data` |
| Electron performance profiling | `electron-performance` |
| TypeScript type patterns | `typescript-core` |
| TypeScript performance optimization | `typescript-performance` |
| TypeScript security patterns | `typescript-security` |
| TypeScript UI patterns | `typescript-ui` |
| Session data analysis (SQLite narratives) | `session-analytics` |
| Raw SQLite patterns (hooks state) | `sqlite-patterns` |
| Windows-specific hook development | `cursor-hooks-windows-dev` |


### Simplicity Rules (Enforced)

- Maximum 50 lines per function; extract helpers beyond that
- No error handling for impossible scenarios
- No "flexibility" or "configurability" not requested
- No abstractions for single-use code
- Every changed line must trace to the user's request

### Bounded Autonomy Defaults


| Constraint      | Default                 |
| --------------- | ----------------------- |
| Scope           | 1-3 files max per agent |
| Time budget     | 300s per experiment     |
| Metric          | One unambiguous metric  |
| Rollback        | Git reset on failure    |
| Max experiments | 100 (standard)          |


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

- ✅ ALWAYS use design tokens (see Token Usage Rules above)
- ✅ Use semantic color tokens (`bg-primary`, not `bg-blue-500`)
- ✅ Create wrapper components for domain-specific logic in `components/common/`
- ✅ Preserve all ARIA attributes from Radix
- ✅ Lazy load heavy components (Dialog, Sheet, Calendar, Chart)
- ❌ NEVER use arbitrary values (e.g., `h-[44px]`, `rounded-[10px]`)
- ❌ NEVER hardcode OKLCH colors in components
- ❌ Don't modify base components directly (use wrappers)
- ❌ Don't put business logic in `components/ui/`
- ❌ Don't remove accessibility attributes

### Documentation

- See `design-systems/SHADCN-DESIGN-SYSTEM.md` for design system guide (audited for accuracy)

## Auto-Update Rule

This file is automatically maintained by Cursor subagents. Before updating, subagents MUST reference `@AGENT-INSTRUCTION-BEST-PRACTICES.md` to ensure minimal, relevant context only.