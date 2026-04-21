# Web Tools Integration - Quick Reference

Comprehensive system for enhanced WebSearch, WebFetch, Context7-MCP, and browser tools usage in plan mode and agent mode.

## Quick Start

### Plan Mode (Before Implementation)
1. User says "plan", "design", or "how to implement"
2. Activate: `@plan-mode-enhancement` rule
3. Skills auto-trigger: `web-tools-plan-research`
4. Research: Context7 + WebSearch + WebFetch (parallel)
5. Create plan with citations from 2025-2026 sources

### Agent Mode (After Plan Approval)
1. User approves plan ("proceed", "build it")
2. Activate: `@agent-handoff-verification` rule
3. Skills auto-trigger: `plan-to-agent-handoff`, `web-tools-agent-verification`
4. Execute with verification after each step
5. Complete with summary and source citations

## Rules Overview

### Always Active
**`.cursor/rules/general.mdc`** (`alwaysApply: true`)
- Core web tool priority order
- Parallel execution principles
- Security awareness (ContextCrush, 25.1% vulnerability rate)
- Verification requirements
- Fallback hierarchy

### Auto-Attached (File Globs)
**`.cursor/rules/web-tools-research.mdc`** (`.ts`, `.tsx`, `.js`, `.jsx`)
- Triggers when modifying code files
- Version-specific verification
- Best practices research (2025-2026 only)
- Implementation checklist

### Manual Trigger
**`.cursor/rules/plan-mode-enhancement.mdc`** (`@plan-mode-enhancement`)
- Use when: User requests plan/design
- Checklist: Research, citations, breaking changes
- Output: Implementation plan with sources

**`.cursor/rules/agent-handoff-verification.mdc`** (`@agent-handoff-verification`)
- Use when: User approves plan, says "proceed"
- Checklist: Git checkpoint, verification commands
- Output: Completion summary with citations

## Skills Overview

### Research & Planning

**`web-tools-plan-research`** (NEW)
- **Trigger**: "plan", "design", "how to implement"
- **Workflow**: Identify libs → Parallel research → Synthesize → Create plan
- **Success**: 2+ cited sources from 2025-2026

**`context7-parallel-research`** (NEW)
- **Trigger**: Library + version mentioned
- **Workflow**: Context7 query → Parallel WebSearch → Cross-reference
- **Security**: ContextCrush awareness, triple-verify critical code

### Verification & Execution

**`web-tools-agent-verification`** (NEW)
- **Trigger**: "verify", "check", "before commit", plan approval
- **Workflow**: Identify libs → Search breaking changes → Run commands → Report
- **Success**: All checks pass, APIs verified

**`plan-to-agent-handoff`** (NEW)
- **Trigger**: User approves plan
- **Workflow**: Parse plan → Git checkpoint → Execute with verification → Complete
- **Success**: Smooth transition, verified implementation

### Fallback & Reliability

**`web-failure-handling`** (NEW)
- **Trigger**: Any web tool fails (timeout, blocked, empty)
- **Workflow**: Detect failure → Execute fallback → Document → Continue
- **Hierarchy**: Context7 → WebSearch → WebFetch → Browser → User

### Updated Skills

**`web-tools-decision-tree`** (UPDATED)
- Added: Plan mode research, agent verification patterns
- Added: Security-critical code pattern
- Updated: Auto-invoke triggers for new workflows

**`web-search-research`** (UPDATED)
- Added: Plan mode and verification parallel patterns
- Added: Security research enhancement
- Updated: Triggers for new rules integration

**`context7-integration`** (UPDATED)
- Added: ContextCrush security warning (Feb 2026)
- Added: Parallel execution patterns (4 new patterns)
- Updated: Cross-reference requirement for critical code

## Tool Priority Order

1. **Context7 MCP**: Version-specific library APIs (check package.json)
2. **WebSearch**: Best practices, current info (2025-2026 only)
3. **WebFetch**: Known documentation URLs (fastest for specific pages)
4. **Browser-use MCP**: UI testing, fallback when blocked

