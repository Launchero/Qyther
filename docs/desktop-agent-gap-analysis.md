# Desktop Agent Gap Analysis

> **Date**: 2026-05-13
> **Scope**: Our `src/main/services/desktop/` implementation vs. leading open-source desktop automation agents
> **Methodology**: Source-level audit of our codebase + deep research of 9+ comparable projects (Accomplish, Agent-S/Agent-S3, OS-Copilot/FRIDAY, ScreenHand, Open Interpreter, vnc-use, OS AI Computer Use, Anthropic Computer Use, OpenAI Codex)

---

## 1. Executive Summary

Our desktop agent is a **Windows-only, ReAct-loop-based** automation system with **28 LangChain tools** driven by a single LLM (`qwen3.6-plus`). It uses Win32 FFI (koffi) for input simulation, PowerShell UI Automation for accessibility, and Electron `desktopCapturer` for screenshots. It features a basic danger policy, a pixel-diff verifier, and HITL interrupts via LangGraph.

**Key finding**: Our implementation covers the *foundational layer* of computer use well (input simulation, screenshots, basic UI automation), but is missing entire *categories* of capability that are now standard across the state-of-the-art open-source landscape:

| Gap Category | Severity | Competitive Landscape |
|---|---|---|
| Cross-platform support | **Critical** | All major competitors support macOS + Linux; Codex (macOS-only at launch) |
| Browser automation (CDP) | **Critical** | ScreenHand (15 CDP tools), Anthropic (built-in), Codex (Atlas in-app browser) |
| Memory / learning from experience | **High** | Agent-S (dual memory), ScreenHand (6 learning policies), Codex (persistent memory) |
| Safety & security guardrails | **High** | AgentTrust (95% accuracy), CoWork-OS (pattern blocking), Codex (sandbox+approval+refusal) |
| Hierarchical planning | **High** | Agent-S (Manager-Worker), ScreenHand (goal planner), FRIDAY (planner module) |
| Background agent isolation | **High** | Codex (production, shared surface — multi-agent isolation still unsolved) |
| Structured UI knowledge base | **Medium** | ScreenHand (38 reference JSONs, 28 playbooks, App Mastery Map) |
| Multi-perception pipeline | **Medium** | ScreenHand (3-rate perception), Agent-S (ACI dual-input) |
| Multi-monitor coordinate awareness | **Medium** | OS AI Computer Use (auto-detect), vnc-use (full desktop space) |
| Terminal/shell access | **Medium** | OS-Copilot (primary tool), Open Interpreter (code execution); Codex refuses by design |
| Action post-condition verification | **Medium** | ScreenHand (deterministic post-conditions), Agent-S (Self-Evaluator) |
| Error recovery / dialog handling | **Medium** | ScreenHand (recovery engine), Anthropic (wait/hold_key actions) |
| Plugin ecosystem | **Medium** | Codex (90+ plugins, MCP-based extensibility) |
| Background agent isolation | **High** | OpenAI Codex (production, shared surface) |
| Persistent memory / context recall | **High** | OpenAI Codex (cross-session memory), Agent-S (dual memory) |
| Safety sandbox + refusal lists | **High** | OpenAI Codex (seatbelt + approval policy) |
| Plugin ecosystem for extensibility | **Medium** | OpenAI Codex (90+ plugins) |
| Scheduled automations | **Medium** | OpenAI Codex (wake-and-continue tasks) |

---

## 2. Our Current Capabilities — Complete Inventory

### 2.1 Architecture

```
LangGraph Research Agent
  └─→ desktop intent routing
        └─→ DesktopAgent (ReAct loop, maxSteps=25)
              ├─ ChatOpenAI (qwen3.6-plus, 60s timeout)
              ├─ 26 LangChain StructuredTool
              ├─ WindowsDesktopAdapter (Win32 FFI via koffi)
              ├─ AccessibilityTreeAdapter (PowerShell UIA)
              └─ GroundTruthVerifier (pixel-diff)
```

### 2.2 Tool Inventory (26 Tools)

| # | Tool | Danger | Description |
|---|---|---|---|
| **Observation (8)** | | | |
| 1 | `screenshot` | safe | Electron desktopCapturer, primary monitor only in LLM response |
| 2 | `get_screen_text` | safe | Tesseract.js OCR on primary monitor (singleton worker) |
| 3 | `get_window_info` | safe | GetForegroundWindow title + rect |
| 4 | `get_window_list` | safe | EnumWindows with cached hWndMap |
| 5 | `get_element_info` | safe | Focused UIA element via PowerShell |
| 6 | `search_elements` | safe | Recursive UIA tree search (max depth 5) |
| 7 | `get_selected_text` | safe | Ctrl+C → clipboard read → restore |
| 8 | `file_operations` | varies | 7 sub-actions: list/read/write/copy/move/delete/exists |
| **Mouse (6)** | | | |
| 9 | `click` | safe | SetCursorPos + SendInput |
| 10 | `double_click` | safe | Two SendInput clicks |
| 11 | `right_click` | safe | MOUSEEVENTF_RIGHTDOWN/UP |
| 12 | `move_mouse` | safe | SetCursorPos only |
| 13 | `hover` | safe | Move + 30ms delay |
| 14 | `drag` | safe | Down → move → Up |
| **Keyboard (2)** | | | |
| 15 | `type_text` | safe | Unicode char-by-char (surrogate pairs) |
| 16 | `key_combo` | safe | Virtual key codes for modifiers + keys |
| **Window Management (5)** | | | |
| 17 | `focus_window` | safe | SetForegroundWindow |
| 18 | `minimize_window` | safe | ShowWindow SW_MINIMIZE |
| 19 | `maximize_window` | safe | ShowWindow SW_MAXIMIZE |
| 20 | `restore_window` | safe | ShowWindow SW_RESTORE |
| 21 | `close_window` | safe | WM_CLOSE via PostMessageW |
| **Utility (5)** | | | |
| 22 | `launch_app` | safe | ShellExecuteW + optional 10s window poll |
| 23 | `wait` | safe | duration / window_change / text_appears (OCR) |
| 24 | `clipboard` | safe | Read/write/clear Electron clipboard |
| 25 | `click_element` | safe | UIA search + coordinate click by name |
| 26 | `scroll` | safe | SendInput MOUSEEVENTF_WHEEL |

### 2.3 Safety Mechanisms

- **Danger policy table**: 24 of 26 tools classified as `'safe'` (auto-executed). Only `delete_file` is `'dangerous'` (HITL), `write_file`/`copy_file`/`move_file` are `'reviewable'` (HITL).
- **GroundTruthVerifier**: Takes baseline screenshot, computes pixel diff after action (1/16 sampling). `hardReject` is **never set to `true`** in practice — soft feedback only.
- **LangGraph `interrupt()`**: Used for HITL confirmation on reviewable/dangerous actions.

### 2.4 Integration

- Integrated into LangGraph research agent via `desktopAgentNode`
- IPC flow: `chat:sendStreamMessage` → LangGraph stream → `desktop:confirmation-request` → renderer dialog → `chat:resumeGraph`
- Progress events via EventEmitter
- Context trimming at 40 messages

---

## 3. Competitor Deep Dives

### 3.1 Accomplish (accomplish-ai/accomplish) — 10,748 stars, MIT

**What it is**: AI desktop coworker (Electron + React + TypeScript — same stack as ours) with a CLI agent engine (OpenCode).

**Key capabilities we lack**:
- **Cross-platform**: macOS, Windows 11, Ubuntu (ARM64 + x64)
- **Multi-provider LLM**: Anthropic, OpenAI, Google, xAI, DeepSeek, Moonshot, Ollama, LM Studio (12+ providers)
- **Built-in computer-use model** (no API key required)
- **Chrome extension** for controlled browser automation
- **Custom Skills**: saveable reusable task templates
- **Multi-workspace**: isolated task histories
- **AES-256-GCM keychain encryption** for API keys
- **MCP server integration** for standardized tool interfaces
- **Parallel task execution** with isolated contexts

**Relevance**: Closest architectural match to our project (Electron + React + TypeScript). Their multi-provider LLM support, Chrome extension for browser automation, and custom skills system are the most directly applicable gaps.

---

### 3.2 Agent-S / Agent-S3 (simular-ai/Agent-S) — 11,228 stars, ICLR/COLM 2025

**What it is**: Academic research framework achieving human-level performance (72.6% on OSWorld, surpassing 72.36% human baseline).

**Key innovations we lack**:
- **Manager-Worker hierarchy**: Manager plans subtasks; dedicated Workers execute each subtask independently
- **Dual memory system**:
  - *Narrative Memory*: Abstractive strategy summaries (successes + failures)
  - *Episodic Memory*: Complete successful trajectories indexed by `<query, subtask, context>`
- **Agent-Computer Interface (ACI)**: Screenshot + accessibility tree dual perception with OCR-augmented AT (unique integer IDs per element)
- **Bounded action space**: 11 primitives, one discrete action per timestep with immediate feedback
- **Self-Evaluator**: Generates textual rewards as strategy summaries (HRL-style without RL)
- **Self-supervised Exploration**: Bootstraps memory via synthetic tasks
- **Trajectory Reflector**: Per-worker observation of entire episode with reflective advice
- **Experience-augmented hierarchical planning**: Web search + narrative memory fusion → topologically sorted subtask queue

**Relevance**: The Manager-Worker hierarchy, dual memory, and ACI patterns are directly applicable. Our flat ReAct loop (single LLM, no memory, no hierarchical planning) is the single biggest architectural gap vs. state-of-the-art.

---

### 3.3 OS-Copilot / FRIDAY (OS-Copilot/OS-Copilot) — 1,760 stars

**What it is**: Self-improving embodied conversational agent for OS task automation (Python, 91.8%).

**Key capabilities we lack**:
- **Terminal/code execution**: Direct shell command execution as a primary tool
- **Multimedia application control**: Audio/video playback, media apps
- **Third-party application integration**: Deep integration with specific apps
- **Self-learning module (SelfLearner)**: Autonomous improvement from experience
- **Planning module (FridayPlanner)**: Structured task decomposition
- **Retrieval module (FridayRetriever)**: Information retrieval across OS elements
- **Vision integration** (friday_vision, added 2024-09)
- **Front-end interface** (2024-06)
- **Cross-platform**: Linux primary, with Windows/macOS support

**Relevance**: FRIDAY's terminal/shell execution tool is a major gap — many OS tasks (installing software, running scripts, managing services) cannot be done through GUI automation alone. The self-learning module is also noteworthy.

---

### 3.4 ScreenHand (manushi4/Screenhand) — 3 stars, MIT

**What it is**: MCP server for desktop automation with 111 tools across 7 architectural layers. Remarkably sophisticated despite small star count.

