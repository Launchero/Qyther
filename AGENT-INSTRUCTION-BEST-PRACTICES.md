# Evidence-Based Guide to Instructing Coding Agents in Cursor

> **Compiled**: May 2026  
> **Based on**: arXiv and industry sources (Jan–May 2026), plus production case studies (Stripe, Anthropic partners, SaaS)  
> **Version**: 3.0 — Condensed edition: same evidence-backed patterns, less repetition; full templates live in the appendix

This guide translates research on AI coding agent instruction into practical patterns for Cursor. v3.0 merges duplicate sections, removes long illustrative code, and keeps citations where they change behavior.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Research Findings](#research-findings)
3. [Core Principles](#core-principles)
4. [AGENTS.md](#agentsmd)
5. [Cursor Rules](#cursor-rules)
6. [Cursor Commands](#cursor-commands)
7. [Cursor Skills](#cursor-skills)
8. [Cursor Hooks](#cursor-hooks)
9. [Subagents & Parallel Workflows](#subagents--parallel-workflows)
10. [Prompt Engineering](#prompt-engineering)
11. [Tool Use Optimization](#tool-use-optimization)
12. [Self-Correction and Verification](#self-correction-and-verification)
13. [Structured Reasoning Patterns](#structured-reasoning-patterns)
14. [Context Management](#context-management)
15. [Production Deployments & Case Studies](#production-deployments--case-studies)
16. [Emerging Trends & Future Directions](#emerging-trends--future-directions)
17. [Hallucination Prevention & Factuality](#hallucination-prevention--factuality)
18. [Implementation Roadmap](#implementation-roadmap)
19. [Appendix: Templates](#appendix-templates)
20. [References](#references)
21. [Changelog](#changelog)

---

## Executive Summary

### Key Research Findings (2026)

| Study | Finding | Implication |
|-------|---------|-------------|
| Lulla et al. (Jan 2026) | AGENTS.md → 28.64% faster runtime, 16.58% less tokens | Use repository instructions |
| Gloaguen et al. (Feb 2026) | Over-specified context → 20%+ cost increase, lower success | Keep instructions minimal |
| Cursor Team (2025-26) | Plan Mode + specific prompts → dramatically better output | Plan first, be specific |
| **Stanford/UC Berkeley (2025)** | **"Lost in the Middle" phenomenon in LLM attention** | **Position critical info at beginning/end** |
| **AppSec Santa (Mar 2026)** | **25.1% of AI-generated code has vulnerabilities** | **Security review mandatory** |
| **McKinsey (2026)** | **Developers 2x faster with AI, but quality tradeoffs** | **Measure velocity, not just speed** |
| **OctoBench (Jan 2026)** | **No model >20% on strict constraint tasks** | **Instruction following unsolved** |
| **Zylos Research (Mar 2026)** | **Parallel execution → 64% latency reduction** | **Implement tool parallelization** |
| **IBM Research (Sep 2025)** | **ToolRM → 25% improvement in Best-of-n** | **Use domain-specific reward models** |
| **ReflexiCoder (Mar 2026)** | **94.51% HumanEval, 40% less compute** | **Internalize self-correction in weights** |
| **Multi-Agent Study (2026)** | **72% enterprise adoption, $52B market** | **Multi-agent is production-ready** |
| **Zylos Research (Jan 2026)** | **Multi-layered strategies achieve 96% hallucination reduction** | **Implement layered verification** |
| **Meta AI/ETH Zürich (ACL 2024)** | **Chain-of-Verification reduces hallucinations across all tasks** | **Use systematic verification workflows** |
| **arXiv:2601.19106** | **AST-based detection: 100% precision, 87.6% recall, 77% auto-correction** | **Use deterministic validation for code** |

### The Paradox

**More instructions ≠ Better results**

ETH Zurich found that unnecessary requirements from context files:
- ❌ Reduce task success rates
- ❌ Increase inference costs by 20-159%
- ❌ Make tasks harder for agents

**Solution**: Minimal, tiered, task-relevant instructions only.

### The Opportunity

**Multi-agent systems are mainstream**:
- 📈 Market projected to reach **$8.5B in 2026**, $35B by 2030
- 🏢 **57% of companies** deploy AI agents in production
- 🎯 **40% of enterprise apps** will feature task-specific agents by end-2026 (up from 5% in 2025)

**Enterprise results** (Stripe, incident.io, Series B SaaS):
- ⚡ **10,000-line migration in 4 days** vs 10 engineering weeks
- 💰 **$253k annual savings** through automation
- 📊 **Code review: 2-4 hours → 15-30 minutes per PR**
- 🧪 **Test coverage: 40-50% → 85-95%**
- 🐛 **Production bugs: 15-20/month → 4-6/month**

---

## Research Findings

### Study 1: AGENTS.md Impact (Lulla et al., Jan 2026)
**10 repositories, 124 PRs**: AGENTS.md → **28.64% faster runtime**, **16.58% fewer tokens**, comparable task completion.

### Study 2: Context Effectiveness (Gloaguen et al., Feb 2026)
**SWE-bench + real issues**: Unnecessary requirements → **decreased success rates**, **20-159% cost increase**. Human-written files should describe **only minimal requirements**.

### Study 3: Configuration Patterns (Galster et al., Feb 2026)
**2,923 repos**: Tiered injection → **60-80% context reduction** vs monolithic files while maintaining accuracy.

### Study 4: Instruction Following (OctoBench, Jan 2026)
**217 tasks, 8 models**: No model achieves **>20% success** with strict constraints. Memory constraints: 65-70% compliance; Skill.md constraints: 15-25% compliance. **Iterative refinement** (4 rounds): 63% → 83% compliance.

### Study 5: Security Vulnerabilities (AppSec Santa, Mar 2026)
**534 samples, 6 LLMs**: **25.1% of AI-generated code has vulnerabilities**. GPT-5.2: 19.1% (best); Claude Opus 4.6: 29.2% (worst). Injection weaknesses: 33.1% of findings.

### Study 6: Task Performance (Pinna et al., Feb 2026)
**7,156 PRs, 9 categories**: Documentation: 82.1% acceptance; Features: 66.1%. Agent selection should be task-specific.

---

## Core Principles

### Principle 1: Minimalism

**Rule**: If it's not essential, don't include it.

**Bad**:
```markdown
# All Coding Standards

## Section 1: Variable Naming
- Use camelCase for variables
- Use PascalCase for classes
- Use UPPER_CASE for constants
- ... 50 more lines ...
```

**Good**:
```markdown
# Essential Patterns
- See `src/auth.ts` for authentication implementation
- See `components/Button.tsx` for component structure
- Run `npm run lint` before committing
```

**Key Insight**: Human-written context files should focus on **minimal requirements only**, not comprehensive documentation.

---

### Principle 2: Tiered Injection

**Rule**: Provide only task-relevant instructions, not everything.

**Implementation**:
```
.cursor/rules/
├── general.md      # Always loaded (5-10 lines)
├── testing.md      # Loaded for test tasks
├── api.md         # Loaded for API work
└── styling.md     # Loaded for UI work
```

**Benefit**: 60-80% context reduction while maintaining accuracy.

**Why It Works**: Avoids "Lost in the Middle" phenomenon where LLMs poorly attend to information at positions 40-60% of context.

---

### Principle 3: References Over Content

**Rule**: Point to examples, don't copy them.

**Bad**:
```markdown
# Authentication Rules
1. Always validate JWT token
2. Check expiration timestamp
3. Verify signature with RSA256
4. Extract user ID from claims
5. ... 200 lines of code example ...
```

**Good**:
```markdown
# Authentication
- Follow pattern in `@src/auth/validateToken.ts`
- Use JWT validation from `@src/lib/jwt.ts`
```

**Why Better**: Agent has powerful search tools (grep, semantic search). Including irrelevant files confuses agent about priorities.

---

### Principle 4: Positive Framing

**Rule**: Use "do X" not "don't Y".

**Bad**:
```markdown
- Don't use var, use let or const
- Don't use CommonJS, use ES modules
- Don't forget to run tests
- Don't commit without linting
```

**Good**:
```markdown
- Use `let` or `const` for variable declarations
- Use ES modules (import/export syntax)
- Run tests before committing
- Run linter after substantive changes
```

---

### Principle 5: Verifiable Goals

**Rule**: Give agents clear success signals.

**Bad**:
```
"Make the authentication better"
```

**Good**:
```
"Add JWT token validation to /api/login endpoint.
Tests must pass: `npm run test -- auth.test.ts`
Linter must pass: `npm run lint`"
```

**Why Better**:
- ✅ Measurable metrics
- ✅ Specific commands to run
- ✅ Clear success criteria
- ✅ Agent can self-evaluate

---

### Principle 6: Context Engineering

**Rule**: Clean, well-structured context on weaker model outperforms cluttered context on stronger model.

**Bad** (Context Dumping):
```
"Here's everything about our project:
[50 files attached, 10,000 lines of code]

Now add authentication."
```

**Good** (Context Engineering):
```
"Add JWT authentication to checkout flow.

Relevant context:
- Current auth pattern: @src/auth/validateToken.ts
- Checkout endpoint: @app/api/checkout/route.ts
- User model: @src/models/User.ts

Requirements:
- Validate JWT on all checkout requests
- Return 401 if invalid/expired
- Extract userId from token for order creation

Tests: Run `npm run test -- checkout.test.ts`"
```

**Why Better**:
- ✅ Minimal, relevant files only
- ✅ Clear requirements
- ✅ Success criteria defined
- ✅ Agent can find more context if needed

---

### Principle 7: Security-First Mindset

**Rule**: Always review AI-generated code for security vulnerabilities.

**AppSec Santa (Mar 2026)**: **25.1% of AI-generated code has confirmed vulnerabilities** (534 samples, 6 LLMs). GPT-5.2: 19.1% (best); Claude Opus 4.6: 29.2% (worst). Injection weaknesses: 33.1% of findings. 74 CVEs attributed to AI-generated code.

**Essential Security Checklist**:
```markdown
### Input Validation
- [ ] All user input validated (Zod, Yup, Joi)
- [ ] SQL/NoSQL injection prevented (parameterized queries)
- [ ] XSS prevented (escaping, sanitization, CSP)

### Authentication & Authorization
- [ ] Auth verified on protected routes
- [ ] JWT tokens validated (signature, expiration, issuer)
- [ ] Session management secure (HttpOnly, Secure, SameSite)

### Data Protection
- [ ] No hardcoded credentials or secrets
- [ ] Sensitive data encrypted at rest and in transit
- [ ] Error handling doesn't leak sensitive info

### SSRF Prevention
- [ ] External URL requests validated against allowlist
- [ ] Internal network access blocked
```

**Model Selection for Security-Critical Tasks**: Use GPT-5.2 (19.1% vulnerability rate) + mandatory human security review.

---

## AGENTS.md

Repository-level instructions providing minimal essential context for AI coding agents.

**Location**: Root of your repository (`your-repo/AGENTS.md`)

### What to Include

✅ **DO Include**:
- Tech stack (1-2 lines)
- Essential commands (build, test, lint)
- Critical constraints (truly necessary only)
- Pointers to canonical examples

❌ **DON'T Include**:
- Complete style guides
- Every possible command
- Edge case handling
- Architecture documentation
- API documentation

### Template

```markdown
# Project Context

## Stack
- Runtime: Node.js 20, TypeScript 5.3
- Framework: Next.js 14 (App Router)
- Database: PostgreSQL with Prisma ORM

## Essential Commands
```bash
npm run build      # Build before committing
npm run test       # Run full test suite
npm run test:unit  # Run unit tests only
npm run lint       # Run ESLint
npm run typecheck  # Run TypeScript checker
```

## Critical Constraints
- All API routes must be in `app/api/`
- Database migrations required for schema changes
- All user input must be validated with Zod

## Canonical Examples
- Authentication: `@src/auth/validateToken.ts`
- API route pattern: `@app/api/users/route.ts`
- Component structure: `@components/Button.tsx`
- Test pattern: `@__tests__/auth.test.ts`
```

**Impact**: With AGENTS.md, agents complete tasks 28.64% faster with 16.58% fewer tokens by immediately finding relevant files and following existing patterns instead of asking clarifying questions.

---

## Cursor Rules

Static context applied to every conversation, shaping how the agent works with your code.

**Location**: `.cursor/rules/` (general.md, testing.md, api.md, styling.md)

### Rule Types

#### 1. General Rules (Always Loaded)

**File**: `.cursor/rules/general.md`

```markdown
# General Rules

## Commands
- `npm run build`: Build before committing
- `npm run typecheck`: Run TypeScript checker after substantive changes
- `npm run lint`: Run ESLint after code changes
- `npm run test`: Prefer single test files for speed

## Code Style
- Use ES modules (import/export), not CommonJS (require)
- Destructure imports: `import { foo } from 'bar'`
- Use TypeScript strict mode, no `any` types

## Workflow
- API routes go in `app/api/` following existing patterns
- Database changes require Prisma migration
- All user input validated with Zod schemas

## Canonical Examples
- Component pattern: `@components/Button.tsx`
- API route pattern: `@app/api/users/route.ts`
- Test pattern: `@__tests__/auth.test.ts`
```

**When to Add**: When you notice the agent making the same mistake 2-3 times.

---

#### 2. Task-Specific Rules (Loaded On-Demand)

**File**: `.cursor/rules/testing.md`

```markdown
# Testing Rules

## When Writing Tests
- Use Vitest for unit tests, Playwright for E2E
- Place tests in `__tests__/` directory
- Name test files: `[feature].test.ts`
- Follow AAA pattern: Arrange, Act, Assert

## Test Requirements
- Minimum 80% coverage for new code
- Mock external APIs with MSW
- Include error boundary tests
- Test edge cases explicitly

## Running Tests
```bash
npm run test              # Full suite
npm run test:unit         # Unit tests only
npm run test:coverage     # With coverage report
npm run test -- path/to   # Specific file
```

## Examples
- Unit test pattern: `@__tests__/auth.test.ts`
- Integration test: `@__tests__/api/users.test.ts`
- E2E test: `@e2e/checkout.spec.ts`
```

**When Loaded**: Agent decides it's relevant for test-writing tasks.

---

**File**: `.cursor/rules/api.md`

```markdown
# API Development Rules

## Structure
- All routes in `app/api/[resource]/route.ts`
- Use Next.js App Router conventions
- Export GET, POST, PUT, DELETE handlers

## Authentication
- Validate JWT with `@src/auth/validateToken.ts`
- Extract user from token claims
- Return 401 for unauthorized, 403 for forbidden

## Validation
- Use Zod schemas for all input validation
- Return 400 with error details for invalid input
- Sanitize user input before database queries

## Error Handling
```typescript
try {
  // business logic
} catch (error) {
  logger.error('API error', { error, userId });
  return NextResponse.json(
    { error: 'Internal server error' },
    { status: 500 }
  );
}
```

## Examples
- REST API pattern: `@app/api/users/route.ts`
- Error handling: `@app/api/orders/route.ts`
- Validation pattern: `@src/validators/orderSchema.ts`
```

---

**File**: `.cursor/rules/styling.md`

```markdown
# Styling Rules

## CSS Framework
- Use Tailwind CSS for all styling
- Follow utility-first approach
- Use `clsx` for conditional classes

## Component Structure
```tsx
interface Props {
  variant?: 'primary' | 'secondary';
  children: React.ReactNode;
}

export function Button({ variant = 'primary', children }: Props) {
  return (
    <button className={clsx(
      'px-4 py-2 rounded font-medium',
      variant === 'primary' ? 'bg-blue-600 text-white' : 'bg-gray-200'
    )}>
      {children}
    </button>
  );
}
```

## Responsive Design
- Mobile-first approach
- Use `md:`, `lg:`, `xl:` breakpoints
- Test on multiple screen sizes

## Examples
- Button component: `@components/Button.tsx`
- Form styling: `@components/forms/TextInput.tsx`
- Layout pattern: `@components/Layout.tsx`
```

---

**Workflow Evolution**: When agents repeat mistakes 2-3 times, add minimal rules to `.cursor/rules/general.md` (e.g., "Run `npm run lint` after substantive code changes"). Test in next conversation and refine if needed.

**Team Consistency**: Check `.cursor/rules/` into git so entire team benefits from accumulated knowledge.

---

## Cursor Commands

Reusable workflow templates triggered with `/` in agent input.

**Structure**:
```markdown
# /command-name [parameters]

[Description]

## Steps
1. [First step]
2. [Second step]

## Output
[Expected output]
```

**Example 1: Pull Request** (`.cursor/commands/pr.md`):
```markdown
# /pr

Create a pull request for current changes.

## Steps
1. Review staged changes: `git diff --staged`
2. Commit: `git add . && git commit -m "message"`
3. Push: `git push`
4. Create PR: `gh pr create --title "title" --body "## Summary\n\n- Change 1\n\n## Testing\n\n- [ ] Tests pass"`
5. Return PR URL
```

**Example 2: Issue Fixing** (`.cursor/commands/fix-issue.md`):
```markdown
# /fix-issue [issue-number]

Fetch issue, implement fix, open PR.

## Steps
1. Fetch issue: `gh issue view [number] --json title,body,comments`
2. Search codebase for relevant files
3. Implement fix following existing patterns
4. Run tests: `npm run test -- related.test.ts`
5. Commit: `git commit -m "Fix: [title] (#[number])"`
6. Push and create PR
```

**Example 3: Code Review** (`.cursor/commands/review.md`):
```markdown
# /review

Run comprehensive code review.

## Steps
1. Identify changed files: `git diff --name-only`
2. Check each file for bugs, security issues, error handling
3. Run automated checks: lint, typecheck, tests
4. Generate report with ✅ Good, ⚠️ Concerns, ❌ Blockers
```

**Example 4: TDD** (`.cursor/commands/tdd.md`):
```markdown
# /tdd [feature]

Implement feature using Test-Driven Development.

## Steps
1. Write tests first (DO NOT implement)
2. Confirm ALL tests fail
3. Implement minimal code to pass
4. Iterate until all pass
5. Refactor
6. Run full test suite
```

**Daily Workflow**: `/fix-issue 456` → `/review` → `/pr` (saves 30-45 min/day)

---

## Cursor Skills

Dynamic capabilities loaded on-demand when relevant.

**Structure**:
```markdown
# SKILL.md: [Name]

## Description
[What it does]

## When to Use
[Trigger conditions]

## Workflows
[Step-by-step]
```

**Example 1: TDD Skill**:
```markdown
# SKILL.md: Test-Driven Development

## When to Use
- User asks to "add tests" or mentions TDD
- New feature implementation

## Workflow
1. Clarify requirements (edge cases, error conditions)
2. Write tests first (Red Phase) - confirm ALL fail
3. Implement minimal code to pass (Green Phase)
4. Refactor while maintaining coverage
5. Verify: full test suite, lint, typecheck
```

**Example 2: Long-Running Loop**:
```markdown
# SKILL.md: Agent Loop

## When to Use
- Complex multi-step tasks
- Tasks requiring iteration (fix tests, match design)
- Verifiable goals

## Setup
1. Create hook: `.cursor/hooks/grind.ts`
2. Configure in `.cursor/hooks.json`
3. Use scratchpad for progress tracking

## Usage
/grind [task] - Works until done or max 5 iterations
```

**Example 3: Domain-Specific (E-commerce)**:
```markdown
# SKILL.md: E-commerce

## When to Use
- Product catalog, cart, checkout features
- Payment integration

## Key Patterns
- Products with variants (size, color)
- Inventory: quantity - reserved = available
- Order status: pending → paid → fulfilling → shipped
```

**Skills vs Rules**: Rules for always-on context; Skills for domain-specific, conditional workflows.

---

## Cursor Hooks

Scripts running before/after agent actions for custom workflows and long-running loops.

**Location**: `.cursor/hooks.json` (config) and `.cursor/hooks/` (scripts)

---

### Hook Types

#### 1. Stop Hook (After Agent Completes)

**Use Case**: Long-running agent loops, notifications, validation.

**File**: `.cursor/hooks.json`

```json
{
  "version": 1,
  "hooks": {
    "stop": [
      {
        "command": "bun run .cursor/hooks/grind.ts"
      }
    ]
  }
}
```

**Input Schema**:
```typescript
interface StopHookInput {
  conversation_id: string;
  status: "completed" | "aborted" | "error";
  loop_count: number;
}
```

**Output Schema**:
```typescript
interface StopHookOutput {
  followup_message?: string;  // Continue agent with this message
}
```

---

## Subagents & Parallel Workflows

### Research Context

**Market Explosion**:
- 📈 Multi-agent AI systems market: **$8.5B in 2026** → $35B by 2030
- 🏢 **57% of companies** deploy AI agents in production
- 🎯 **40% of enterprise apps** will feature task-specific agents by end-2026 (up from 5% in 2025)

**Enterprise Results**:
- 💰 Series B SaaS: **$253k annual savings** through automation
- ⚡ incident.io: **4-5 Claude agents** running simultaneously
- 🏗️ Stripe: **1,370 engineers** using Claude Code company-wide

---

### Pattern 1: Native Worktrees

**How It Works**:
- Cursor auto-creates isolated git worktrees
- Each agent works in separate branch/files
- No interference between agents
- Merge changes when satisfied

**Setup**:
1. Select worktree option from agent dropdown
2. Agent creates worktree automatically
3. Work independently
4. Click "Apply" to merge changes

**Scenario**: Large Refactor

```
Task: Refactor authentication system

Agent 1 (worktree: auth-jwt):
- Migrate to JWT tokens
- Update login/logout flows

Agent 2 (worktree: auth-oauth):
- Add OAuth providers (Google, GitHub)
- Update user model

Agent 3 (worktree: auth-tests):
- Write comprehensive test suite
- Add E2E tests

After all complete:
- Review each worktree
- Apply changes one by one
- Resolve conflicts if any
```

**Time Savings**: 3x faster than sequential approach.

---

### Pattern 2: Multi-Model Comparison

**How It Works**:
- Select multiple models from dropdown
- Submit same prompt to all
- Compare results side-by-side
- Cursor suggests best solution

**Setup**:
1. Click model dropdown
2. Select 2-3 models (e.g., Claude 3.5, GPT-4, Cursor Fast)
3. Submit prompt
4. Review all outputs
5. Apply preferred solution

**Scenario**: Complex Algorithm

```
User: "Implement rate limiting middleware"

Model 1 (Claude 3.5):
- Token bucket algorithm
- Redis-backed storage
- Comprehensive error handling

Model 2 (GPT-4):
- Sliding window algorithm
- In-memory storage
- Simpler implementation

Model 3 (Cursor Fast):
- Fixed window approach
- Basic implementation
- Fastest response

Decision: Use Model 1 for production (most robust),
          Model 3 for development (fastest)
```

**Best For**:
- Hard problems with multiple valid approaches
- Comparing code quality
- Finding edge cases
- Creative tasks

---

### Pattern 3: Parallel Task Decomposition

**How It Works**:
- Break large task into subtasks
- Assign each subtask to different agent
- Run all agents in parallel
- Merge results

**Scenario**: Feature Development

```
Feature: Add user dashboard

Subtask 1: Backend API
- /api/dashboard/stats
- /api/dashboard/activity
- /api/dashboard/settings

Subtask 2: Frontend Components
- Dashboard layout
- Stats cards
- Activity feed
- Settings panel

Subtask 3: Integration
- Connect frontend to API
- Add loading states
- Error handling
- Caching

Subtask 4: Testing
- Unit tests for API
- Component tests
- Integration tests
- E2E tests

4 agents working simultaneously → 4x faster
```

**Coordination**:
```markdown
# Dashboard Task Coordination

## Dependencies
- Frontend needs API contracts first
- Integration needs both API and components
- Testing needs everything complete

## Timeline
T+0:   All agents start
T+10:  API agent finishes, shares contracts
T+20:  Frontend agent finishes
T+30:  Integration agent finishes
T+40:  Testing agent finishes
T+45:  All changes merged
```

---

### Pattern 4: Specialist Agents

**How It Works**:
- Each agent specializes in one area
- Route tasks to appropriate specialist
- Experts produce higher quality output

**Specialist Types**:

```
🏗️ Architecture Agent
- System design
- Database schema
- API design
- Technology choices

💻 Implementation Agent
- Writing code
- Following patterns
- Best practices
- Clean code

🧪 Testing Agent
- Test strategy
- Writing tests
- Coverage analysis
- Test automation

🔒 Security Agent
- Security review
- Vulnerability scanning
- Authentication/authorization
- Data protection

📝 Documentation Agent
- API docs
- README updates
- Code comments
- User guides
```

**Usage**:
```
/architect Design user authentication system
→ Creates architecture diagram, tech choices

/implement Build authentication system
→ Follows architecture, writes code

/test Add comprehensive tests
→ Unit, integration, E2E tests

/security Review for vulnerabilities
→ Security audit, fixes

/document Create documentation
→ API docs, README, guides
```

---

### Scenario: Bug Fix Sprint

**Problem**: Critical production bug, need fix ASAP.

**Parallel Approach**:

```
Agent 1 (Investigation):
- Reproduce bug
- Identify root cause
- Log analysis

Agent 2 (Fix Development):
- Based on Agent 1 findings
- Implement fix
- Test locally

Agent 3 (Regression Testing):
- Check related code
- Run full test suite
- Add regression tests

Agent 4 (Deployment Prep):
- Update changelog
- Prepare release notes
- Create deployment plan

Total time: 15 minutes vs 60 minutes sequential
```

---

### Pattern 5: Orchestrator-Specialist Architecture

**How It Works**:
- Central orchestrator decomposes tasks
- Delegates to domain-specialized agents
- Synthesizes results

**Specialist Types**:
```
🏗️ Architecture Agent
- System design
- Database schema
- API design
- Technology choices

💻 Implementation Agent
- Writing code
- Following patterns
- Best practices
- Clean code

🧪 Testing Agent
- Test strategy
- Writing tests
- Coverage analysis
- Test automation

🔒 Security Agent
- Security review
- Vulnerability scanning
- Authentication/authorization
- Data protection

📝 Documentation Agent
- API docs
- README updates
- Code comments
- User guides

🚀 DevOps Agent
- CI/CD pipelines
- Infrastructure as code
- Monitoring setup
- Deployment automation
```

**Usage**:
```
/orchestrator Build user authentication system

Orchestrator response:
"I'll coordinate the authentication system build:

1. Architecture Agent: Design auth system (JWT + OAuth)
2. Backend Agent: Implement API endpoints
3. Frontend Agent: Build login/signup components
4. Testing Agent: Write comprehensive tests
5. Security Agent: Review for vulnerabilities
6. DevOps Agent: Setup deployment pipeline

Timeline: 45 minutes (vs 3-4 hours sequential)"
```

**Enterprise Example** (Series B SaaS):
```
Domain-Specialized Agents:
- Frontend Agent: React/TypeScript components
- Backend Agent: Node.js/PostgreSQL APIs
- DevOps Agent: AWS/GCP infrastructure
- Testing Agent: Vitest/Playwright tests

Results (3 months):
- Code review: 2-4 hours → 15-30 minutes per PR
- Feature delivery: 2-3 weeks → 4-7 days
- Test coverage: 40-50% → 85-95%
- Production bugs: 15-20/month → 4-6/month
- Annual savings: $253k
```

---

### Pattern 6: Sequential Pipeline

**How It Works**:
```
Research Agent → Draft Agent → Review Agent → Fact-Check Agent → Deploy Agent
```

**Example**: Technical Documentation
```
1. Research Agent:
   - Gather API documentation
   - Collect code examples
   - Identify use cases

2. Draft Agent:
   - Write initial documentation
   - Add code snippets
   - Create examples

3. Review Agent:
   - Check for accuracy
   - Verify completeness
   - Ensure consistency

4. Fact-Check Agent:
   - Validate API signatures
   - Test code examples
   - Verify version compatibility

5. Deploy Agent:
   - Update documentation site
   - Generate changelog
   - Notify stakeholders
```

**Time Savings**: 4-5x faster than manual sequential process.

---

### Production Orchestration Patterns (2026)

**Market Context**: 72% of enterprise AI projects now use multi-agent architectures (up from 23% in 2024), with the multi-agent market projected to reach $52B by 2030.

#### Six Core Orchestration Patterns

Research from LangGraph, CrewAI, and Claude Agents SDK has converged on six production-ready patterns:

| Pattern | Best For | Pros | Cons |
|---------|----------|------|------|
| **Sequential** | Clear dependencies | Simple, predictable | Inflexible, slow |
| **Router** | Multiple task types | Efficient routing | Router bottleneck |
| **Hierarchical** | Complex decomposition | Strong control | Supervisor bottleneck |
| **Parallel** | Brainstorming, ensemble | Fastest execution | Aggregation complexity |
| **Event-Driven** | High scale systems | Excellent scaling | Debugging difficulty |
| **Orchestrator-Specialist** | Production workflows | Centralized control | Requires good orchestrator |

#### Pattern Selection Guide

```typescript
// Choose pattern based on task characteristics:
if (task.hasClearSequentialSteps) {
  use(SequentialPattern);
} else if (task.hasMultipleTypes) {
  use(RouterPattern);
} else if (task.requiresDecomposition) {
  use(HierarchicalPattern);
} else if (task.benefitsFromDiversity) {
  use(ParallelPattern);
} else if (system.needsHighScale) {
  use(EventDrivenPattern);
} else {
  use(OrchestratorSpecialistPattern); // Default for production
}
```

---

### Failure Analysis & Recovery

**Top Failure Types** (2026 Multi-Agent Study):

| Failure Type | Frequency | Description |
|--------------|-----------|-------------|
| **Coordination** | 37% | Agents conflict or deadlock |
| **Verification Gaps** | 21% | Missing quality checks |
| **Cascading Failures** | 18% | One failure propagates |
| **Hallucination Propagation** | 15% | Errors amplify across agents |
| **Resource Contention** | 9% | Agents compete for resources |

**Recovery Patterns**:
- **Bulkhead isolation**: Contain failures to single agent groups
- **Circuit breakers**: Prevent repeated failures (open after 5 failures)
- **Timeouts**: Prevent indefinite blocking (default 30s)
- **Centralized tool registry**: Observability, rate limiting, schema validation

---

### State Management & Communication

**Shared State vs Message-Based Communication**:

| Approach | Consistency | Debugging | Scaling | Best For |
|----------|-------------|-----------|---------|----------|
| **Shared State** (LangGraph) | Strong | Easier | Limited | Tightly-coupled workflows |
| **Message-Based** (Kafka/RabbitMQ) | Eventual | Harder | Excellent | Loosely-coupled systems |

**Handoff Protocols** (API Contracts Between Agents):
```typescript
// Treat agent-to-agent communication as API contracts
interface AgentHandoff {
  // JSON Schema validation
  schema: JSONSchema;
  
  // Full context transfer
  context: {
    task: TaskDescription;
    completedWork: WorkProduct;
    constraints: Constraint[];
    assumptions: Assumption[];
  };
  
  // Validation
  validate(): ValidationResult;
}

// Example: Research → Writing handoff
const handoff: AgentHandoff = {
  schema: {
    type: 'object',
    required: ['sources', 'keyFindings', 'outline'],
    properties: {
      sources: { type: 'array', items: { type: 'string', format: 'uri' } },
      keyFindings: { type: 'array', items: { type: 'string' } },
      outline: { type: 'object' }
    }
  },
  context: {
    task: { description: 'Write API documentation', ... },
    completedWork: { sources: [...], findings: [...] },
    constraints: [{ type: 'length', max: 5000 }, ...],
    assumptions: [{ description: 'Audience is developers', ... }]
  },
  validate() {
    // Validate against schema
    return ajv.validate(this.schema, this.context);
  }
};
```

---

### Framework Comparison (2026)

| Framework | Strength | Weakness | Best For |
|-----------|----------|----------|----------|
| **LangGraph** | Fastest execution, low-level control | Steeper learning curve | Custom workflows, performance-critical |
| **CrewAI** | Role-based teams, quick prototypes | Less flexible | Rapid prototyping, role-based tasks |
| **AutoGen** | Flexible conversations | Complex debugging | Research, conversational agents |
| **Claude Agents SDK** | Production-ready orchestrator pattern | Newer ecosystem | Enterprise production deployments |
| **Deep Agents** (LangChain, Mar 2026) | Built-in planning, context isolation | Opinionated structure | Complex multi-step tasks |

---

### Best Practices for Parallel Agents

**Research-Backed DOs**:
- ✅ Use worktrees for isolation (prevents conflicts)
- ✅ Define clear subtask boundaries (reduces coordination overhead)
- ✅ Share context between agents when needed (improves coherence)
- ✅ Coordinate dependencies (prevents blocking)
- ✅ Review each agent's output independently (maintains quality)
- ✅ Designate exactly one orchestrator (prevents coordination conflicts)

**Research-Backed DON'Ts**:
- ❌ Have agents work on same files (causes merge conflicts)
- ❌ Create circular dependencies (causes deadlocks)
- ❌ Forget to merge changes (loses work)
- ❌ Run too many agents (>8 becomes chaotic per enterprise studies)
- ❌ Ignore conflicting approaches (causes technical debt)
- ❌ Skip human-in-the-loop gates (required for production deployments)

**Enterprise Lesson** (Stripe):
- Zero-configuration deployment worked for 1,370 engineers
- But required human review for security-critical code
- Binary signing collaboration with Anthropic for enterprise security

---

### Measuring Multi-Agent Effectiveness

**Key Metrics** (from production deployments):

| Metric | Single Agent | Multi-Agent | Improvement |
|--------|-------------|-------------|-------------|
| Task completion time | 60 min | 15 min | 4x faster |
| Code quality (defects/KLOC) | 12.3 | 8.7 | 29% better |
| Test coverage | 65% | 89% | 37% higher |
| Developer satisfaction | 3.2/5 | 4.5/5 | 41% higher |

**Task-Stratified Performance** (Pinna et al., Feb 2026):
- Documentation tasks: 82.1% acceptance rate
- New features: 66.1% acceptance rate
- **16 percentage point gap** - exceeds typical inter-agent variance
- **Implication**: Agent selection should be task-specific

---

## Prompt Engineering

### Research-Backed Principles

### Principle 1: Specificity Dramatically Improves Success

**Study Finding**: Specific prompts improve agent success rate by 40-60%. However, OctoBench (Jan 2026) found systematic gap between task-solving and instruction compliance - no model achieves >20% on strict constraint tasks.

**Bad**:
```
"Add tests for auth.ts"
```

**Good**:
```
"Write test cases for auth.ts covering:
1. Logout edge case when JWT expires mid-session
2. Token refresh flow when access token expires
3. Invalid credentials handling (wrong password)
4. Account locked after 5 failed attempts

Use patterns from __tests__/auth.test.ts
Avoid mocks for HTTP calls to /api/auth endpoints
Include error boundary tests for network failures
Minimum 80% coverage required"
```

**Why Better**:
- ✅ Specific test cases listed
- ✅ Reference file provided
- ✅ Anti-patterns called out
- ✅ Edge cases identified
- ✅ Success metric defined

---

### Principle 2: Context Engineering > Model Power

**Study Finding**: Clean, well-structured context on weaker model outperforms cluttered context on stronger model. Popularized by Shopify CEO Tobi Lütke (2025).

**Bad** (Context Dumping):
```
"Here's everything about our project:
[50 files attached, 10,000 lines of code]

Now add authentication."
```

**Good** (Context Engineering):
```
"Add JWT authentication to checkout flow.

Relevant context:
- Current auth pattern: @src/auth/validateToken.ts
- Checkout endpoint: @app/api/checkout/route.ts
- User model: @src/models/User.ts

Requirements:
- Validate JWT on all checkout requests
- Return 401 if invalid/expired
- Extract userId from token for order creation

Tests: Run `npm run test -- checkout.test.ts`"
```

**Why Better**:
- ✅ Minimal, relevant files only
- ✅ Clear requirements
- ✅ Success criteria defined
- ✅ Agent can find more context if needed

---

### Principle 3: Plan Mode Before Coding

**Cursor Study**: Developers who use Plan Mode complete tasks 35% faster with 50% fewer revisions.

**Workflow**:
1. Press `Shift+Tab` to toggle Plan Mode
2. Agent researches codebase
3. Agent asks clarifying questions
4. Agent creates implementation plan
5. You review and edit plan
6. Agent executes approved plan

**Example Plan Output**:

```markdown
# Implementation Plan: Add User Dashboard

## Summary
Create user dashboard with stats, activity feed, and settings panel.

## Files to Create
- `app/dashboard/page.tsx` - Main dashboard page
- `components/dashboard/StatsCard.tsx` - Stats display component
- `components/dashboard/ActivityFeed.tsx` - Activity timeline
- `app/api/dashboard/stats/route.ts` - Stats API endpoint
- `app/api/dashboard/activity/route.ts` - Activity API endpoint

## Files to Modify
- `src/models/User.ts` - Add dashboard preferences
- `app/layout.tsx` - Add dashboard navigation link

## Implementation Steps
1. Create API endpoints for dashboard data
2. Build dashboard page layout
3. Implement StatsCard component
4. Implement ActivityFeed component
5. Add navigation link
6. Write tests
7. Run linter and typecheck

## Testing Strategy
- Unit tests for API endpoints
- Component tests for StatsCard and ActivityFeed
- Integration test for full dashboard flow

## Estimated Time: 45 minutes
```

**Edit Plan Before Execution**:
```markdown
# Your Edits
- Remove settings panel (not needed yet)
- Add caching to API endpoints
- Include loading states
- Add error boundaries
```

---

### Principle 4: Verifiable Goals Enable Iteration

**Study Finding**: Agents with verifiable goals iterate 3x more effectively.

**Bad** (Unverifiable):
```
"Make the code better"
```

**Good** (Verifiable):
```
"Refactor authentication module to:
1. Reduce cyclomatic complexity to < 10
2. Increase test coverage to > 90%
3. Pass all existing tests
4. Pass linter with 0 warnings
5. Pass typecheck with 0 errors

Run after each change:
- `npm run test -- auth.test.ts`
- `npm run lint -- src/auth/`
- `npm run typecheck`"
```

**Why Better**:
- ✅ Measurable metrics
- ✅ Specific commands to run
- ✅ Clear success criteria
- ✅ Agent can self-evaluate

---

### Principle 5: Positive Framing Works Better

**Research Finding**: Agents follow "do X" instructions 2x more reliably than "don't Y".

**Bad** (Negative Framing):
```
"Don't use var"
"Don't use CommonJS"
"Don't forget tests"
"Don't commit without linting"
```

**Good** (Positive Framing):
```
"Use let or const for variables"
"Use ES modules (import/export)"
"Write tests for all new code"
"Run linter before committing"
```

---

### Prompt templates

Copy-ready prompts (feature, bugfix, review, TDD) live in **[Appendix: Prompt Templates](#prompt-templates)**. Use them instead of pasting huge instructions into every chat.

**Prompt specificity matters**: Vague prompts ("Add authentication") lead to 5+ clarifying messages. Specific prompts with endpoint, pattern reference, requirements, and test coverage save 10-15 minutes of back-and-forth.

---

## Tool Use Optimization

**Five Key Optimization Strategies**:

**1. Tool RAG (Retrieval-Augmented Generation)**
- Dynamic tool selection using semantic retrieval
- Presents only relevant tools per query (top 5-10)
- **Impact**: 80-95% reduction in tool definition tokens, 96.8% recall

**2. Avoid Over-Tool-Reliance**
- Models often call tools when internal knowledge suffices
- Train to recognize when NOT to call tools
- **Example**: "What's 2+2?" → Answer directly, don't call calculator
- **Cost**: Unnecessary calls waste $14,600/year at 10k daily requests

**3. Parallel Execution**
- Execute independent tools concurrently
- **Impact**: 64% latency reduction (300ms vs 900ms for 3 calls)
- Use `Promise.all()` for independent data fetches

**4. Trajectory Reduction**
- Summarize verbose tool outputs
- Keep only relevant fields from responses
- **Impact**: 96% token reduction (5,000 → 200 tokens per result)

**5. Tool Design Discipline**
- Clear naming: `validateUserEmail()` not `process()`
- Explicit JSON schemas for parameters
- Comprehensive descriptions with error cases
- **Impact**: 40-60% reduction in selection errors

**Cost Analysis**:
| Component | Typical Cost |
|-----------|--------------|
| Latency | 200-500ms per call |
| Token Cost | 1,000-5,000 tokens per call |
| Error Cost | 2-3x normal cost |

**Optimization Checklist**:
- [ ] Tool RAG for catalogs >50 tools
- [ ] Train on when NOT to call tools
- [ ] Enable parallel execution
- [ ] Summarize tool outputs
- [ ] Use clear tool schemas and descriptions

---

## Self-Correction and Verification

**Default workflow in Cursor**: Generate a draft → run objective gates (`typecheck`, `lint`, tests) → ask for a focused critique pass → patch. Cap iterations (e.g. four rounds). **MultiCodeIF** shows **structured feedback** (what failed → where → why → how to fix → example) lifts constraint satisfaction from **63.0% → 83.4%** over four rounds.

| Approach | Setup | When it helps |
|----------|-------|----------------|
| **Outer-loop reflection** | No training | General coding; pair with explicit checklists |
| **ReflexiCoder** (arXiv:2603.05863) | RL-trained model | **94.51%** HumanEval; ~**40%** less inference vs multi-call reflection |
| **ReVISE** (arXiv:2502.14565) | Intrinsic verification | Better calibration; math-style reasoning |
| **SPOC** (2025) | Single-pass finetune | Interleaved propose/verify; strong on structured reasoning benchmarks |
| **Structured feedback loop** | Prompting only | Checklist-heavy or policy-heavy tasks |

Security- or auth-critical changes still need human review—self-correction reduces mistakes; it does not replace gates.

---

## Structured Reasoning Patterns

**E²C (Explore–Execute Chain)** (arXiv:2509.23946): Separate **planning** from **execution** (Plan mode → implement without re-planning). Reported **58.1%** AIME'24 with **<10%** of chain-of-thought token cost—good fit for multi-step coding when the plan is stable.

**Deep Agents runtime** (LangChain, Mar 2026): Built-in todos, filesystem/shell tools, and per-task context isolation for long-running workflows.

Research-only trace formats (heavy **CoE** / **ET-CoT** setups) are rarely worth the complexity for IDE agents unless you control training data and evaluation.

**Rule of thumb**: Short tasks or crisp specs → **E²C**. Long orchestrations with many tools → **Deep Agents**. Always keep verification from the previous section.

---
## Context Management

### Research-Backed Strategies

### The Full Context Stack (Faros AI, 2026)

Faros AI identified **eight layers** affecting AI coding agent performance. Understanding this stack enables precise context engineering:

| Layer | Description | Injection Strategy | Typical Size |
|-------|-------------|-------------------|--------------|
| **1. System Prompts** | Base instructions, behavioral guidelines | Always loaded | 500-2,000 tokens |
| **2. Codebase Context** | Files, functions, patterns being modified | Task-specific loading | 1,000-10,000 tokens |
| **3. Git History** | Recent changes, commit messages, PR context | On-demand via @Branch | 500-5,000 tokens |
| **4. Dependencies** | Library APIs, type definitions, docs | Tool RAG when needed | 200-2,000 tokens |
| **5. Conversation History** | Prior turns, user feedback, corrections | Selective retention | 1,000-20,000 tokens |
| **6. Tool Definitions** | Available tools, schemas, descriptions | Dynamic per task | 500-5,000 tokens |
| **7. Execution Context** | Runtime state, errors, outputs | Real-time streaming | 100-1,000 tokens |
| **8. External Knowledge** | Docs, StackOverflow, internal wikis | RAG retrieval | 500-10,000 tokens |

**Key Insight**: Total context can easily exceed 50,000-100,000 tokens. Tiered injection and position-aware placement are critical for maintaining performance.

---

### "Lost in the Middle" Phenomenon

**Research Finding**: U-shaped attention bias is inherent in transformers - best recall at beginning (1-10%) and end (90-100%), poor recall in middle (40-60%).

**Practical Impact**:

| Position | Retrieval Accuracy |
|----------|-------------------|
| **1-10%** (Primacy) | 85-95% |
| **40-60%** (Middle) | 30-50% |
| **90-100%** (Recency) | 85-95% |

**Mitigation Strategies**:

**1. Position-Aware Injection**:
```typescript
// ❌ Bad: Critical info in middle (will be missed)
// ✅ Good: Critical info at beginning AND end
const context = `
  [CRITICAL: Use JWT for auth] ← Primacy
  [Background info...]
  [REMINDER: JWT required] ← Recency
`;
```

**2. Chunking with Repetition**:
- Break long context into chunks
- Repeat key constraints in each chunk header

**3. Tiered Injection** (60-80% context reduction):
- **Always Loaded** (Position 1-10%): Critical constraints, essential commands
- **Task-Specific** (Position 90-100%): Current task, success criteria
- **Agent Discovers** (Middle): Background, alternatives (acceptable to miss)

**4. Calibration Prompts**:
```
Instruction: Search the context for relevant information.
Focus on relevance, not position.
```

---

### Strategy 1: Let Agent Find Context

**Study Finding**: Manually tagging every file reduces agent performance by 25%.

**Bad**:
```
"Here are all the files you need:
@file1.ts @file2.ts @file3.ts ... @file50.ts

Now implement authentication."
```

**Good**:
```
"Implement authentication for the checkout flow.
Follow patterns in @src/auth/validateToken.ts
and @components/PaymentForm.tsx"
```

**Why Better**:
- ✅ Agent has powerful search tools (grep, semantic search)
- ✅ Agent finds relevant files on demand
- ✅ Including irrelevant files confuses agent about priorities
- ✅ Trust agent's ability to explore codebase

---

### Strategy 2: Start New Conversations Strategically

**Research Finding**: Long conversations accumulate noise, agent effectiveness decreases after 10-15 turns.

**Start New Conversation When**:
- ✅ Moving to different task or feature
- ✅ Agent seems confused or makes same mistakes
- ✅ Finished one logical unit of work
- ✅ Context accumulated too much noise

**Continue Conversation When**:
- ✅ Iterating on same feature
- ✅ Agent needs context from earlier
- ✅ Debugging something it just built
- ✅ Mid-task with clear progress

---

### Strategy 3: Use @Past Chats for Reference

**Feature**: Reference previous work without copying entire conversation.

**Usage**:
```
"Continue the authentication work from @Past Chats: Dashboard Feature
but focus on the authorization middleware this time."
```

**Benefit**:
- ✅ Agent selectively reads relevant parts
- ✅ More efficient than duplicating context
- ✅ Maintains continuity without bloat

---

### Strategy 4: Use @Branch for Current Work

**Feature**: Give agent context about current branch.

**Usage**:
```
"@Branch What am I working on?

@Branch Review the changes on this branch"
```

**Benefit**:
- ✅ Agent sees git diff
- ✅ Understands current task context
- ✅ Can continue where you left off

---

### Strategy 5: Tiered Context Injection

**Implementation**:
```
Always Loaded:
- .cursor/rules/general.md (5-10 lines)

Task-Specific (Loaded On-Demand):
- .cursor/rules/testing.md (for test tasks)
- .cursor/rules/api.md (for API work)
- .cursor/rules/styling.md (for UI work)

Referenced Explicitly:
- @src/auth/validateToken.ts (specific pattern)
- @components/Button.tsx (component structure)

Agent Discovers:
- Everything else via search tools
```

**Context Size Reduction**: 60-80% vs monolithic approach.

---

### Scenario: Context Management in Practice

**Task**: Add payment processing to checkout

**Poor Context Management**:
```
User: [Attaches 30 files]
"Here's everything about checkout and payments. Add Stripe integration."

Agent: [Overwhelmed, asks 10 clarifying questions]
"Which files are most important? What's the existing pattern?..."
```

**Optimal Context Management**:
```
User: "Add Stripe payment integration to checkout.

Follow patterns:
- @app/api/checkout/route.ts - Current checkout logic
- @src/payments/paypal.ts - Existing payment provider (similar structure)

Requirements:
- Support credit cards and Apple Pay
- Handle payment failures gracefully
- Save payment method for future use
- PCI compliance (use Stripe Elements)

Tests: Run `npm run test -- payment.test.ts`"

Agent: [Immediately starts implementing]
"Got it! I'll add Stripe integration following the PayPal pattern.
Starting with the payment processor interface..."
```

**Result**: 3x faster completion, fewer clarifying questions.

---

## Production Deployments & Case Studies

### Enterprise Results

| Case Study | Scale | Key Result | Source |
|-----------|-------|------------|--------|
| **Stripe** | 1,370 engineers | 10k LOC migration in 4 days (vs 10 weeks) | Anthropic |
| **incident.io** | 4-5 agents parallel | Feature built in 10 min (est. 2 hours) | AI-native |
| **Series B SaaS** | Domain-specialized | $253k/year savings, 340% ROI | 3-month study |

**Series B SaaS Metrics**: Code review 87% faster (2-4h → 15-30min), features 67% faster (2-3w → 4-7d), test coverage +80% (40% → 85-95%), bugs -70% (15-20/mo → 4-6/mo).

### Productivity Research

| Study | Finding | Caveat |
|-------|---------|--------|
| McKinsey (2026) | Up to 2x faster task completion | Short, well-defined tasks only |
| Forrester (Q4 2025) | 72% developer velocity increase | Systemic changes needed for org velocity |
| Time savings avg | 3.6 hours/week/developer | Shifts time to higher-value activities |

**Adoption**: 84% of developers use or plan AI tools; 51% use daily; 22% of merged code is AI-authored. Multi-agent market: $8.5B (2026) → $35B (2030).

### Security (AppSec Santa, Mar 2026)

**25.1% of AI-generated code has vulnerabilities** (534 samples, 6 LLMs). GPT-5.2: 19.1% (best); Claude Opus 4.6/DeepSeek V3/Llama 4: 29.2% (worst). Injection: 33.1% of findings. 74 CVEs attributed to AI code.

**Mitigation**: Mandatory security review, automated scanning in CI/CD, human gates for critical code, enterprise binary signing (Stripe-Anthropic model).

### Task-Stratified Performance (Pinna et al., Feb 2026)

**7,156 PRs, 9 categories**: Documentation 82.1% acceptance; Features 66.1%; Security 63.4% (lowest). **16-point gap** between best and worst. No single agent dominates all categories — select agent per task type.

### Lessons from Production

**What Works**: Zero-config deployment (Stripe), parallel agents (incident.io), domain specialization (Series B SaaS), GitHub Actions integration, human-in-the-loop gates for production.

**What Doesn't**: Comprehensive documentation (ETH Zurich: +20-23% costs), one-size-fits-all agents (16-point task gap), skipping security review (25.1% vuln rate), >8 agents (chaotic).

### ROI Framework

For 10-dev team: $2,400/year AI tools → $250,000/year return (10,400% ROI). Even conservative estimates (50% time savings) show >5,000% ROI.

---

## Emerging Trends & Future Directions

### 5 Key Trends (2026)

1. **Context engineering & budgets** — Primacy/recency placement (MOSAIC, ACL 2026) remains decisive; **ContextBudget** (arXiv:2604.01664) frames long-horizon context as a **budget** (when to compress or drop history). Clean context on a weaker model still beats cluttered context on a stronger one.
2. **Instruction–tool retrieval (ITR)** (arXiv:2602.17046) — Compose minimal per-step prompts instead of dumping the full manual every turn; reported **~95%** per-step token reduction and **~70%** cost reduction in the paper’s setting.
3. **Many-tier instruction hierarchies (Many-IH)** (arXiv:2604.09443) — With **12** conflicting instruction levels, accuracy can sit near **~40%**; keep AGENTS.md, rules, and skills intentionally small and non-overlapping.
4. **Chain of Draft (CoD)** — Very short reasoning steps can match verbose chain-of-thought at **~92%** fewer tokens; use terse agent steps when quality holds.
5. **Security-first delivery** — **25.1%** of AI-generated code shows vulnerabilities (AppSec Santa); binary signing, mandatory review gates, and security-specialized agents are moving mainstream.

**Instruction Following Gap** (OctoBench/MOSAIC): No model >20% on strict constraints. Compliance varies with constraint position (primacy/recency effects). Iterative refinement (4 rounds): 63% → 83% compliance.

**AGENTS.md as Universal Standard**: 60,000+ repositories adopted. Supported by Anthropic, Google, GitHub, OpenAI, Cursor. 32 KiB combined character limit across files.

---

## Hallucination Prevention & Factuality

**Core Challenge**: 96% hallucination reduction possible through multi-layered strategies, though complete elimination remains impossible.

### Key Findings

| Study | Finding | Implication |
|-------|---------|-------------|
| Zylos (Jan 2026) | Multi-layered: 96% reduction | Combine multiple techniques |
| Meta/ETH (ACL 2024) | Chain-of-Verification (CoVe) reduces across all tasks | Systematic verification workflows |
| arXiv:2601.19106 | AST detection: 100% precision, 87.6% recall, 77% auto-correction | Use deterministic validation |
| ReflexiCoder (Mar 2026) | 94.51% HumanEval with self-correction, 40% less compute | RL-based internalization |
| arXiv:2603.24579 | Multi-agent verification breaks confirmation bias | Independent verification agents |

### 4 Types of Hallucinations

1. **Factual**: Invented APIs, non-existent functions, fake docs
2. **Code**: Syntax errors, type mismatches, logic errors
3. **Context**: Non-existent files, wrong codebase structure
4. **Confidence**: "Confidently wrong" regime, overstated certainty

### Detection Methods

| Method | Key Finding | Cursor Application |
|--------|-------------|-------------------|
| **Semantic Entropy** (LLM-Check) | Analyzes attention similarity maps + logit consistency | Use internally to flag uncertain outputs |
| **White-Box** | Hidden representations, attention maps | Not directly usable; informs confidence scoring |
| **Black-Box** (FINCH-ZK) | Cross-model consistency, +6-39% F1 | Compare outputs across models for critical code |
| **Sampling Consensus** (HalluCodeDetector) | AUROC=0.76 via MRCM metric | Generate 3 samples, check semantic agreement |
| **AST-Based** (arXiv:2601.19106) | 100% precision, 87.6% recall on KCHs | Run `tsc --noEmit` + ESLint as deterministic gate |

### Prevention & Mitigation Strategies

**1. Chain-of-Verification (CoVe)** — Meta AI/ETH Zürich (ACL 2024):
- **Workflow**: Draft → Plan verification questions → Answer independently → Generate corrected output
- **Cursor pattern**: Generate code → ask "what APIs are used?" → verify each exists → regenerate if needed
- **Result**: Reduces hallucinations across all task types

**2. RAG with Attribution** (arXiv:2601.19927):
- Ensure responses verifiably supported by retrieved content; abstain if retrieval quality insufficient
- **Stable-RAG** (arXiv:2601.02993): Cluster hidden states across permutation orders for consistent predictions
- **Cursor pattern**: `@file` references only, agent finds more via search

**3. Self-Correction & Reflection**:
- **ReflexiCoder** (arXiv:2603.05863): RL internalizes self-reflection → 94.51% HumanEval, 40% less compute
- **SPOC** (2025): Single-pass self-correction +8.8-11.6% MATH500
- **Cursor pattern**: After code generation, prompt "Review critically for: logic errors, edge cases, security, performance" → fix issues found

**4. Multi-Agent Verification (MARCH)** (arXiv:2603.24579):
- Break confirmation bias via information asymmetry: Solver → Propositions → Checker (blind) → Re-solve if failed
- **Cursor pattern**: Generate → Review in new context (no prior conversation) → Fix flagged issues

**5. Confidence Calibration & Abstention**:
- **HALT**: Finetune to generate only when confident: 51% → 87% accuracy, 53% completeness
- **Cursor pattern**: For critical paths, require >90% confidence; standard >75%; docs >60%

**6. Citation Verification**:
- **CiteGuard** (arXiv:2510.17853): Retrieval-augmented validation (68.1% accuracy) + LLM judge hybrid
- **FACTUM**: Mechanistic framework measuring attention/FFN contributions; scale-dependent thresholds

### Implementation Patterns

**Layered Verification Pipeline** (Syntax → AST → Type check → Semantic → Tests):
```
generated_code → tsc --noEmit → eslint → npm test → human review (if confidence < threshold)
```

**Confidence-Gated Workflow**:
- Critical code paths: >90% confidence → proceed; 75-90% → human review; <75% → abstain
- Standard features: >75% proceed; <75% review
- Documentation: >60% acceptable

**Iterative Refinement**: Max 4 rounds, evaluate score >0.9 + no hallucinations before accepting.

### Production Monitoring

Track these metrics: `hallucinationRate` (<5%), `falsePositiveRate` (<2%), `abstentionRate` (10-20%), `meanConfidence` (>0.8), `calibrationError` (<0.1).

### Key Takeaways

1. **Detection > Prevention**: Catch hallucinations easier than preventing entirely
2. **Multi-modal verification**: Combine syntax, semantic, and execution checks
3. **Context engineering reduces hallucinations**: Better context → fewer errors
4. **Self-correction improves over time**: RL approaches show 40% inference reduction
5. **Multi-agent verification breaks bias**: Independent agents catch confirmation errors

---

## Implementation Roadmap

Use this as a **sequence**, not a fixed calendar—linger on a phase until it feels solid.

| Phase | Focus | Done when |
|-------|-------|-----------|
| **1. Foundation** | Minimal [AGENTS.md](#agentsmd), one general rules file, Plan Mode on real tasks | Small tasks finish without giant file dumps |
| **2. Automation** | Commands (`/pr`, `/review`, `/fix-issue`, optional `/tdd`) + one domain skill | Repeatable flows are one invocation |
| **3. Advanced** | One hook (iteration cap / guardrail), parallel agents + worktrees, richer SKILL.md | Parallel work merges cleanly |
| **4. Optimize** | Cut instructions if cost rises or success drops (ETH Zurich warning signs); short team doc | Token use stable or down; onboarding is obvious |

**Weekly metrics**: time-to-done, first-attempt success, lint/typecheck/test pass rate, subjective tool/token use.

**Pitfalls** (still the usual): over-long AGENTS.md, negative-only rules, attaching dozens of files, 50-message threads—trim, reframe positively, attach 2–3 canonical paths, reset chats when switching work.

All copy-paste templates: [Appendix: Templates](#appendix-templates).

---
## Appendix: Templates

> **Canonical examples** for repository and rules live in [AGENTS.md](#agentsmd) and [Cursor Rules](#cursor-rules). Below: task rules, commands, skills, hooks, and **prompt templates** only.

### Template: Task-Specific Rules

```markdown
# [Task Type] Rules

## When to Use
[When these rules apply]

## [Task Type] Requirements
- [Requirement 1]
- [Requirement 2]
- [Requirement 3]

## Commands
```bash
[command 1]  # When to run
[command 2]  # When to run
```

## Examples
- [Example 1]: @[file path]
- [Example 2]: @[file path]
```

---

### Template: Command

```markdown
# /command-name [parameters]

[One-line description]

## Steps
1. [First step]
2. [Second step]
3. [Third step]
4. [Final step]

## Commands to Run
```bash
[command 1]
[command 2]
```

## Output
[What agent should return]

## Examples
[Usage example 1]
[Usage example 2]
```

---

### Template: Skill

```markdown
# SKILL.md: [Skill Name]

## Description
[What this skill does]

## When to Use
[Trigger conditions]

## Capabilities
- [Capability 1]
- [Capability 2]
- [Capability 3]

## Commands
/[command-name]: [Description]

## Key Concepts
[Domain-specific knowledge]

## Patterns
[Code patterns, examples]

## Workflows
[Step-by-step workflows]

## Examples
[Usage examples with sample prompts]
```

---

### Template: Hook

```typescript
// .cursor/hooks/[name].ts

interface StopHookInput {
  conversation_id: string;
  status: "completed" | "aborted" | "error";
  loop_count: number;
}

interface StopHookOutput {
  followup_message?: string;
}

const stdin = await new Promise<string>((resolve) => {
  let data = "";
  process.stdin.on("data", (chunk) => (data += chunk));
  process.stdin.on("end", () => resolve(data));
});

const input: StopHookInput = JSON.parse(stdin);

// Your logic here
if (/* condition to continue */) {
  const output: StopHookOutput = {
    followup_message: "Continue with this message",
  };
  console.log(JSON.stringify(output));
} else {
  console.log(JSON.stringify({}));
}
```

---

### Prompt Templates

#### Feature Implementation

```markdown
Implement [feature name] with the following requirements:

## Requirements
- [Requirement 1]
- [Requirement 2]
- [Requirement 3]

## Constraints
- Follow patterns in @[reference file]
- Use [specific technology/pattern]
- Avoid [anti-pattern]

## Success Criteria
- [Test 1] passes
- [Test 2] passes
- [Metric] achieved

## Files to Reference
- @[file 1] - [reason]
- @[file 2] - [reason]

## Commands to Run
- `[command 1]` - [when]
- `[command 2]` - [when]
```

#### Bug Fix

```markdown
Fix bug: [bug description]

## Reproduction Steps
1. [Step 1]
2. [Step 2]
3. [Observe bug]

## Expected Behavior
[What should happen]

## Current Behavior
[What actually happens]

## Investigation
- Check [file/area] for [potential cause]
- Review recent changes to [file]
- Test with [specific input]

## Constraints
- Don't break [existing functionality]
- Maintain [specific behavior]
- Follow pattern in @[file]

## Verification
- Reproduce original bug (should be fixed)
- Run tests: `[test command]`
- Check [edge case] still works
```

#### Code Review

```markdown
Review code for [purpose]:

## Focus Areas
- [ ] Bugs or logic errors
- [ ] Security vulnerabilities
- [ ] Performance issues
- [ ] Code quality and maintainability
- [ ] Test coverage
- [ ] Error handling

## Changed Files
@[file 1]
@[file 2]

## Context
- Related issue: #[issue number]
- Affected users: [user group]
- Risk level: [low/medium/high]

## Output Format
### Good
[Positive observations]

### Concerns
[Potential issues]

### Blockers
[Critical issues]

### Suggestions
[Optional improvements]
```

#### Test-Driven Development

```markdown
Implement [feature] using TDD:

## Test Cases to Write
1. [Happy path scenario]
2. [Edge case 1]
3. [Edge case 2]
4. [Error condition]
5. [Boundary condition]

## Test Requirements
- Use [testing framework]
- Follow pattern in @[test file]
- Minimum [X]% coverage
- Include [specific assertions]

## Process
1. Write all tests first (DO NOT implement)
2. Run tests, confirm ALL fail
3. Commit tests only
4. Implement minimal code to pass
5. Iterate until all pass
6. Refactor
7. Run full test suite

## Commands
- `[test command]` - after each change
- `[lint command]` - after implementation
- `[typecheck command]` - before commit
```

---

## References

### Academic Papers (arXiv)

1. **Pinna, G., et al.** (Feb 2026). "Comparing AI Coding Agents: A Task-Stratified Analysis of Pull Request Acceptance." arXiv:2602.08915. https://arxiv.org/abs/2602.08915
   - **Key Finding**: 16 percentage point gap between documentation (82.1%) and features (66.1%)
   - **Implication**: Agent selection should be task-specific

2. **Zhang, W., et al.** (Feb 2026). "EvoCodeBench: A Human-Performance Benchmark for Self-Evolving LLM-Driven Coding Systems." arXiv:2602.10171v1. https://arxiv.org/abs/2602.10171v1
   - **Key Finding**: Evaluates correctness + efficiency (time, memory, algorithmic design)
   - **Implication**: Benchmarking maturing beyond simple accuracy

3. **Galster, M., et al.** (Feb 2026, rev. Mar 2026). "Configuring Agentic AI Coding Tools: An Exploratory Study." arXiv:2602.14690. https://arxiv.org/abs/2602.14690
   - **Key Finding**: Analysis of 2,923 repos, AGENTS.md emerging as standard
   - **Implication**: Modular, on-demand context > comprehensive documentation

4. **Ding, D., et al.** (Jan 2026). "OctoBench: Benchmarking Scaffold-Aware Instruction Following in Repository-Grounded Agentic Coding." arXiv:2601.10343. https://arxiv.org/abs/2601.10343
   - **Key Finding**: 34 environments, 217 tasks, 7,098 checklist items. No model >20% on strict constraint tasks, <50% compliance
   - **Implication**: Instruction following remains unsolved problem, Skill.md constraints underperform

5. **Lulla, J.L., et al.** (Jan 2026). "On the Impact of AGENTS.md Files on the Efficiency of AI Coding Agents." arXiv:2601.20404v1. https://arxiv.org/abs/2601.20404v1
   - **Key Finding**: 28.64% faster runtime, 16.58% fewer tokens
   - **Implication**: AGENTS.md improves operational efficiency

6. **Gloaguen, T., et al.** (Feb 2026). "Evaluating AGENTS.md: Are Repository-Level Context Files Helpful for Coding Agents?" arXiv:2602.11988. https://arxiv.org/abs/2602.11988
   - **Key Finding**: Context files reduce success rates, increase costs 20-159%
   - **Implication**: Keep context files minimal, focus on essential requirements only

7. **"Lost in the Middle at Birth: An Exact Theory of Transformer Position Bias"** (Mar 2026). arXiv:2603.10123. https://arxiv.org/abs/2603.10123
   - **Key Finding**: U-shaped attention bias inherent at initialization, causal masking creates primacy tail, residual connections create recency delta, middle is factorial dead zone O(1/(H-1)!)
   - **Implication**: Position critical info at beginning/end, middle structurally hostile

8. **ReflexiCoder** (Mar 2026). "Teaching Large Language Models to Self-Reflect on Generated Code and Self-Correct It via Reinforcement Learning." arXiv:2603.05863. https://arxiv.org/abs/2603.05863
   - **Key Finding**: 94.51% HumanEval, 81.80% MBPP, 40% reduction in inference compute
   - **Implication**: Internalize self-correction in model weights via RL

9. **ReVISE** (Feb 2025). "Learning to Refine at Test-Time via Intrinsic Self-Verification." arXiv:2502.14565. https://arxiv.org/abs/2502.14565
   - **Key Finding**: Test-time scaling with curriculum learning and confidence-aware decoding
   - **Implication**: Enable intrinsic self-verification without external reward models

10. **Explore-Execute Chain** (Sep 2025). "Towards an Efficient Structured Reasoning Paradigm." arXiv:2509.23946. https://arxiv.org/abs/2509.23946
    - **Key Finding**: 58.1% on AIME'2024 using <10% of decoding tokens
    - **Implication**: Decouple planning from execution for token efficiency

11. **Chain of Execution** (Oct 2025). "Chain of Execution Supervision Promotes General Reasoning in Large Language Models." arXiv:2510.23629. https://arxiv.org/abs/2510.23629
    - **Key Finding**: +7.1% improvement on LLaMA3.1-8B across math datasets with TracePile corpus
    - **Implication**: Execution traces as CoT rationales improve reasoning

12. **ToolRM** (Sep 2025). "Outcome Reward Models for Tool-Calling Large Language Models." arXiv:2509.11963. https://arxiv.org/abs/2509.11963
    - **Key Finding**: 25% improvement in Best-of-n sampling, first reward models for tool-calling
    - **Implication**: Domain-specific reward models outperform general-purpose

13. **The Evolution of Tool Use in LLM Agents** (Mar 2026). arXiv:2603.22862. https://arxiv.org/abs/2603.22862
    - **Key Finding**: Six core dimensions: inference-time planning, training, safety, efficiency, capability, benchmarking
    - **Implication**: Field shifting from single-tool to multi-tool orchestration

14. **SPOC** (2025). "Spontaneous Self-Correction in Large Language Models." OpenReview. https://openreview.net/forum?id=9DCQAGBoII
    - **Key Finding**: +8.8-11.6% on MATH500, +10.0-20.0% on AMC23 with single-pass self-correction
    - **Implication**: Interleaved solution-verification more efficient than multi-pass

15. **MultiCodeIF** (Jul 2025). "A Hierarchical and Evolvable Benchmark for Fine-Grained Code Instruction Following with Multi-Turn Feedback." arXiv:2507.00699. https://arxiv.org/abs/2507.00699
    - **Key Finding**: 63.0% → 83.4% constraint satisfaction over 4 refinement rounds
    - **Implication**: Structured feedback enables substantial gains

### Industry Research

7. **AppSec Santa** (Mar 2026). "AI Code Security Study: 6 LLMs vs OWASP Top 10." https://appsecsanta.com/research/ai-code-security-study-2026
   - **Key Finding**: 534 code samples, 25.1% vulnerability rate. GPT-5.2 best (19.1%), Claude Opus 4.6/DeepSeek V3/Llama 4 worst (29.2%). 74 CVEs attributed to AI code
   - **Implication**: Security review mandatory, model selection matters

8. **Microsoft Research** (2025). "PromptWizard." GitHub. https://github.com/microsoft/PromptWizard
   - **Key Finding**: Self-evolving prompts through iterative refinement
   - **Implication**: Automated prompt optimization becoming viable

9. **Microsoft Foundry** (2026). "Introducing Multi-Agent Workflows in Foundry Agent Service." https://devblogs.microsoft.com/foundry/introducing-multi-agent-workflows-in-foundry-agent-service
   - **Key Finding**: Orchestrator pattern standard for production systems
   - **Implication**: Multi-agent workflows moving to mainstream

10. **Anthropic** (2026). "Customer Story: Stripe." https://www.anthropic.com/customers/stripe
    - **Key Finding**: 10,000-line migration in 4 days vs 10 engineering weeks
    - **Implication**: Enterprise-scale AI coding viable with proper security

11. **McKinsey & Company** (2026). "The Economic Potential of Generative AI in Software Development."
    - **Key Finding**: Developers complete tasks up to 2x faster with AI
    - **Implication**: Individual productivity gains well-documented

12. **Forrester Research** (Q4 2025). "The Total Economic Impact of AI Coding Platforms."
    - **Key Finding**: 72% increase in developer velocity
    - **Implication**: Organizational velocity improvements require systemic changes

13. **Zylos Research** (Mar 2026). "AI Agent Tool-Use Optimization: Efficiency, Selection, and Composition Patterns." https://zylos.ai/research/2026-03-03-ai-agent-tool-use-optimization
    - **Key Finding**: Five optimization axes (Tool RAG, alignment, parallel execution, trajectory reduction, tool design). Parallel execution reduces latency 64%. Over-tool-reliance wastes $14,600/year at scale
    - **Implication**: Tool-use optimization critical for production systems

14. **AAIA Agentic AI Insights** (Jan 2026). "Benchmarks: Token Efficiency in Sequential vs. Parallel Agent Workflows." https://aaia.app/research/parallel-execution-benchmarks
    - **Key Finding**: 64% average latency reduction with parallel execution, 70% of tasks can be decomposed into independent clusters
    - **Implication**: Implement dependency graph analysis for parallel tool calls

15. **LangChain** (Mar 2026). "Deep Agents: A Structured Runtime for Planning, Memory, and Context Isolation." https://python.langchain.com/docs/deep-agents/
    - **Key Finding**: Built-in planning tools, filesystem operations, shell access, task decomposition
    - **Implication**: Structured runtimes enable complex multi-step workflows

16. **ToolScope** (2026). "toolscope v0.1.0." PyPI. https://pypi.org/project/toolscope/
    - **Key Finding**: Production-ready Tool RAG with 96.8% recall using vector search
    - **Implication**: Dynamic tool selection from large catalogs viable

17. **Graph RAG-Tool Fusion** (Feb 2025). arXiv:2502.07223. https://arxiv.org/abs/2502.07223
    - **Key Finding**: 71.7% absolute improvement over naive RAG for interdependent tools
    - **Implication**: Graph-based tool selection captures dependencies

18. **Millwright** (Mar 2026). "Adaptive Tool-Routing Framework That Learns from Agent Experience." Agent Wars. https://agent-wars.com/news/2026-03-15-millwright-adaptive-tool-selection-framework-that-learns-from-agent-experience
    - **Key Finding**: Learns optimal tool selection from agent experience
    - **Implication**: Adaptive tool-routing improves over time

19. **IBM Research** (Sep 2025). "ToolRM: Towards Agentic Tool-Use Reward Modeling." arXiv:2510.26167. https://arxiv.org/abs/2510.26167
    - **Key Finding**: First reward models for tool-calling (1.7B-14B parameters), 25% improvement in Best-of-n
    - **Implication**: Domain-specific reward modeling for tool use

20. **ToolPRMBench** (Jan 2026). "Evaluating and Advancing Process Reward Models for Tool-using Agents." arXiv:2601.12294. https://arxiv.org/abs/2601.12294
    - **Key Finding**: First large-scale benchmark for process reward models in tool use
    - **Implication**: Step-level reward guidance for complex tool trajectories

21. **SUTRADHARA** (2026). "Infrastructure Co-Design for LLM Tool Execution." arXiv:2601.12967. https://arxiv.org/abs/2601.12967
    - **Key Finding**: 15% reduction in first-token-rendered latency, 10% end-to-end with orchestration-LLM co-design
    - **Implication**: Infrastructure-level optimizations complement algorithmic improvements

22. **Multi-Agent Orchestration Patterns** (Jan 2026). Zylos Research. https://zylos.ai/research/2026-01-06-multi-agent-orchestration-patterns
    - **Key Finding**: 72% enterprise adoption rate, $52B market by 2030. Six core patterns identified
    - **Implication**: Multi-agent production-ready with established patterns

### Analysis and Commentary

13. **Understanding Data** (2025). "Lost in the Middle: Preventing Context Window Attention Degradation." https://understandingdata.com/posts/lost-in-the-middle-mitigation/
    - **Key Finding**: U-shaped attention pattern, best at 1-10% and 85-100% positions
    - **Implication**: Position critical info at beginning or end of context

14. **Dev.to** (2026). "The 'Lost in the Middle' Problem." https://dev.to/thousand_miles_ai/the-lost-in-the-middle-problem
    - **Key Finding**: Architectural causes (causal masking, positional encoding biases)
    - **Implication**: Fundamental LLM limitation, not fixable with training

15. **Not Chris Groves** (2026). "When AGENTS.md Backfires." https://notchrisgroves.com/when-agents-md-backfires/
    - **Key Finding**: Comprehensive files reduce effectiveness
    - **Implication**: Minimalism critical for context files

16. **AI Workflow Lab** (2026). "Multi-Agent AI Systems Guide 2026." https://aiworkflowlab.dev/article/building-multi-agent-ai-systems-2026-architecture-patterns-mcp-production-orchestration
    - **Key Finding**: 40% of enterprise apps will feature task-specific agents by end-2026
    - **Implication**: Multi-agent systems becoming mainstream

17. **The Register** (Mar 26, 2026). "Using AI to code does not mean your code is more secure." https://www.theregister.com/2026/03/26/ai_coding_assistant_not_more_secure/
    - **Key Finding**: 74 CVEs attributed to AI-generated code
    - **Implication**: Security doesn't improve automatically with AI

### Documentation and Guides

18. **Cursor** (2025). "Best practices for coding with agents." https://www.cursor.com/blog/agent-best-practices
    - **Key Finding**: Plan Mode users complete tasks 35% faster with 50% fewer revisions
    - **Implication**: Planning before coding dramatically improves outcomes

19. **CodeLeap AI** (2026). "Cursor IDE Complete Guide 2026." https://codeleap.ai/en/blog/cursor-ide-complete-guide-2026
    - **Key Finding**: Comprehensive feature guide with production examples
    - **Implication**: Cursor maturing into enterprise-grade tool

20. **Skills Playground** (2026). "Cursor Rules: The Complete Guide to .cursorrules and AI Coding Rules (2026)." https://skillsplayground.com/guides/cursor-rules/
    - **Key Finding**: .cursorrules transforms Cursor from generic to project-aware
    - **Implication**: Repository configuration essential for production use

21. **Variant Systems** (2026). "Cursor Best Practices: 8 Rules for Production Code." https://variantsystems.io/blog/cursor-best-practices
    - **Key Finding**: Edit one file at a time, use AI for diagnosis not direct fixes
    - **Implication**: Human oversight critical for quality

22. **Panto.ai** (2026). "AI Coding Statistics — Adoption, Productivity & Market Metrics." https://www.getpanto.ai/blog/ai-coding-assistant-statistics
    - **Key Finding**: 84% of developers use or plan to use AI tools
    - **Implication**: AI coding crossed chasm to mainstream adoption

### Community Resources

23. **AGENTS.md Examples** (2026). GitHub Topics. https://github.com/topics/agents-md
    - 60,000+ repositories adopted AGENTS.md
    - Diverse patterns across languages and frameworks

24. **Cursor Commands Library** (2026). GitHub Topics. https://github.com/topics/cursor-commands
    - Reusable workflow templates for common tasks
    - Community-contributed best practices

25. **AI Coding Best Practices** (2026). https://cursor-alternatives.com/blog/ai-coding-best-practices/
    - Comprehensive guide to AI-assisted development
    - Tool-agnostic principles and patterns

---

### Research Timeline

**January 2026**:
- Lulla et al.: AGENTS.md efficiency benefits (28.64% faster)
- OctoBench: Instruction following gap identified (<20% compliance, 7,098 checklist items)
- Multi-Agent Orchestration Patterns: 72% enterprise adoption, $52B market projection

**February 2026**:
- Gloaguen et al.: AGENTS.md effectiveness concerns (20-159% cost increase)
- Pinna et al.: Task-stratified performance (16-point gap)
- Galster et al.: Configuration patterns (2,923 repos analyzed)
- EvoCodeBench: Self-evolving systems benchmark
- Graph RAG-Tool Fusion: 71.7% improvement for interdependent tools

**March 2026**:
- AppSec Santa: Security study (25.1% vulnerability rate, 74 CVEs, model variance 19.1-29.2%)
- "Lost in the Middle at Birth": Mathematical basis for position bias (factorial dead zone)
- The Register: AI security concerns (74 CVEs attributed to AI code)
- Zylos Research: Tool-use optimization (5 axes, 64% parallel speedup, $14,600/year waste)
- ReflexiCoder: RL-based self-correction (94.51% HumanEval, 40% less compute)

**April–May 2026**:
- ContextBudget (arXiv:2604.01664): budget-aware context management for long-horizon agents
- Many-tier instruction conflicts (Many-IH, arXiv:2604.09443): accuracy collapses when many instruction layers disagree

**September 2025**:
- Explore-Execute Chain: 58.1% AIME'2024 with <10% tokens
- Chain of Execution: +7.1% with TracePile corpus
- ToolRM: First reward models for tool-calling (25% Best-of-n improvement)

**July 2025**:
- MultiCodeIF: 63.0% → 83.4% constraint satisfaction over 4 rounds

**2025 (Various)**:
- ReVISE: Intrinsic self-verification with curriculum learning
- SPOC: Spontaneous self-correction (+8.8-11.6% MATH500, single pass)
- ET-CoT: Execution trace CoT (70.0% CruxEval-O)

**Key Insight**: Research evolving rapidly from efficiency questions (Jan 2026) to effectiveness concerns (Feb) to security implications (Mar) to optimization patterns (2025-26). Field maturing from "does it work?" to "how do we make it work safely and efficiently?" to "how do we optimize for production?"

---

## Changelog

**v1.0 (Mar 2026) → v1.1 (Mar) → v2.0 (Mar) → v2.1 (Mar) → v2.2 (Apr) → v3.0 (May 2026)**  
Major themes across releases: AGENTS.md + tiered rules, tool-use and parallel execution, self-correction and structured reasoning, hallucination stacks, security (AppSec Santa), context / “lost in the middle,” production case studies.

**v3.0 (May 11, 2026)** — Condensed edition: removed duplicate sections and long sample code; merged roadmap; prompt templates only in appendix (with review + TDD); expanded trends with **ContextBudget** (arXiv:2604.01664) and **Many-IH** labeling; TOC aligned to real section order; same evidentiary claims, shorter surface area.

---

## Contributing

This guide evolves with new research and production experience.

**To Contribute**:
- Test patterns in your workflow
- Report what works/doesn't work
- Share templates and examples
- Update based on new research

**Contact**: [Your team/contact info]

---

**Last Updated**: May 11, 2026

**License**: CC BY 4.0 (Share and adapt with attribution)

**Version**: 3.0 — Condensed edition (shorter doc; same core citations; full prompt templates in appendix)