## Parallel Execution Patterns

### Pattern 1: Library Research
```
User: "React 19 optimization"
Parallel:
  - Context7: React 19 APIs
  - WebSearch: "React 19 optimization 2026"
  - WebFetch: react.dev/reference
```

### Pattern 2: Plan Mode Research
```
User: "Plan: Add authentication"
Parallel:
  - Context7: Electron 41 IPC, jsonwebtoken v9
  - WebSearch: "Electron auth 2026", "JWT OWASP"
  - WebFetch: electronjs.org, jwt.io, OWASP
```

### Pattern 3: Security Verification
```
User: "Implement JWT auth"
Parallel:
  - Context7: jsonwebtoken v9 API
  - Official: jwt.io, GitHub
  - Security: OWASP guidelines
```

### Pattern 4: Agent Verification
```
After implementation:
Parallel:
  - WebSearch: "[lib] breaking changes 2026"
  - Commands: typecheck, lint, build
```

## Fallback Hierarchy

```
Context7 fails → WebSearch
WebSearch fails → WebFetch (known URLs)
WebFetch blocked → Browser-use MCP
Browser blocked → Ask user assistance
```

**Document all failures** with reasons for future reference.

## Security Awareness

### ContextCrush Vulnerability (Feb 2026)
Context7 had vulnerability where community contributions could inject malicious docs.

**Mitigation**:
- ✅ Cross-reference security-critical code
- ✅ Verify against official docs
- ✅ Check OWASP guidelines
- ✅ Review GitHub examples

### Vulnerability Statistics
- **25.1%** of AI-generated code has vulnerabilities (AppSec Santa Mar 2026)
- **33.1%** are injection weaknesses
- **Triple verification** required for: auth, encryption, user input

## Success Metrics

### Plan Mode
✅ Plans include 2+ cited sources from 2025-2026
✅ All library APIs verified against version-specific docs
✅ Breaking changes documented
✅ Security considerations noted

### Agent Handoff
✅ Verification commands run automatically
✅ Web verification before commit
✅ Git checkpoint created (complex features)
✅ Completion summary with citations

### Web Tool Usage
✅ Context7 queried first for versioned libraries
✅ WebSearch includes year filters (2025, 2026)
✅ Parallel execution when beneficial
✅ Fallback hierarchy followed on failures

## Example Workflows

### Example 1: Plan Mode with Web Research

**User**: "Create a plan to add authentication"

**Agent**:
1. Activate `@plan-mode-enhancement`
2. Trigger `web-tools-plan-research` skill
3. Parallel research:
   - Context7: Electron 41 IPC security, jsonwebtoken v9 API
   - WebSearch: "Electron authentication 2026", "JWT OWASP"
   - WebFetch: electronjs.org/docs/security, jwt.io, OWASP
4. Create plan with citations:
   ```markdown
   ## Research Summary
   - JWT with httpOnly cookies (jwt.io, 2026)
   - contextIsolation required (electronjs.org, Mar 2026)
   - OWASP guidelines applied (owasp.org, 2025)
   
   ## Implementation
   [Detailed steps with verified APIs]
   ```

### Example 2: Agent Mode Execution

**User**: "Plan looks good, proceed!"

**Agent**:
1. Activate `@agent-handoff-verification`
2. Trigger `plan-to-agent-handoff` skill
3. Create git checkpoint: `agent-handoff/apr3-auth`
4. Execute step 1 with verification:
   - Implement JWT generation
   - Run: `npm run typecheck` ✅, `npm run lint` ✅
   - Commit with citations
5. Continue with remaining steps
6. Final verification: All commands pass
7. Completion summary:
   ```markdown
   ## Implementation Complete ✅
   
   **3 files changed, 177 insertions**
   **All checks pass**: typecheck, lint, build
   **Sources**: jwt.io, OWASP, Electron docs
   ```

### Example 3: Pre-Commit Verification