**Key capabilities we lack**:
- **7-layer architecture**: Control → Tool Knowledge → Awareness → Autonomy → Learning → Tool Mastery → App Mastery Map
- **Chrome DevTools Protocol (CDP)**: 15 browser automation tools (tab management, DOM querying, form filling, stealth mode)
- **Smart fallback execution**: Auto method selection (Accessibility → CDP → OCR → coordinates)
- **3-rate multi-source perception**: FAST (100ms AX/CDP), MEDIUM (300ms tree polling), SLOW (1000ms screenshot diff + ROI OCR)
- **WorldModel**: Per-session app state tracking (windows, controls, dialogs, focus, scroll)
- **6 learning policies**: Locator stability, sensor effectiveness, recovery ranking, pre-failure patterns, adaptive timing, navigation topology (Bayesian)
- **App Mastery Map**: Persistent spatial blueprints, auto-recorded from observation (8 features including I/O contracts with reliability scoring)
- **38 curated reference JSONs**: App-specific selectors, shortcuts, flows, known errors
- **28 executable playbooks**: Deterministic recorded workflows (0 LLM calls for known tasks)
- **Intelligence wrapper**: Pre-call error checks + post-call learning on every tool call
- **Community playbook sharing**: Network effects via shared validated playbooks
- **12ms native AX response, 10ms CDP, ~2-3s for 10-step known workflows**
- **S75 PII redaction**

**Relevance**: ScreenHand is the most comprehensive reference for what a production-grade desktop agent looks like. The CDP browser integration, WorldModel state tracking, learning/memory system, and App Mastery Map are all directly applicable. The intelligence wrapper pattern (pre/post call pipelines) could be layered onto our existing tools.

---

### 3.5 Open Interpreter (OpenInterpreter/open-interpreter)

**What it is**: Local-first desktop agent with code execution, native OS control, and document editing.

**Key capabilities we lack**:
- **Code execution engine**: Direct Python/shell execution as primary interaction mode
- **Native OS app integration** (macOS): Calendar, Contacts, Mail, SMS control
- **Point Model**: Local vision model for precise visual control location without coordinates
- **Document editors**: PDF form filling, Excel (pivot tables, charts, formulas), Word editing
- **Multi-provider LLM**: OpenAI, Anthropic, Groq, OpenRouter, Ollama
- **Jupyter notebook export**
- **Full approval workflow**: Code execution with human approval gates

**Relevance**: The code execution engine and document editors are significant gaps. Many desktop tasks are more efficiently solved by writing/executing code than by GUI automation.

---

### 3.6 vnc-use (mayflower/vnc-use)

**What it is**: LangGraph agent for desktop automation via VNC protocol.

**Key capabilities we lack**:
- **VNC transport layer**: Platform-agnostic remote desktop control (no OS-specific FFI needed)
- **Multi-model support**: Gemini 2.5 Computer Use, Anthropic Claude Haiku 4.5
- **Remote execution**: Can control machines across the network

**Relevance**: VNC-based approach eliminates the need for platform-specific native code. Useful as an alternative input mechanism.

---

### 3.7 OS AI Computer Use (iliyaZelenko/os-ai-computer-use) — 75% OSWorld

**What it is**: Production-ready cross-platform computer use agent (Flutter UI).

**Key capabilities we lack**:
- **Cross-platform**: macOS, Windows, Linux, Web
- **OpenAI GPT + Anthropic Claude** support
- **Multi-monitor awareness**: Full virtual desktop coordinate space
- **75% OSWorld benchmark score**
- **Developer API**

**Relevance**: Proven high benchmark performance. Multi-monitor coordinate handling is a direct gap in our implementation.

---

### 3.8 Anthropic Computer Use (Reference Implementation)

**What it is**: The canonical computer use API from Anthropic.

**Actions we lack vs. Anthropic**:
- `hold_key` (press and hold a key, release later)
- `left_mouse_down` / `left_mouse_up` (granular mouse control)
- `triple_click`
- `cursor_position` (query current cursor position)
- `zoom` (accessibility zoom)

**Relevance**: Anthropic's action set is the de facto standard. Our tool set covers most but misses the finer-grained controls.

---

### 3.9 OpenAI Codex — Background Computer Use (April 2026)

**What it is**: OpenAI's Codex desktop app (3M weekly users) with production computer use released April 16, 2026. It represents the first deployment of real computer-use capabilities outside cloud sandboxes by a major AI company — Codex touches actual files, apps, and networks.

**Key capabilities we lack**:

- **Background computer use**: Codex operates macOS apps by "seeing, clicking, and typing with its own cursor" while the user works in other apps simultaneously. It captures screenshots, reasons over pixels and accessibility data, then issues mouse/keyboard events through macOS Accessibility and Screen Recording APIs.
- **Parallel agent isolation**: Multiple Codex agents can work in parallel without interfering with user's own work. (Note: currently a shared desktop-control surface; community is requesting per-agent session IDs, window/app leases, and optional virtual displays.)
- **In-app browser (Atlas-based)**: Built-in web browser with direct commenting on pages for precise agent instructions. Useful for frontend dev and web tasks. Currently limited scope, with plans for full browser control.
- **Persistent memory**: Remembers user preferences, corrections, and gathered context across sessions. Can proactively suggest work based on previous context.
- **Scheduled automations**: Can schedule future work and wake up automatically to continue long-term tasks across days or weeks.
- **90+ plugin ecosystem**: Integrates JIRA, CircleCI, GitLab, Microsoft Suite, etc. Extensible plugin architecture for tool integration.
- **Safety guardrails**:
  - *Sandbox mode*: Defines technical boundaries — where Codex can write, network access, protected paths
  - *Approval policy*: Determines when user approval is required
  - *Refusal list*: Deliberately refuses to drive terminal apps, Codex itself, or security/admin prompts (prevents sandbox-escaping)
  - *Network defaults*: Network access disabled by default; write permissions limited to active workspace
  - *Audit logging*: Agent-native logs for auditing, managed network policies with domain allow-lists
- **GitHub PR review**: Inline diff inspection with PR review comments
- **SSH remote devbox connections** (alpha): Remote development machine access
- **macOS seatbelt sandbox extensions**: Structured macOS additional permissions integrated with sandbox execution

**Limitations (as of April 2026)**:
- macOS-only at launch (no Windows/Linux)
- Unavailable in EU, UK, Switzerland
- Single shared desktop-control surface (parallel isolation is a community request, not fully solved)
- Refuses terminal driving (by design for safety)

**Relevance**: Codex is the most important competitive reference because it is the **first production computer use deployment by a major AI provider** (not academic/open-source). Its safety architecture (sandbox + approval + refusal lists), background isolation pattern, memory/scheduling features, and plugin ecosystem are directly applicable. The deliberate refusal to drive terminal apps is notable given our desktop agent is terminal-free. The shared desktop-control surface limitation also highlights that multi-agent isolation remains unsolved even at OpenAI scale.

---

## 4. Feature Gap Matrix

| Capability | Ours | Accomplish | Agent-S3 | ScreenHand | Open Interpreter | OS-Copilot | Codex | Priority |
|---|---|---|---|---|---|---|---|---|
| **Core Input** | | | | | | | |
| Screenshot | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (screen capture API) | — |
| Click (coordinate) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (own cursor) | — |
| Type text | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Key combo | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Scroll | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | — |
| Drag | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | — |
| Double click | ✅ | ✅ | ✅ | ✅ | — | — | ✅ | — |
| Right click | ✅ | — | ✅ | ✅ | ✅ | — | ✅ | — |
| Hover | ✅ | — | — | ✅ | — | — | ✅ | — |
| Hold key | ❌ | — | ✅ | ✅ | — | — | — | 🔴 |
| Mouse down/up | ❌ | — | — | ✅ | — | — | — | 🟡 |
| Triple click | ❌ | — | — | ✅ | — | — | — | 🟡 |
| Cursor position query | ❌ | — | — | ✅ | — | — | — | 🟡 |
| Zoom | ❌ | — | — | ✅ | — | — | — | 🟡 |
| **Observation** | | | | | | | |
| OCR | ✅ | ✅ | ✅ | ✅ | — | — | ✅ (pixel reasoning) | — |
| UI Accessibility Tree | ✅ | — | ✅ | ✅ | — | ✅ | ✅ (macOS AX API) | — |
| Window list | ✅ | ✅ | — | ✅ | — | — | — | — |
| Window info | ✅ | ✅ | — | ✅ | — | — | — | — |
| Selected text | ✅ | — | — | ✅ | — | — | — | — |
| **Browser** | | | | | | | |
| CDP browser control | ❌ | ✅ (ext) | — | ✅ (15 tools) | ✅ | — | ✅ (Atlas-based in-app) | 🔴 |
| DOM querying | ❌ | — | — | ✅ | ✅ | — | — | 🔴 |
| Form filling | ❌ | — | — | ✅ | ✅ | — | ✅ (in-app browser) | 🔴 |
| Stealth/anti-detect | ❌ | — | — | ✅ | — | — | — | 🟡 |
| Tab management | ❌ | — | — | ✅ | — | — | ✅ | 🟡 |
| **File System** | | | | | | | |
| File read/write | ✅ | ✅ | — | — | ✅ | ✅ | — |
| File copy/move/delete | ✅ | ✅ | — | — | ✅ | ✅ | — |
| Directory listing | ✅ | ✅ | — | — | ✅ | ✅ | — |
| Path traversal protection | ❌ | ✅ | — | — | — | — | 🟡 |
| **Terminal / Shell** | | | | | | | | |
| Code execution | ❌ | — | — | — | ✅ | ✅ | ❌ (refuses) | 🔴 |
| Shell commands | ❌ | — | — | — | ✅ | ✅ | ❌ (refuses) | 🔴 |
| Script execution | ❌ | — | — | — | ✅ | ✅ | ❌ (refuses) | 🟡 |
| **Application Control** | | | | | | | |
| Launch app | ✅ | ✅ | — | ✅ | — | ✅ | — |
| Window management | ✅ | ✅ | — | ✅ | — | — | — |
| Native app integration | ❌ | — | — | ✅ | ✅ (macOS) | ✅ | 🟡 |
| **Platform Support** | | | | | | | |
| Windows | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | — |
| macOS | ❌ | ✅ | ❌ | ✅ | ✅ (partial) | ❌ | ✅ | 🔴 |
| Linux | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | 🔴 |
| **Architecture** | | | | | | | |
| ReAct loop | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ (agent loop) | — |
| Hierarchical planning | ❌ | — | ✅ | ✅ | — | ✅ | — | 🔴 |
| Manager-Worker pattern | ❌ | — | ✅ | ✅ | — | ✅ | — | 🟡 |
| **Memory & Learning** | | | | | | | |
| Experience memory | ❌ | — | ✅ (dual) | ✅ (6 policies) | — | ✅ | ✅ (persistent mem) | 🔴 |
| Strategy retrieval | ❌ | — | ✅ | ✅ | — | — | ✅ (context recall) | 🔴 |
| Playbook/workflow recording | ❌ | ✅ (custom skills) | — | ✅ (28 playbooks) | — | — | — | 🟡 |
| Self-learning/improvement | ❌ | — | — | ✅ | — | ✅ | — | 🟡 |
| Self-exploration | ❌ | — | — | — | — | — | — | 🟡 |
| **State & Context** | | | | | | | |
| WorldModel / state tracking | ❌ | — | — | ✅ | — | — | — | 🟡 |
| App mastery maps | ❌ | — | — | ✅ | — | — | — | 🟡 |
| Per-app knowledge base | ❌ | — | — | ✅ (38 JSONs) | — | — | — | 🟡 |
| Multi-rate perception | ❌ | — | — | ✅ (3-rate) | — | — | — | 🟡 |
| Context awareness | ❌ | — | — | ✅ | — | — | ✅ (per-session mem) | 🟡 |
| **Safety & Security** | | | | | | | |
| HITL confirmation | ✅ | — | — | — | ✅ | — | ✅ (approval policy) | — |
| Multi-tier danger policy | ⚠️ basic | — | — | — | — | — | ✅ (sandbox+approval) | 🟡 |
| Shell command blocking | ❌ | — | — | — | — | — | ✅ (refuses terminal) | 🔴 |
| PII redaction | ❌ | — | — | ✅ (S75) | — | — | — | 🟡 |
| Pattern-based interception | ❌ | — | — | — | — | — | ✅ (refusal list) | 🔴 |
| Path traversal protection | ❌ | ✅ | — | — | — | — | ✅ (seatbelt sandbox) | 🟡 |
| Cost/token limits | ❌ | — | — | — | — | — | — | 🟡 |
| Iteration caps | ⚠️ (25 steps) | — | — | — | — | — | — | 🟡 |
| **Verification** | | | | | | | |
| Pixel-diff verification | ✅ | — | — | ✅ | — | — | — |
| Action effect verification | ⚠️ soft only | — | — | ✅ | — | — | 🔴 |
| Post-condition checking | ❌ | — | — | ✅ | — | — | 🟡 |
| Self-evaluation | ❌ | — | ✅ | ✅ | — | — | 🟡 |
| **Multi-Monitor** | | | | | | | |
| Multi-monitor awareness | ⚠️ capture only | — | — | ✅ | — | — | 🟡 |
| Full coordinate space | ❌ | — | — | ✅ | ✅ | — | 🟡 |
| **Other** | | | | | | | |
| Multi-provider LLM | ❌ (1) | ✅ (12+) | — | — | ✅ (5) | — | ✅ (OpenAI) | 🔴 |
| MCP server mode | ❌ | ✅ | — | ✅ | — | — | ✅ (MCP helper) | 🟡 |
| Document editors | ❌ | — | — | — | ✅ | — | — | 🟡 |
| Voice capabilities | ❌ | — | — | — | — | — | — | 🟢 |
| Custom skills/templates | ❌ | ✅ | — | ✅ | — | — | ✅ (90+ plugins) | 🟡 |
| Scheduled automations | ❌ | — | — | — | — | — | ✅ | 🟡 |
| Background agent isolation | ❌ | — | — | — | — | — | ⚠️ (shared surface) | 🔴 |
| Plugin ecosystem | ❌ | — | — | — | — | — | ✅ (90+) | 🟡 |
| In-app browser | ❌ | ✅ (ext) | — | — | ✅ | — | ✅ (Atlas) | 🟡 |

---

## 5. Detailed Gap Analysis

### 5.1 CRITICAL GAPS (Must-Have for Production Viability)

#### 5.1.1 Cross-Platform Support (macOS + Linux)
**Status**: Windows-only (user32.dll, shell32.dll, PowerShell UIA)
**Competitors**: All major projects support at least 2 platforms; Accomplish supports all 3
**Impact**: Limits user base to Windows only; excludes macOS (primary Raycast audience) and Linux (common dev environment)
**Recommended approach**:
- **macOS**: Swift accessibility bridge (similar to ScreenHand's approach) + AppleScript for native app control + `osascript` for keyboard/mouse via CGEvent
- **Linux**: xdotool/scrot/xclip for X11, ydotool/grim/wl-clipboard for Wayland (following Claude Desktop for Linux patch pattern)
- **Abstraction**: Create a `DesktopAdapter` interface (already exists in `types.ts`) with platform-specific implementations

#### 5.1.2 Browser Automation (CDP Integration)
**Status**: No browser-specific tools; browser interaction limited to coordinate-based clicks/typing
**Competitors**: ScreenHand (15 CDP tools), Accomplish (Chrome extension), Open Interpreter (LLM-first browser), Anthropic (built-in)
**Impact**: Browser tasks are the most common desktop automation use case. Coordinate-based browser interaction is unreliable and slow.
**Recommended approach**:
- Integrate Chrome DevTools Protocol via `chrome-remote-interface` (already available in npm ecosystem)
- Implement: navigate, get DOM, click element, fill form, execute JavaScript, get page text, screenshot page
- Support both Chrome and Electron apps via CDP
- Add stealth mode options (user-agent override, WebGL fingerprinting protection)

#### 5.1.3 Code Execution / Terminal Access
**Status**: No terminal/shell execution capability
**Competitors**: Open Interpreter (primary mode), OS-Copilot (primary tool), Accomplish (CLI engine)
**Impact**: Many tasks (installing software, running scripts, managing services, data processing) are impossible or impractical via GUI alone
**Recommended approach**:
- Add `execute_command` tool with configurable timeout
- Implement output streaming for long-running commands
- Add sandboxing: configurable allowlist/blocklist of commands
- Support both PowerShell and bash depending on platform

#### 5.1.4 Multi-Provider LLM Support
**Status**: Single provider (ChatOpenAI compatible endpoint, currently qwen3.6-plus)
**Competitors**: Accomplish (12+ providers), Open Interpreter (5 providers), OS AI Computer Use (OpenAI + Anthropic)
**Impact**: Vendor lock-in; cannot leverage best model for specific task; no fallback if API is unavailable
**Recommended approach**:
- Abstract LLM provider behind interface (following LangChain's existing abstraction)
- Support at minimum: OpenAI, Anthropic (Claude), Google (Gemini), local (Ollama)
- Add model selection UI in renderer
- Implement per-task model routing (e.g., cheaper model for simple tasks, powerful model for complex)

### 5.2 HIGH PRIORITY GAPS

#### 5.2.1 Memory & Learning from Experience
**Status**: Stateless — every task starts fresh, no learning from prior interactions
**Competitors**: Agent-S (dual memory: narrative + episodic), ScreenHand (6 learning policies + playbooks), FRIDAY (SelfLearner module)
**Impact**: Repeated mistakes, no improvement over time, no knowledge transfer between tasks
**Recommended approach**:
- Start with simple **episodic memory**: store successful task trajectories (task description → tool sequence → outcome)
- Implement retrieval: on new task, search for similar past tasks using embedding similarity
- Add **failure memory**: store failed attempts with error signals to avoid repeating mistakes
- Phase 2: narrative memory (abstractive strategy summaries)
- Phase 3: self-exploration and curriculum learning

#### 5.2.2 Hierarchical Planning
**Status**: Flat ReAct loop — single LLM generates one action at a time up to 25 steps
**Competitors**: Agent-S (Manager-Worker hierarchy), ScreenHand (goal planner + deterministic planner), FRIDAY (FridayPlanner)
**Impact**: Poor long-horizon planning; single LLM must both plan and execute simultaneously; limited to 25-step horizon
**Recommended approach**:
- Introduce **two-level planning**: high-level plan generation → subtask execution
- Plan format: ordered list of subtasks with preconditions and postconditions
- Each subtask executed by the existing ReAct loop with its own step budget
- Post-condition verification between subtasks (did the subtask actually achieve its goal?)

#### 5.2.3 Safety & Security Hardening
**Status**: Basic danger policy (24/26 tools are `'safe'`), verifier never hard-rejects, no shell command filtering
**Competitors**: CoWork-OS (pattern blocking for `sudo`, `rm -rf /`, etc.), AgentTrust (95% accuracy interception), ScreenHand (S75 PII redaction), OpenAI Codex (sandbox + approval + refusal lists)
**Impact**: Agent can execute destructive actions (close windows, type arbitrary text, delete files) without user approval. No protection against prompt injection or malicious task descriptions.
**Recommended approach**:
- Reclassify danger policy: move `close_window`, `drag`, `delete_file` to `'dangerous'`; move `write_file`, `copy_file`, `move_file` to `'reviewable'`
- Add shell command pattern blocking (if terminal tool is added): block `sudo`, `rm -rf`, `mkfs`, `curl|bash`
- Implement PII redaction in tool outputs (screen text, file contents, clipboard)
- Add token/cost budget tracking per session
- Consider AgentTrust-style shell deobfuscation if terminal tool is added
- **Codex safety model**: OpenAI uses a two-layer approach:
  1. *Sandbox mode* (technical boundaries): Define where Codex can write, network access (default: disabled), protected paths. Uses macOS seatbelt profile extensions.
  2. *Approval policy* (user gating): Determines when Codex must request user approval
  3. *Refusal list*: Codex deliberately refuses to drive terminal apps, Codex itself, or security/admin prompts — a pattern we can adopt (e.g., refuse to interact with system settings, password managers, banking apps)

#### 5.2.4 Verification & Post-Condition Checking
**Status**: GroundTruthVerifier exists but `hardReject` is never true; only soft HumanMessage feedback
**Competitors**: ScreenHand (deterministic postconditions per action), Agent-S (Self-Evaluator with textual rewards)
**Impact**: No enforcement of action success; LLM may continue executing based on false assumptions
**Recommended approach**:
- Fix verifier to actually set `hardReject = true` when action has no effect
- Add per-action post-condition definitions (e.g., `click` → element at coordinates should have changed state)
- Implement verification timeout: if verification fails, retry action up to N times before aborting

### 5.3 MEDIUM PRIORITY GAPS

#### 5.3.1 WorldModel / State Tracking
**Status**: No persistent state about the desktop environment between tool calls
**Competitors**: ScreenHand (WorldModel with per-session app state, EntityTracker, FusionPipeline)
**Impact**: LLM must rediscover the desktop state on every step; no accumulation of knowledge about open windows, focused apps, visible dialogs
**Recommended approach**:
- Simple WorldModel: track current focused window, open applications, visible dialogs, last cursor position
- Update on every tool execution (derived from tool results)
- Inject into system prompt as context

#### 5.3.2 Multi-Monitor Coordinate Awareness
**Status**: `clampToScreen` only considers primary display; multi-monitor captures available but only primary sent to LLM
**Competitors**: OS AI Computer Use (full virtual desktop space), vnc-use (full desktop via VNC)
**Impact**: Cannot interact with elements on secondary monitors; coordinates may be wrong on multi-monitor setups
**Recommended approach**:
- Use Electron `screen.getAllDisplays()` to build full coordinate space
- Map virtual coordinates to physical monitors
- Include all monitors in multimodal message (not just primary)

#### 5.3.3 Structured UI Knowledge Base
**Status**: No application-specific knowledge
**Competitors**: ScreenHand (38 reference JSONs, 28 playbooks, App Mastery Map with 8 features)
**Impact**: Every interaction with every app is from scratch; no accumulation of "this app's Save button is always Ctrl+S"
**Recommended approach**:
- Start with a small knowledge base for common apps (browser, file explorer, VS Code)
- Store: common shortcuts, typical UI element locations, known workflows
- Update from successful task trajectories

#### 5.3.4 Additional Anthropic-Standard Actions
**Status**: Missing: `hold_key`, `left_mouse_down/up`, `triple_click`, `cursor_position`, `zoom`
**Competitors**: Anthropic Computer Use (all available)
**Impact**: Certain interactions require finer-grained control (e.g., selecting text via mouse drag requires down/move/up, not just drag)
**Recommended approach**:
- Add these actions to `input-simulation.ts` and corresponding tools
- `hold_key` and `left_mouse_down/up` are straightforward SendInput additions
- `cursor_position` via `GetCursorPos` Win32 API
- `triple_click` = three rapid clicks
- `zoom` via accessibility zoom API or scroll wheel emulation

#### 5.3.5 Path Traversal Protection for File Operations
**Status**: `file_operations` tool accepts any path with no validation
**Competitors**: Accomplish, CoWork-OS (path traversal blocking)
**Impact**: Agent could read/write files outside intended directories
**Recommended approach**:
- Add configurable sandbox directory for file operations
- Validate all paths: resolve to absolute, check against sandbox
- Block access to system directories (Windows, System32, etc.)

#### 5.3.6 MCP Server Mode
**Status**: Internal LangChain tools only; no external MCP server interface
**Competitors**: ScreenHand (111 MCP tools), OSWright (35 MCP tools)
**Impact**: Cannot be used as a tool by external AI agents (Claude Desktop, Cursor, etc.)
**Recommended approach**:
- Expose key desktop tools as MCP server using `@modelcontextprotocol/sdk`
- Start with observation tools (screenshot, OCR, window list) + basic interaction tools (click, type)
- Phase 2: full tool set with proper tool descriptions

#### 5.3.7 Background Computer Use & Agent Isolation
**Status**: No background agent capability; ReAct loop owns the screen during execution
**Competitors**: OpenAI Codex (April 2026: first production computer use by a major AI company)
**Key Codex pattern**: Uses macOS Accessibility + Screen Recording APIs to operate apps with its own cursor while user works in other apps. Issues mouse/keyboard events through OS APIs. Captures screenshots and reasons over pixels + accessibility data.
**Gap details**:
- **Own cursor control**: Codex has its own cursor that doesn't interfere with user's cursor (on macOS). We use `SetCursorPos` which hijacks the physical cursor.
- **Background operation**: Codex agents can work while user uses other apps. Our agent takes over the full screen.
- **Multi-agent isolation (unsolved even for Codex)**: Codex currently uses a shared desktop-control surface. Community requests include per-agent session IDs, window/app leases, and optional virtual displays. This is an industry-wide unsolved problem.
- **macOS vs Windows**: Codex uses native macOS Accessibility APIs. We use Win32 FFI which cannot provide cursor isolation.
**Recommended approach**:
- Short-term: Accept single-agent screen takeover for Windows (no isolation possible without OS-level virtual displays)
- Medium-term: Research Windows virtual desktop APIs or sandboxed desktop environments for future isolation
- Track Windows App SDK for any emerging virtual desktop/isolation APIs
- Consider "focus-only" mode that only interacts with a specific window rather than full screen

#### 5.3.8 Persistent Memory & Context Recall
**Status**: Completely stateless between sessions
**Competitors**: OpenAI Codex (persistent memory across sessions), Agent-S (dual memory system)
**Codex pattern**: Remembers user preferences, corrections, and gathered context across sessions. Can proactively suggest work based on previous context. Memory is user-scoped and persistent.
**Recommended approach**:
- Leverage existing better-sqlite3 infrastructure for persistent storage
- Start with simple preference storage (user's common apps, frequently used workflows)
- Store failed task outcomes with error signals for recall
- Cross-reference with Section 5.2.1 (Memory & Learning from Experience) for episodic/narrative memory

---

## 6. Recommended Implementation Roadmap

### Phase 1: Foundation (1-2 weeks)
1. **Fix verifier** — Make `hardReject` actually trigger; add per-action post-condition checking
2. **Reclassify danger policy** — Move destructive actions to `'dangerous'`/`'reviewable'`
3. **Multi-monitor coordinates** — Full virtual desktop coordinate space
4. **Add missing Anthropic actions** — `hold_key`, `mouse_down/up`, `cursor_position`
5. **Path traversal protection** — Sandbox for file operations

### Phase 2: Core Extensions (2-4 weeks)
6. **Code execution / terminal tool** — With command filtering and timeout
7. **CDP browser automation** — Navigate, DOM query, click, fill, screenshot
8. **Multi-provider LLM** — At minimum: OpenAI, Anthropic, Ollama
9. **WorldModel** — Basic state tracking between tool calls

### Phase 3: Intelligence (4-8 weeks)
10. **Episodic memory** — Store and retrieve successful task trajectories
11. **Hierarchical planning** — Two-level: plan → subtask execution
12. **Failure memory** — Store and avoid repeating mistakes
13. **UI knowledge base** — Common app shortcuts and patterns
14. **Persistent memory** — Cross-session context recall (inspired by Codex persistent memory)
15. **Safety sandbox** — Technical boundaries + approval policy + refusal lists (Codex model)

### Phase 4: Production Hardening (4-8 weeks)
14. **macOS support** — Swift accessibility bridge + AppleScript
15. **Linux support** — xdotool/ydotool adapters
16. **PII redaction** — Screen text, file contents, clipboard
17. **MCP server mode** — Expose tools to external agents
18. **Cost/token budgeting** — Per-session limits
19. **Plugin ecosystem** — Extensible plugin system for new tool integrations (Codex 90+ plugin model)
20. **Scheduled automations** — Wake-and-continue task execution across sessions

### Phase 5: Advanced (8+ weeks)
19. **Self-exploration** — Synthetic task generation for bootstrapping
20. **Narrative memory** — Abstractive strategy summaries
21. **Playbook recording** — Save successful workflows
22. **App Mastery Maps** — Auto-build spatial blueprints
23. **Multi-rate perception** — Different sensing at different frequencies

---

## 7. Tech Stack Landscape — What Similar Projects Use

### 7.1 Project-by-Project Tech Stack Comparison

| Project | Language(s) | UI Framework | Agent Framework | LLM Integration | Desktop APIs | Browser Automation | IPC / Transport |
|---|---|---|---|---|---|---|---|
| **Our Project** | TypeScript 100% | React 19 + Vite | LangGraph.js | LangChain + ChatOpenAI | Win32 FFI (koffi), PowerShell UIA, Electron desktopCapturer | None (coordinate-only) | Electron IPC |
| **Accomplish** | TypeScript 92.6% | React + Electron | OpenCode (custom) | Multi-provider (12+): Anthropic, OpenAI, Google, xAI, DeepSeek, Ollama, LM Studio | Electron IPC + node-pty | Chrome extension | Electron IPC, stdio |
| **Agent-S / S3** | Python 99.7% | CLI only | Custom hierarchical (Manager-Worker) | OpenAI, Anthropic, Azure, vLLM | PyAutoGUI, platform-specific bridges | None | Stdio |
| **ScreenHand** | TypeScript 90.6%, Swift 3.4%, C# 2.3% | CLI / MCP server | Custom 7-layer ReAct | OpenAI, Anthropic via MCP | Native AX (macOS), UIA (Windows) | CDP (15 tools) | MCP (stdio) |
| **Open Interpreter** | Python 98.5% | CLI (+ desktop in dev) | Custom ReAct | LiteLLM (multi-provider) | PyAutoGUI, Selenium | Selenium, Playwright | Stdio, FastAPI/HTTP |
| **OS-Copilot / FRIDAY** | Python 91.8% | CLI + web frontend (2024-06) | Custom with planning/learning modules | OpenAI, Claude, open-source via LiteLLM | Platform-specific shells, multimedia APIs | Playwright | Stdio, HTTP |
| **OS AI Computer Use** | Python 51.6%, Dart 38.4% | Flutter (MobX + Provider) | Custom loop | OpenAI GPT, Anthropic Claude | Platform drivers: macOS (CGEvent), Windows (Win32), Linux (xdotool) | None | WebSocket + JSON-RPC 2.0 |
| **vnc-use** | TypeScript | CLI | LangGraph | Gemini, Anthropic | VNC protocol | None | VNC |
| **Anthropic Computer Use** | Python (reference) | CLI | Anthropic API loop | Claude Sonnet/Opus | X11/Wayland/macOS accessibility | Built-in (browser tab) | Stdio |
| **OpenAI Codex** | TypeScript + Rust | Electron desktop app | Custom agent loop | OpenAI (GPT-4.x, o-series) | macOS Accessibility + Screen Recording APIs | Atlas-based in-app browser | MCP (internal helper), stdio |

### 7.2 Key Pattern Analysis

#### Frontend / UI Patterns

| Approach | Projects | Share | Notes |
|---|---|---|---|
| **Electron + React + TypeScript** | Our project, Accomplish | 2/9 | Dominant for desktop agents with rich UI; same as Raycast |
| **CLI-only (no GUI)** | Agent-S, Open Interpreter, OS-Copilot, Anthropic CU | 4/9 | Research-grade or developer-focused; no consumer-facing UI |
| **Flutter + Python backend** | OS AI Computer Use | 1/9 | Cross-platform with single UI codebase; separates UI from execution |
| **CLI + optional web UI** | FRIDAY (added 2024-06) | 1/9 | Hybrid: CLI for power users, web for monitoring |
| **MCP server (no UI)** | ScreenHand | 1/9 | Delegates UI to client (Claude Desktop, Cursor, etc.) |

**Our position**: Electron + React + TypeScript matches Accomplish and the Raycast native stack — the right choice for a polished consumer-facing desktop app.

#### Agent / Orchestration Frameworks

| Approach | Projects | Notes |
|---|---|---|
| **LangGraph / LangGraph.js** | Our project, vnc-use | Graph-based state machines with checkpointing; enables HITL interrupts |
| **Custom hierarchical (Manager-Worker)** | Agent-S, ScreenHand | Two-tier planning → execution; enables experience-augmented planning |
| **Custom ReAct loop** | Open Interpreter, Accomplish (OpenCode), Anthropic CU | Simple single-loop; fast but limited for long-horizon tasks |
| **Custom modular (planner + learner + retriever)** | OS-Copilot/FRIDAY | Separation of concerns enables self-learning module |

**Our position**: LangGraph.js is solid for state management and HITL interrupts. The gap is not the framework but the *graph topology* — we have a flat loop, not a hierarchical Manager-Worker graph.

#### LLM Integration Patterns

| Approach | Projects | Notes |
|---|---|---|
| **Multi-provider (5-12+)** | Accomplish (12+), Open Interpreter (5+ via LiteLLM), Agent-S (4+) | No vendor lock-in; fallback available; per-task model routing |
| **Dual provider** | OS AI Computer Use (OpenAI + Anthropic) | Covers top two models |
| **Single provider (API-native)** | Our project (ChatOpenAI-compatible), OpenAI Codex (OpenAI only) | Simpler but creates vendor dependency; Codex has native computer use |
| **API-native (built-in tool)** | Anthropic Computer Use | Claude's native computer use API — no wrapper needed |

**Key libraries used across projects**:
- **LiteLLM** (Python): Unified LLM API — Open Interpreter, OS-Copilot
- **LangChain**: Our project, Accomplish (tool definitions)
- **Direct API calls**: Agent-S, OS AI Computer Use, Anthropic CU
- **MCP transport**: ScreenHand (as server), Accomplish (as client)

**Our position**: Single ChatOpenAI-compatible endpoint is the narrowest point. LiteLLM or LangChain's multi-model support would provide the same flexibility as 6/9 competitors.

#### Desktop API / Input Simulation

| Approach | Projects | Platform Coverage |
|---|---|---|
| **Win32 FFI (koffi/libffi)** | Our project | Windows only |
| **Native bridges per platform** | ScreenHand (Swift for macOS, C# for Windows), OS AI CU (3 platform drivers) | Full cross-platform |
| **PyAutoGUI** | Open Interpreter, Agent-S | Cross-platform (Python) |
| **AppleScript + CGEvent** | ScreenHand (macOS) | macOS only |
| **xdotool/ydotool** | ScreenHand (Linux), OS AI CU (Linux) | Linux X11/Wayland |
| **PowerShell UI Automation** | Our project | Windows only |
| **node-pty** | Accomplish | Cross-platform pseudo-terminal |
| **VNC protocol** | vnc-use | Platform-agnostic (requires VNC server) |

**Pattern**: Every cross-platform project uses **platform-specific native code** behind an abstraction layer. There is no single cross-platform native API for desktop control.

#### Browser Automation

| Approach | Projects | Tools |
|---|---|---|
| **Chrome DevTools Protocol (CDP)** | ScreenHand (15 tools), Anthropic CU (built-in) | Full DOM access, form filling, JS execution |
| **Selenium / Playwright** | Open Interpreter (both) | Browser automation frameworks |
| **Chrome extension** | Accomplish | Controlled tab access, page content extraction |
| **In-app browser (Atlas-based)** | OpenAI Codex | Built-in browser with direct commenting |
| **None (coordinate-only)** | Our project, Agent-S, OS AI CU, vnc-use | Relies on screenshot + clicks |

**CDP is the dominant pattern**: ScreenHand's 15 CDP tools + Anthropic's built-in browser support show that coordinate-based browser interaction is a dead end for production agents.

**In-app browser emerging**: OpenAI Codex's Atlas-based in-app browser (April 2026) demonstrates a third approach — an embedded browser with direct commenting for agent instruction, rather than CDP-based remote control or Selenium/Playwright automation.

#### Communication / Transport

| Approach | Projects | Notes |
|---|---|---|
| **Electron IPC** | Our project, Accomplish | Standard Electron main↔renderer communication |
| **MCP (stdio)** | ScreenHand | Standardized tool interface; works with any MCP client |
| **WebSocket + JSON-RPC** | OS AI Computer Use | Real-time bidirectional communication |
| **Stdio (CLI)** | Agent-S, Open Interpreter, Anthropic CU | Simple pipe-based interface |
| **HTTP/FastAPI** | Open Interpreter (optional) | REST API for remote access |
| **VNC** | vnc-use | Remote desktop protocol as agent transport |

### 7.3 Tech Stack Recommendations Derived from Landscape

Based on what the 8 most relevant projects use, here are the lowest-risk technology choices for closing our gaps:

| Gap to Close | Recommended Tech | Used By | Rationale |
|---|---|---|---|
| **CDP browser automation** | `puppeteer-core` or `chrome-remote-interface` (npm) | ScreenHand (CDP), Open Interpreter (Playwright) | Both in npm ecosystem; match our TypeScript stack |
| **In-app browser** | Embedded Electron webview + commenting system | OpenAI Codex (Atlas) | Codex demonstrates in-app browser with direct agent commenting — alternative to CDP |
| **Multi-provider LLM** | LangChain's existing `ChatAnthropic`, `ChatGoogleGenerativeAI`, `ChatOllama` + LiteLLM proxy fallback | Accomplish (multi), Open Interpreter (LiteLLM) | Already have LangChain; adding providers is incremental |
| **Terminal execution** | `node-pty` (npm) | Accomplish | Cross-platform pseudo-terminal; same Electron stack |
| **macOS support** | Swift native bridge + AppleScript | ScreenHand (Swift), OS AI CU (CGEvent), Codex (macOS AX API) | Required for accessibility API access on macOS |
| **Linux support** | xdotool/scrot (X11) + ydotool/grim (Wayland) | ScreenHand, OS AI CU | Standard tools; simple FFI or child process wrappers |
| **Memory/persistence** | better-sqlite3 (already in our stack) | Codex (persistent memory), Agent-S (dual memory) | No new dependency; use existing SQLite infrastructure |
| **MCP server mode** | `@modelcontextprotocol/sdk` (npm) | ScreenHand, Codex (MCP helpers) | Official SDK; minimal integration surface |
| **Hierarchical planning** | Additional LangGraph subgraphs (no new framework) | Agent-S (custom) | Extend existing LangGraph graph topology |
| **Safety sandbox** | Configurable allowlists/blocklists + approval gates | Codex (seatbelt + approval + refusal) | Three-layer safety model directly applicable |
| **Plugin ecosystem** | Plugin registry with MCP-based tool definitions | Codex (90+ plugins) | Extensible architecture for third-party tool integrations |

### 7.4 What Nobody Is Using (Negative Signals)

These approaches are notably **absent** across all surveyed projects:

- **No project uses a single cross-platform desktop API** — platform-specific native code is unavoidable
- **No project uses Electron for anything other than the consumer-facing shell** — agent logic runs in Node.js or Python
- **No project relies solely on coordinate-based browser interaction** — CDP or Selenium is standard
- **No project uses pure LLM prompting without structured state management** — all use some form of state machine or explicit planning loop
- **No project uses a Python agent framework from a TypeScript desktop shell** (or vice versa) — agent and UI stay in the same language/runtime
- **No project has solved multi-agent screen isolation** — even OpenAI Codex (April 2026) uses a shared desktop-control surface; per-agent isolation is a community-requested feature
- **No project refuses terminal driving by design except Codex** — Codex deliberately blocks terminal access for safety, while all other projects embrace it as a primary tool

---

## 8. Architecture Diagrams

### 8.1 Our Project — Current Architecture

#### 8.1.1 Full System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Electron Main Process                             │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                      LangGraph Research Agent                        │   │
│  │                                                                      │   │
│  │  __start__ ──► classify ─┬─► fastPath ───► END                       │   │
│  │                          ├─► internalKnowledge ─► quickVerify ─┐      │   │
│  │                          ├─► externalSearchFanOut ─► synthesize┤      │   │
│  │                          ├─► generalChat ──► END               │      │   │
│  │                          ├─► browserAgentNode ──► END          │      │   │
│  │                          ├─► desktopAgentNode ─────────────┐   │      │   │
│  │                          ├─► comparison/form/chart ──► END │   │      │   │
│  │                          └─► replanNode ──┘                ▼   ▼      │   │
│  │                                                    desktopConfirmation│   │
│  └──────────────────────────────────┬──────────────────────────────────┬──┘   │
│                                     │                                  │       │
│  ┌──────────────────────────────┐   │   ┌──────────────────────────┐   │       │
│  │    StatefulBrowserAgent      │   │   │     DesktopAgent          │   │       │
│  │    (Playwright)              │   │   │     (ReAct Loop)          │   │       │
│  │                              │   │   │                          │   │       │
│  │  ┌─────────┐ ┌──────────┐  │   │   │  ┌─────────────────────┐  │   │       │
│  │  │Browser  │ │Browser   │  │   │   │  │  ChatOpenAI         │  │   │       │
│  │  │Tools    │ │Session   │  │   │   │  │  (qwen3.6-plus)     │  │   │       │
│  │  │(navigate│ │Manager   │  │   │   │  └──────────┬──────────┘  │   │       │
│  │  │,click,  │ │          │  │   │   │             │ bindTools   │   │       │
│  │  │fill)    │ └──────────┘  │   │   │  ┌──────────▼──────────┐  │   │       │
│  │  └─────────┘               │   │   │  │  28 LangChain Tools │  │   │       │
│  └──────────────────────────────┘   │   │  │  (toolMap)          │  │   │       │
│                                     │   │  └──────────┬──────────┘  │   │       │
│  ┌──────────────────────────────┐   │   │             │             │   │       │
│  │      MCP Service             │   │   │  ┌──────────▼──────────┐  │   │       │
│  │  MultiServerMCPClient        │   │   │  │ Danger Policy Check │  │   │       │
│  │  (external MCP servers)      │   │   │  │ → HITL interrupt()  │  │   │       │
│  └──────────────────────────────┘   │   │  └──────────┬──────────┘  │   │       │
│                                     │   │             │             │   │       │
│                                     │   │  ┌──────────▼──────────┐  │   │       │
│                                     │   │  │ GroundTruthVerifier │  │   │       │
│                                     │   │  │ (pixel diff)        │  │   │       │
│                                     │   │  └─────────────────────┘  │   │       │
│                                     │   └──────────────┬────────────┘   │       │
│                                     │                  │                │       │
│  ┌──────────────────────────────────┼──────────────────┼────────────────┤       │
│  │        Desktop Services Layer    │                  │                │       │
│  │                                  │                  │                │       │
│  │  ┌──────────────────────┐  ┌─────▼──────────┐  ┌──▼────────────┐  │       │
│  │  │WindowsDesktopAdapter │  │InputSimulation │  │Accessibility  │  │       │
│  │  │(DesktopAdapter impl) │  │                │  │TreeAdapter    │  │       │
│  │  │                      │  │  SetCursorPos  │  │               │  │       │
│  │  │  - getScreenInfo()   │  │  SendInput     │  │  - getFocused │  │       │
│  │  │  - enumerateWindows()│  │  typeText()    │  │  - searchElems│  │       │
│  │  │  - focusWindow()     │  │  pressKeys()   │  │  - treeSnap   │  │       │
│  │  │  - launchApp()       │  │                │  │               │  │       │
│  │  └──────┬───────────────┘  └────────────────┘  └───────┬───────┘  │       │
│  │         │                                              │          │       │
│  │         ▼                                              ▼          │       │
│  │  ┌─────────────────────────────────────────────────────────────┐  │       │
│  │  │                    Native FFI Layer                         │  │       │
│  │  │                                                             │  │       │
│  │  │  koffi ──► user32.dll ──► SendInput, SetCursorPos          │  │       │
│  │  │         ──► shell32.dll ──► ShellExecuteW                   │  │       │
│  │  │  PowerShell UIA ──► IUIAutomation COM ──► accessibility    │  │       │
│  │  │  Electron desktopCapturer ──► screenshots                   │  │       │
│  │  └─────────────────────────────────────────────────────────────┘  │       │
│  └───────────────────────────────────────────────────────────────────┘       │
│                                                                              │
│  ┌───────────────┐ ┌──────────────┐ ┌──────────────┐                        │
│  │ WindowManager │ │IPC Handlers  │ │ Security     │                        │
│  │ (frameless,   │ │ chat:        │ │ Guards       │                        │
│  │  always-on-   │ │ browser:     │ │ contextIso=  │                        │
│  │  top, compact)│ │ mcp:         │ │   true       │                        │
│  │               │ │ window:      │ │ nodeInt=     │                        │
│  │ GlobalShortcut│ │ file:        │ │   false      │                        │
│  │ Alt+Space     │ │ dialog:      │ │ sandbox=true │                        │
│  └───────────────┘ └──────────────┘ └──────────────┘                        │
└─────────────────────────────┬────────────────────────────────────────────────┘
                              │ Electron IPC
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Renderer (React 19 + Vite)                          │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         CommandPalette                                │   │
│  │  ┌─────────────┐ ┌──────────────┐ ┌──────────────┐                   │   │
│  │  │ File Mode   │ │ AI Mode      │ │ Settings     │                   │   │
│  │  │ (Everything │ │ (LangGraph   │ │ Panel        │                   │   │
│  │  │  search)    │ │  streaming)  │ │              │                   │   │
│  │  └─────────────┘ └──────────────┘ └──────────────┘                   │   │
│  │                                                                       │   │
│  │  Hooks: useSearch, useKeyboard, useWindowMode,                        │   │
│  │         useContextAttachments, useRecentFiles, useCommandExecution    │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  Design Token System ──► Tailwind CSS v4 (@theme inline)                     │
│  └─► colors.css, spacing.css, typography.css, motion.css                    │
│      radius.css, shadow.css, z-index.css + semantic/theme.css               │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 8.1.2 Desktop Agent ReAct Loop (Detailed)

```
┌──────────────────────────────────────────────────────────────────────┐
│                     DesktopAgent.runReactLoop()                      │
│                     maxSteps = 25, 60s timeout                       │
│                                                                      │
│  ┌─────────┐                                                         │
│  │ Step 0  │                                                         │
│  │         │                                                         │
│  │ System  │  "Prefer accessibility tree over screenshots.           │
│  │ Prompt  │   Use click_element over coordinate clicking.            │
│  │         │   Screen: 1920x1080"                                    │
│  │         │                                                         │
│  │ Human   │  [screenshot_base64] ← primary monitor capture          │
│  │ Message │  [task: "Close VS Code"]                                │
│  └────┬────┘                                                         │
│       │                                                              │
│       ▼                                                              │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  ChatOpenAI.bindTools(28 tools)                             │    │
│  │                                                              │    │
│  │  Response: tool_calls = [{name: "get_window_list", args}]   │    │
│  └────┬───────────────────────────────────────────────────────┘    │
│       │                                                              │
│       ▼                                                              │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Danger Policy Check: get_window_list → 'safe' → execute    │    │
│  └────┬───────────────────────────────────────────────────────┘    │
│       │                                                              │
│       ▼                                                              │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Tool Execution:                                            │    │
│  │    WindowsDesktopAdapter.enumerateWindows()                 │    │
│  │    → EnumWindows, IsWindowVisible, GetWindowTextW           │    │
│  │    → Returns: [{id:"1", title:"VS Code", pid:1234}]        │    │
│  └────┬───────────────────────────────────────────────────────┘    │
│       │                                                              │
│       ▼                                                              │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Multimodal Detection:                                      │    │
│  │    Tool result contains screenshot? → ToolMessage(image)    │    │
│  │    Otherwise → ToolMessage(text)                            │    │
│  └────┬───────────────────────────────────────────────────────┘    │
│       │                                                              │
│       ▼                                                              │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Post-Action Verification (if dangerous action):            │    │
│  │    GroundTruthVerifier.verify()                             │    │
│  │    → pixel diff (1/16 sampling)                             │    │
│  │    → hardReject → "try different approach" HumanMessage     │    │
│  │    → low score → warning ToolMessage                        │    │
│  └────┬───────────────────────────────────────────────────────┘    │
│       │                                                              │
│       ▼                                                              │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  50ms delay → emit progress → next step (up to 25)         │    │
│  │                                                              │    │
│  │  On no tool_calls: yield final response, break loop         │    │
│  └─────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
```

#### 8.1.3 LangGraph Graph Topology

```
                          ┌───────────┐
                          │ __start__ │
                          └─────┬─────┘
                                ▼
                    ┌───────────────────────┐
                    │    classifyNode        │
                    │  (routerModel, temp=0) │
                    │  → intent + complexity │
                    └─────┬─────┬────┬──────┘
                          │     │    │
              ┌───────────┘     │    └───────────┐
              ▼                 ▼                 ▼
     ┌──────────────┐  ┌────────────────┐  ┌──────────────┐
     │  fastPath    │  │ internalKnowledge│ │externalSearch│
     │  (regex)     │  │  (LLM training  │  │  FanOut      │
     │              │  │   data)         │  │  (web search) │
     │  → END       │  └──────┬─────────┘  └──────┬───────┘
     └──────────────┘         ▼                   ▼
                   ┌──────────────┐  ┌───────────────────┐
                   │quickVerify   │  │ synthesizeWith     │
                   │(verifierModel│  │ SelfCheck           │
                   │ temp=0.1)    │  │ (chatModel)         │
                   └──┬───┬───────┘  └──┬────────────────┘
                      │   │            │
                pass  │   │ replan     │
                ┌─────┘   └────┐       │
                ▼              ▼       │
              END    ┌──────────────┐  │
                     │ replanNode   │  │
                     │ (rewriteModel│  │
                     │  temp=0)     │  │
                     └──────┬───────┘  │
                            │          │
                            └──► loop ─┘

         ┌────────────────────────────────────────────┐
         │  Additional branches from classifyNode:     │
         │                                             │
         │  generalChat ──► generalChatNode ──► END   │
         │  browser   ──► browserAgentNode ──► desktop │
         │                    (Playwright)  │ confirmation│
         │                                  ▼          │
         │                             desktopAgent    │
         │  comparison ──► comparisonNode ──► END      │
         │  form       ──► formNode ───────► END       │
         │  chart      ──► chartNode ──────► END       │
         └────────────────────────────────────────────┘
```

### 8.2 ScreenHand — 7-Layer MCP Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        MCP Client (Claude, Cursor, etc.)                 │
│                              │ MCP Protocol (stdio)                       │
│                              ▼                                            │
├──────────────────────────────────────────────────────────────────────────┤
│  mcp-desktop.ts — Main MCP Server (111 tools, intelligence wrapper)      │
│                                                                          │
│  PRE-CALL: quickErrorCheck → contextTracker.update → contextTracker.hints│
│  POST-CALL(success): memory.record → context.record → playbook.capture   │
│  POST-CALL(failure): memory.appendError → backgroundResearch             │
├──────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ LAYER 7: APP MASTERY MAP                                         │   │
│  │ "I have a complete reverse-engineered blueprint of this app"     │   │
│  │                                                                  │   │
│  │  AppMap (~2200 lines) — 8 auto-recording features:               │   │
│  │  zones, nav graph, hierarchy, I/O contracts,                     │   │
│  │  state machine, visibility, timing, ready signals                │   │
│  │  → Mastery levels: beginner → pro → expert → grandmaster         │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ LAYER 6: TOOL MASTERY                                            │   │
│  │ "I know how to use this app like an expert"                      │   │
│  │                                                                  │   │
│  │  MenuScanner → DocParser → TutorialExtractor → ReferenceMerger   │   │
│  │  CoverageAuditor → Community (Publisher/Fetcher/Validator)       │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ LAYER 5: LEARNING                                                │   │
│  │ "I remember what worked and what didn't"                         │   │
│  │                                                                  │   │
│  │  LearningEngine with 6 policies:                                 │   │
│  │  Locator, Sensor, Recovery, Pattern, Timing, Topology (Bayesian) │   │
│  │  Memory service (JSONL) + Recall engine                          │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ LAYER 4: AUTONOMY                                                │   │
│  │ "I can plan, execute, recover, and continue"                     │   │
│  │                                                                  │   │
│  │  Planner → PlanExecutor → DeterministicPlanner (playbooks)       │   │
│  │  RecoveryEngine → Detectors → Strategies                         │   │
│  │  Supervisor (stall detection, recovery queue)                    │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ LAYER 3: AWARENESS                                               │   │
│  │ "I always know what's on screen"                                 │   │
│  │                                                                  │   │
│  │  WorldModel ← EntityTracker ← FusionPipeline                     │   │
│  │  PerceptionCoordinator (3-rate multi-source):                    │   │
│  │    FAST  (100ms):  AX events + CDP mutations                     │   │
│  │    MEDIUM (300ms): AX tree polling + CDP snapshots               │   │
│  │    SLOW  (1000ms): screenshot diff → ROI OCR                     │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ LAYER 2: TOOL KNOWLEDGE                                          │   │
│  │ "I know this app's shortcuts, selectors, and workflows"          │   │
│  │                                                                  │   │
│  │  38 references/*.json — selectors, shortcuts, flows, errors      │   │
│  │  28 playbooks/*.json — deterministic recorded workflows          │   │
│  │  Context Tracker — auto-loads refs, learns selectors, flushes    │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ LAYER 1: CONTROL                                                 │   │
│  │ "I can click, type, read, and navigate"                          │   │
│  │                                                                  │   │
│  │  CompositeAdapter → AccessibilityAdapter (~50ms)                 │   │
│  │                     → CdpChromeAdapter (~10ms)                   │   │
│  │                     → AppleScriptAdapter                         │   │
│  │                     → VisionAdapter/OCR (~600ms)                 │   │
│  │  Fallback chains: AX → CDP → OCR → coordinates (retry 2/method)  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
├──────────────────────────────────────────────────────────────────────────┤
│  Native Bridges (JSON-RPC over stdio):                                   │
│  macOS: Swift binary — AX API, CoreGraphics capture, Vision OCR         │
│  Windows: C# .NET 8 binary — UI Automation, screen capture, Windows OCR │
└──────────────────────────────────────────────────────────────────────────┘
```

### 8.3 Accomplish — Monorepo Electron Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        pnpm Monorepo                                    │
│                                                                         │
│  apps/                          packages/                               │
│  ├── desktop/ (Electron shell)  └── agent-core/ (ESM, internal)        │
│  ├── web/ (React UI)              ├── types/                            │
│  └── daemon/ (background proc)    ├── storage/ (SQLite, migrations)     │
│                                   ├── mcp/ (tool definitions)           │
│                                   └── business logic                    │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  apps/desktop/ — Thin Electron Shell                                    │
│                                                                         │
│  ┌──────────────────┐    ┌──────────────────┐                          │
│  │  main process    │    │  preload         │                          │
│  │                  │    │                  │                          │
│  │  IPC handlers ←──┼────┤  contextBridge   │                          │
│  │                  │    │  window.         │                          │
│  │  - spawns        │    │    accomplish.*  │                          │
│  │    opencode      │    └──────────────────┘                          │
│  │  - AES-256-GCM   │           │                                      │
│  │    keychain      │           │                                      │
│  │  - node-pty      │           ▼                                      │
│  └──────────────────┘    ┌──────────────────┐                          │
│                          │  web/ build output│                          │
│  apps/daemon/            │  (loaded by       │                          │
│  ┌──────────────────┐    │   Electron)       │                          │
│  │                  │    └──────────────────┘                          │
│  │  spawns          │                                                  │
│  │  opencode serve  │    apps/web/ — Standalone React UI               │
│  │  (OpenCode SDK)  │                                                  │
│  │                  │    Vite + React Router + Zustand                 │
│  │  ↔ @opencode-ai  │    shadcn/ui + Framer Motion                    │
│  │    /sdk          │    Tailwind CSS + design tokens                  │
│  └──────────────────┘                                                  │
│                                                                         │
│  Flow:                                                                  │
│  User types in web UI → Zustand store → IPC → daemon spawns opencode    │
│  → opencode executes (can use node-pty for terminal, MCP tools)         │
│  → streams output back through IPC → web UI displays                    │
│                                                                         │
│  12+ LLM providers: Anthropic, OpenAI, Google, xAI, DeepSeek,          │
│  Moonshot, Ollama, LM Studio, built-in computer-use model               │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.4 Agent-S3 — Hierarchical Manager-Worker Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Agent S3 Architecture                             │
│                        (Python 99.7%, CLI)                               │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                        Agent S3 Agent                              │  │
│  │                                                                    │  │
│  │  ┌─────────────┐        ┌───────────────────────────────────────┐  │  │
│  │  │ Instruction  │        │         Planning & Execution         │  │  │
│  │  │ Encoder      │        │                                       │  │  │
│  │  │ (UI-TARS-    │        │  ┌─────────┐    ┌─────────────────┐  │  │  │
│  │  │  1.5-7B)    │        │  │Manager  │    │ Worker Agent     │  │  │  │
│  │  │              │        │  │         │───►│                  │  │  │  │
│  │  │ Grounds      │        │  │ Plans    │    │ Executes actions │  │  │  │
│  │  │ screenshot   │        │  │ subtasks │    │ via OSWorldACI   │  │  │  │
│  │  │ to coords    │        │  │          │◄───│                  │  │  │  │
│  │  │ (1920x1080)  │        │  │          │    └────────┬────────┘  │  │  │
│  │  └─────────────┘        │  └─────────┘             │           │  │  │
│  │                          └──────────────────────────┼───────────┘  │  │
│  │                                                     │              │  │
│  └─────────────────────────────────────────────────────┼──────────────┘  │
│                                                        │                 │
│  ┌─────────────────────────────────────────────────────┼──────────────┐  │
│  │            Grounding & Execution Layer               │              │  │
│  │                                                     │              │  │
│  │  ┌───────────────────┐  ┌──────────────────────────┼─────┐        │  │
│  │  │ OSWorldACI         │  │ LocalEnv (optional)     │     │        │  │
│  │  │                    │  │                         │     │        │  │
│  │  │ screenshot()       │  │ Python code execution   │     │        │  │
│  │  │ click()            │  │ Bash code execution     │     │        │  │
│  │  │ type()             │  │ (30s timeout)           │     │        │  │
│  │  │ hotkey()           │  └─────────────────────────┘     │        │  │
│  │  │ scroll()           │                                  │        │  │
│  │  │ call_code_agent()  │                                  │        │  │
│  │  └────────┬───────────┘                                  │        │  │
│  │           │                                              │        │  │
│  │           ▼                                              ▼        │  │
│  │  ┌──────────────────────────────────────────────────────────┐    │  │
│  │  │        OS Platform Abstraction                           │    │  │
│  │  │  Linux: xdotool, scrot, xclip                            │    │  │
│  │  │  macOS: CGEvent, AppleScript, screencapture              │    │  │
│  │  │  Windows: Win32 APIs, PowerShell                         │    │  │
│  │  └──────────────────────────────────────────────────────────┘    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  External Models:                                                       │
│  ┌─────────────────┐  ┌──────────────────┐  ┌──────────────────────┐  │
│  │ Main LLM         │  │ Grounding Model  │  │ Memory (dual system) │  │
│  │ gpt-5, Claude,   │  │ UI-TARS-1.5-7B   │  │ Narrative (abstract) │  │
│  │ Gemini, vLLM     │  │ HuggingFace/TGI  │  │ Episodic (trajs)     │  │
│  └─────────────────┘  └──────────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.5 OS AI Computer Use — Flutter + Python Split Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    OS AI Computer Use Architecture                       │
│                                                                         │
│  ┌─────────────────────────┐        ┌───────────────────────────────┐  │
│  │  Flutter Frontend       │        │  Python Backend               │  │
│  │  (Dart 38.4%)           │        │  (Python 51.6%)               │  │
│  │                         │        │                               │  │
│  │  ┌───────────────────┐  │  WS +  │  ┌─────────────────────────┐  │  │
│  │  │ UI (MobX+Provider)│  │  JSON  │  │ OpenAI GPT / Claude     │  │  │
│  │  │                   │  │  RPC   │  │ Agent loop              │  │  │
│  │  │ - Task input      │◄─┼───────┼─►│                         │  │  │
│  │  │ - Live screenshot │  │  2.0   │  │ Platform Drivers:       │  │  │
│  │  │ - Agent actions   │  │        │  │   macOS (CGEvent)       │  │  │
│  │  │ - Control panel   │  │  REST  │  │   Windows (Win32)       │  │  │
│  │  │ - Settings        │  │  /dio  │  │   Linux (xdotool)       │  │  │
│  │  └───────────────────┘  │        │  │                         │  │  │
│  │                         │        │  │ OS-agnostic execution    │  │  │
│  │  Platforms:             │        │  │ layer                   │  │  │
│  │  macOS, Windows,        │        │  └─────────────────────────┘  │  │
│  │  Linux, Web             │        │                               │  │
│  └─────────────────────────┘        └───────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.6 OpenAI Codex — Background Computer Use Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    OpenAI Codex Desktop Architecture                      │
│                    (macOS-only computer use, April 2026)                  │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Electron Desktop App                                             │  │
│  │                                                                   │  │
│  │  ┌─────────────────┐   ┌───────────────┐   ┌──────────────────┐  │  │
│  │  │ Chat Interface  │   │ Thread Runner │   │ Memory Preview   │  │  │
│  │  │ (user prompts)  │   │ (background   │   │ (cross-session   │  │  │
│  │  │                 │   │  agents)      │   │  context)        │  │  │
│  │  └────────┬────────┘   └───────┬───────┘   └────────┬─────────┘  │  │
│  │           │                    │                    │            │  │
│  └───────────┼────────────────────┼────────────────────┼────────────┘  │
│              │                    │                    │               │
│              ▼                    ▼                    ▼               │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Agent Core (Custom Loop)                                         │  │
│  │                                                                   │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────────┐  │  │
│  │  │ Perception  │  │ Reasoning   │  │ Action Dispatcher        │  │  │
│  │  │             │  │             │  │                          │  │  │
│  │  │ Screenshot  │  │ GPT-4.x /   │  │ → Mouse (CGEvent)       │  │  │
│  │  │ + AX data   │  │ o-series    │  │ → Keyboard (CGEvent)    │  │  │
│  │  │ + pixel     │  │ models      │  │ → Own cursor rendering   │  │  │
│  │  │   reasoning │  │             │  │                          │  │  │
│  │  └─────────────┘  └─────────────┘  └──────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│              │                    │                                     │
│              ▼                    ▼                                     │
│  ┌───────────────────────┐  ┌───────────────────────────────────────┐  │
│  │  Safety Layer         │  │  Plugin Ecosystem (90+)               │  │
│  │                       │  │                                       │  │
│  │  1. Sandbox Mode      │  │  JIRA, CircleCI, GitLab, MS Suite,   │  │
│  │    (seatbelt profiles)│  │  GitHub, SSH devbox, etc.            │  │
│  │  2. Approval Policy   │  │                                       │  │
│  │    (user gating)      │  │  Extensible via MCP helpers           │  │
│  │  3. Refusal List      │  │                                       │  │
│  │    (terminal/Codex/   │  │                                       │  │
│  │     admin prompts)    │  │                                       │  │
│  └───────────────────────┘  └───────────────────────────────────────┘  │
│                                                                         │
│  Native Bridges:                                                        │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  macOS Accessibility API + Screen Recording API                   │  │
│  │  Seatbelt sandbox extensions                                      │  │
│  │  Atlas (in-app browser)                                           │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  LIMITATIONS:                                                           │
│  - macOS-only (no Windows/Linux)                                        │
│  - Single shared desktop-control surface (parallel isolation pending)   │
│  - Unavailable in EU, UK, Switzerland                                   │
│  - Refuses terminal driving by design                                   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.6 Cross-Project Architecture Comparison

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  How Each Project Structures Its Agent Loop                                  │
│                                                                              │
│  Our Project (Flat ReAct):                                                   │
│  ┌─────────┐     ┌──────┐     ┌────────┐     ┌──────────┐                   │
│  │LangGraph├────►│Single├────►│28 Tools├────►│Verifier  │                   │
│  │classify │     │LLM   │     │(toolMap)│     │(soft)    │                   │
│  └─────────┘     └──────┘     └────────┘     └──────────┘                   │
│                                                                              │
│  ScreenHand (7-Layer MCP):                                                   │
│  ┌───────┐  ┌──────┐  ┌──────────┐  ┌───────┐  ┌──────┐  ┌──────┐  ┌─────┐ │
│  │Control├─►│Knowl.├─►│Awareness ├─►│Autonom├─►│Learn.├─►│Mast.├─►│App  │ │
│  │Layer  │  │Layer │  │(WorldMod)│  │(Planner│  │(6 pol│  │Layer │  │Map  │ │
│  └───────┘  └──────┘  └──────────┘  └───────┘  └──────┘  └──────┘  └─────┘ │
│                                                                              │
│  Accomplish (Daemon + OpenCode):                                             │
│  ┌──────┐     ┌────────┐     ┌───────────┐     ┌───────────┐                │
│  │Web UI├────►│Daemon  ├────►│OpenCode   ├────►│12+ LLM    │                │
│  │(React│     │(node)  │     │(SDK agent)│     │providers  │                │
│  └──────┘     └────────┘     └───────────┘     └───────────┘                │
│                                                                              │
│  Agent-S3 (Manager-Worker):                                                  │
│  ┌─────────┐     ┌────────┐     ┌────────┐     ┌─────────┐     ┌────────┐  │
│  │UI-TARS  ├────►│Manager ├────►│Worker  ├────►│OSWorld  ├────►│Platform│  │
│  │grounding│     │(plans) │     │(exec)  │     │ACI      │     │drivers │  │
│  └─────────┘     └────────┘     └────────┘     └─────────┘     └────────┘  │
│                      ▲                    │                                │
│                      └── Memory (dual) ────┘                                │
│                                                                              │
│  Open Interpreter (Code-First ReAct):                                        │
│  ┌────────┐     ┌──────────┐     ┌───────────┐     ┌───────────┐            │
│  │User    ├────►│LiteLLM   ├────►│Code       ├────►│PyAutoGUI/ │            │
│  │input   │     │(multi-   │     │execution  │     │Selenium/  │            │
│  │        │     │provider) │     │(Jupyter)  │     │Playwright │            │
│  └────────┘     └──────────┘     └───────────┘     └───────────┘            │
│                                                                              │
│  OpenAI Codex (Background Computer Use):                                     │
│  ┌────────┐     ┌──────────┐     ┌─────────────┐     ┌──────────────┐      │
│  │User    ├────►│GPT-4.x / ├────►│Perception:  ├────►│macOS AX API  │      │
│  │prompt  │     │o-series  │     │Screenshot + │     │+ Screen Rec. │      │
│  │        │     │          │     │AX data      │     │+ Own cursor  │      │
│  └────────┘     └──────────┘     └─────────────┘     └──────────────┘      │
│                    │                                                       │
│                    ▼                                                       │
│  ┌──────────────────────────────────────────────┐                          │
│  │  Safety: Sandbox + Approval + Refusal List   │                          │
│  │  Memory: Persistent cross-session context    │                          │
│  │  Plugins: 90+ integrations (MCP helpers)     │                          │
│  └──────────────────────────────────────────────┘                          │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 8.7 IPC/Communication Pattern Comparison

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  How Projects Communic Between Components                                    │
│                                                                              │
│  Our Project:                    ScreenHand:                                │
│  Renderer ◄──Electron IPC──► Main  ◄──MCP stdio──► MCP Client               │
│         ▲                        │                     (Claude, Cursor)      │
│         │                        │                                           │
│         └── event.sender.send()  └── JSON-RPC ──► Native Bridges            │
│            (streaming)               (stdio)      (Swift/C#)                │
│                                                                              │
│  Accomplish:                     Agent-S3:                                  │
│  Web UI ◄──IPC──► Daemon ◄──stdio──► OpenCode                                │
│  (React)        (node)    (node-pty)  (SDK agent)       CLI only, no IPC    │
│     │              │                                                        │
│     └── Zustand    └── AES-256-GCM                                          │
│        store          keychain                                               │
│                                                                              │
│  OS AI Computer Use:             Open Interpreter:                          │
│  Flutter ◄──WebSocket +──► Python    CLI: stdin/stdout                      │
│  (Dart)      JSON-RPC 2.0  Backend   Optional: FastAPI/HTTP                 │
│              + REST/dio                                                      │
│                                                                              │
│  vnc-use:                        Anthropic Computer Use:                    │
│  LangGraph ◄──VNC Protocol──► VNC     Stdio ◄──stdin/stdout──► Python loop │
│  agent                          Server                                       │
│                                 (Linux/macOS/X11)                            │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 8.8 Perception Pipeline Comparison

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  How Each Project Perceives the Desktop State                                │
│                                                                              │
│  Our Project:                    ScreenHand:                                │
│  ┌──────────────────────┐        ┌──────────────────────────────────────┐  │
│  │  Screenshot           │        │  3-Rate Multi-Source Perception      │  │
│  │  (Electron            │        │                                      │  │
│  │   desktopCapturer)    │        │  FAST (100ms):  AX events + CDP      │  │
│  │         │             │        │  MEDIUM (300ms): AX tree + snapshots │  │
│  │  ┌──────▼──────┐      │        │  SLOW (1000ms): screenshot diff      │  │
│  │  │OCR (Tess.)  │      │        │    → ROI OCR (skip if no change)     │  │
│  │  │singleton    │      │        │                                      │  │
│  │  │worker)      │      │        │  FusionPipeline:                     │  │
│  │  └──────┬──────┘      │        │    dedup → timestamp → confidence    │  │
│  │         │             │        │    → WorldModel ingest               │  │
│  │  ┌──────▼──────┐      │        │                                      │  │
│  │  │UIA Tree     │      │        │  EntityTracker:                      │  │
│  │  │(PowerShell  │      │        │    cross-frame identity via           │  │
│  │  │ COM)        │      │        │    label + window + 50px proximity    │  │
│  │  └─────────────┘      │        └──────────────────────────────────────┘  │
│  │                       │                                                  │
│  │  No WorldModel        │        OpenAI Codex:                            │
│  │  No state tracking    │        ┌──────────────────────────────┐         │
│  │  between steps        │        │  Screenshot (Screen Rec API)  │         │
│  └───────────────────────┘        │  + macOS AX data              │         │
│                                   │  + Pixel reasoning (GPT-4.x)  │         │
│  Accomplish:                      │  No multi-rate perception     │         │
│  ┌───────────────────────┐        │  No WorldModel                │         │
│  │  node-pty terminal     │        └──────────────────────────────┘         │
│  │  output (text)         │                                                 │
│  │  Chrome extension      │        OS AI Computer Use:                      │
│  │  (browser content)     │        ┌──────────────────────────────┐         │
│  │  No screenshot/OCR     │        │  Platform-specific drivers:  │         │
│  │  pipeline              │        │  screenshot per OS API       │         │
│  └───────────────────────┘        │  No multi-rate perception    │         │
│                                   │  No accessibility tree       │         │
│                                   └──────────────────────────────┘         │
│                                                                          │
│  Anthropic CU:                     Agent-S3:                              │
│  ┌──────────────────────────────┐  ┌──────────────────────────────┐       │
│  │  Screenshot (platform API)   │  │  Screenshot + AX dual-input  │       │
│  │  + Accessibility tree (macOS)│  │  (ACI: screenshot + AT with  │       │
│  │  No multi-rate perception    │  │   integer IDs + OCR-augmented)│       │
│  └──────────────────────────────┘  └──────────────────────────────┘       │
│                                                                          │
│  KEY GAP: Only ScreenHand has multi-rate perception + WorldModel.         │
│  All other projects (including ours) use single-rate screenshot capture.  │
│  Codex demonstrates that screenshot + AX data + LLM pixel reasoning      │
│  can work without multi-rate perception when using capable vision models. │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Research Sources

| Source | URL | Date |
|---|---|---|
| Accomplish GitHub | https://github.com/accomplish-ai/accomplish | 2026-04 |
| Agent-S GitHub | https://github.com/simular-ai/Agent-S | 2025-10 (S3) |
| Agent-S3 Performance | https://simular.ai/articles/agent-s3 | 2025-12 |
| OS-Copilot GitHub | https://github.com/OS-Copilot/OS-Copilot | 2024-09 |
| ScreenHand GitHub | https://github.com/manushi4/Screenhand | 2025 |
| ScreenHand Architecture | https://github.com/manushi4/Screenhand/blob/main/docs/architecture.md | 2025 |
| Open Interpreter | https://github.com/OpenInterpreter/open-interpreter | 2025 |
| vnc-use GitHub | https://github.com/mayflower/vnc-use | 2025 |
| OS AI Computer Use | https://github.com/iliyaZelenko/os-ai-computer-use | 2026-03 |
| Anthropic Computer Use Docs | https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/computer-use-tool | 2025-11 |
| OpenAI Codex Announcement | https://openai.com/index/codex-for-almost-everything/ | 2026-04-16 |
| Codex App Features | https://developers.openai.com/codex/app/features | 2026-04 |
| Codex Agent Approvals & Security | https://developers.openai.com/codex/agent-approvals-security | 2026-04 |
| Running Codex Safely at OpenAI | https://openai.com/index/running-codex-safely/ | 2026-04 |
| Codex Mac Computer Use (MacRumors) | https://www.macrumors.com/2026/04/16/openai-codex-mac-update/ | 2026-04-16 |
| Codex Beyond Agentic Coding (9to5Mac) | https://9to5mac.com/2026/04/16/openais-codex-app-adds-three-key-features-for-expanding-beyond-agentic-coding/ | 2026-04-16 |
| Codex Mac Computer Use Hands-On (Fello) | https://felloai.com/openai-codex-mac-computer-use-april-update/ | 2026-04 |
| Codex Desktop + Plugins (Digital Applied) | https://www.digitalapplied.com/blog/openai-codex-desktop-computer-use-plugins-guide | 2026-04 |
| Codex Seatbelt Sandbox (PR #13499) | https://github.com/openai/codex/pull/13499 | 2026-03 |
| Codex Parallel CU Feature Request | https://github.com/openai/codex/issues/20852 | 2026-05 |
| OSWorld Benchmark | https://os-world.github.io/ | 2024 (NeurIPS) |
| OSWorld-Human | https://arxiv.org/html/2506.16042v1 | 2025-06 |
| AgentTrust | https://arxiv.org/html/2605.04785v1 | 2026-05 |
| AgentSentinel | https://arxiv.org/html/2509.07764v1 | 2025-09 |
| CoWork-OS Security Guide | https://github.com/CoWork-OS/CoWork-OS/blob/main/SECURITY_GUIDE.md | 2025 |
| SEAgent (Self-Evolving Agent) | https://arxiv.org/html/2508.04700v1 | 2025-08 |
| EchoTrail-GUI | https://arxiv.org/abs/2512.19396 | 2025-12 |
| Auto-scaling Memory for GUI Agent | https://arxiv.org/html/2510.09038v1 | 2025-10 |
| Computer Use Benchmark Guide | https://agentmarketcap.ai/blog/2026/04/10/computer-use-benchmark-guide | 2026-04 |