**User**: "Verify before commit"

**Agent**:
1. Activate `web-tools-agent-verification`
2. Analyze changed files
3. WebSearch: "[library] breaking changes 2026"
4. Run verification commands:
   ```bash
   npm run typecheck  # ✅ 0 errors
   npm run lint       # ✅ 0 errors
   npm run build      # ✅ success
   ```
5. Report:
   ```markdown
   ## Verification Complete ✅
   
   **All checks passed**
   **No breaking changes detected**
   **Ready to commit**: Yes
   ```

### Example 4: Tool Failure Handling

**User**: "How to use @internal/private-lib v2?"

**Agent**:
1. Context7: ❌ Not in registry (private lib)
2. WebSearch: ❌ No public results
3. WebFetch: ❌ No public URL
4. Fallback: Ask user assistance
   ```
   "This appears to be a private library. I can't access it via
   Context7 or web search.
   
   Options:
   1. Share internal documentation URL
   2. Share API documentation file
   3. Describe the library's purpose"
   ```

## Troubleshooting

### Common Issues

**Issue**: Plans without citations
- **Cause**: Web tools not triggered
- **Fix**: Manually activate `@plan-mode-enhancement`

**Issue**: Verification skipped
- **Cause**: Rule not auto-triggering
- **Fix**: Manually activate `@agent-handoff-verification`

**Issue**: Context7 returns empty
- **Cause**: Library not in registry
- **Fix**: Fall back to WebSearch + WebFetch (automatic)

**Issue**: WebFetch blocked
- **Cause**: Captcha or access denied
- **Fix**: Browser-use MCP or ask user (automatic fallback)

### Manual Activation

If rules don't auto-trigger:

```
@plan-mode-enhancement Create a plan to...
@agent-handoff-verification Verify this implementation...
@web-tools-research Check best practices for...
```

## File Structure

```
.cursor/rules/
├── general.mdc                          # Always active (core principles)
├── web-tools-research.mdc               # Auto-attached to code files
├── plan-mode-enhancement.mdc            # Manual: @plan-mode-enhancement
├── agent-handoff-verification.mdc       # Manual: @agent-handoff-verification
└── README-WEB-TOOLS.md                  # This file

.cursor/skills/
├── web-tools-plan-research/             # NEW: Plan mode research
├── web-tools-agent-verification/        # NEW: Pre-commit checks
├── context7-parallel-research/          # NEW: Parallel + security
├── web-failure-handling/                # NEW: Fallback strategies
├── plan-to-agent-handoff/               # NEW: Execution transition
├── web-tools-decision-tree/             # UPDATED: New patterns
├── web-search-research/                 # UPDATED: Plan/verify patterns
└── context7-integration/                # UPDATED: Security awareness
```

## Best Practices

### Do's
✅ Use parallel execution when researching libraries
✅ Always cite sources with URLs and dates
✅ Verify security-critical code against 2+ sources
✅ Create git checkpoints for complex features
✅ Run verification commands after each step
✅ Document tool failures and fallbacks

### Don'ts
❌ Use pre-2024 sources without disclaimer
❌ Skip verification before commit
❌ Trust single source for security code
❌ Ignore tool failures (document and fallback)
❌ Commit without running typecheck, lint, build

## References

- **AGENT-INSTRUCTION-BEST-PRACTICES.md**: Evidence-based instruction design
- **general.mdc**: Core principles and security awareness
- **web-tools-decision-tree**: Detailed tool selection logic
- **context7-parallel-research**: Security verification workflows

## Updates & Maintenance

This system is designed following 2025-2026 best practices:
- **Minimalism**: Rules only include essential requirements
- **Tiered injection**: 60-80% context reduction vs monolithic files
- **Parallel execution**: 64% latency reduction
- **Security awareness**: 25.1% vulnerability rate in AI code

**Review quarterly** for:
- New web tools or MCP servers
- Updated best practices (2027+)
- Security vulnerability patterns
- Performance improvements
