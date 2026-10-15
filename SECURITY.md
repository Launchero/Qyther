# Security Policy

This document states what Qyther's security posture actually is, including the parts that are weak. It is written for people who are about to run this software and for people who want to report a problem. Read it before you enable the agent modes.

## Supported versions

Only the current default branch is maintained. Right now that is `agent-handoff/apr16-desktop-input-redesign`.

There are no supported older releases and there is no published binary. `package.json` reports version `1.0.0`, but no git tag exists and no installer has been released, so there is nothing to patch against and no download channel to trust or distrust. If you are running a copy of Qyther that someone gave you, it is a build from this source tree and it receives no updates.

Security fixes land on the default branch. There is no backport promise, because there is nothing to backport to.

## What you are running, from a security standpoint

Qyther is a Windows desktop application whose AI mode can drive your real desktop: move the mouse, type keys, click windows, read the accessibility tree, take screenshots, run shell commands, and write files. Concretely:

- The Windows automation agent exposes 32 tools over Win32/UIA backends (`src/main/services/pi/toolbox.ts`), all TypeBox `AgentTool`s driven by a single Pi `Agent` loop (`src/main/services/pi/agent.ts`). There is **no human approval gate**: no confirmation dialog, no approve/deny, no prompt before a tool runs. This is a deliberate product decision, not a missing feature. The old per-tool danger classification (29 `safe`, 2 `reviewable`, 1 `dangerous`) was deleted at the Pi cutover and is not replaced; the one surviving opt-in is `details.verifies` on a tool's result, which runs the automatic `GroundTruthVerifier` pixel check. Today only `close_window` sets it.
- `execute_command` runs arbitrary text through `exec` with `shell: 'powershell.exe'` (`src/main/services/pi/toolbox.ts`). It has no allowlist and there is no confirmation prompt — invoking it is invoking a shell. (The `DANGEROUS_COMMAND_PATTERNS` blocklist in `src/main/ipc/command-guard.ts` applies only to the `command:execute` IPC channel, not to `execute_command`.)
- The document agent writes real `.docx`, `.pptx` and `.xlsx` files into `~/Documents` (`src/main/services/document/document-executor.ts`); that folder is the only write sandbox and the filename sanitiser is the only path filter.
- Research mode fetches URLs that the **model** chose. Every target passes `checkFetchUrl` (`src/main/services/web/url-guard.ts`) before a socket opens and again after redirects: `http`/`https` only, no embedded credentials, 2048 characters max, and loopback / RFC1918 / CGNAT / link-local / `metadata.google.internal` rejected. On a desktop with a real LAN, a router admin page and a NAS UI are one fetch away and both answer unauthenticated GETs. This is deliberately stricter than `api-config-guard.ts`, which must *allow* `http://localhost:11434/v1` because a user pointing the palette at a local model server is the feature. It inspects the URL literal, not the address a name resolves to, so DNS rebinding is not covered. Fetched page text enters the synthesis prompt marked as untrusted data, never as instructions.
- The browser agent drives a real headless Chromium through the Playwright MCP server (configured in `mcp-config.json`, which is untracked and created from `mcp-config.example.json`; code in `src/main/services/browser/`). There is no URL allowlist anywhere in that subtree.
- `createExecuteCommandTool` is not the only shell surface: the `command:execute` IPC channel also runs arbitrary strings through `promisify(exec)` (`src/main/ipc/handlers.ts:128-141`).

**Any LLM prompt is untrusted input.** Instructions the model receives — from you, from a web page it browses, from a document it reads, from an MCP tool's output — can steer it toward an action, and the agent will carry that action out with no confirmation prompt. Therefore:

- Treat document attachments and web content you point the agent at as hostile input, because for the agent they are indistinguishable from instructions.
- Do not point the desktop agent at content you do not trust, and watch what it does while it runs.
- Prefer running with the smallest model access you need. If a task does not need the desktop, do not ask for the desktop.

## What is actually hardened

Verified against this checkout:

- The renderer is sandboxed: `app.enableSandbox()` (`src/main/main.ts:40`) with `contextIsolation: true`, `nodeIntegration: false` and `sandbox: true` (`src/main/windows.ts:62-64`). The preload runs as compiled CommonJS and cannot import from `src/main`.
- New-window creation is denied outright: `setWindowOpenHandler` returns `{ action: 'deny' }` (`src/main/main.ts:197`).
- Navigation is restricted: `will-navigate` only allows `http://localhost:5173` and `file://` origins and prevents everything else (`src/main/main.ts:202-206`).
- `url:open` parses the value and restricts it to `http:`/`https:` in the main process (`src/main/ipc/handlers.ts:146-149`), so arbitrary protocol handlers are not reachable through that channel.
- Dev-only relaxations are environment-gated: the CDP debugging port 9222 with `remote-allow-origins *` is attached only when `NODE_ENV=development` (`src/main/main.ts:52-55`). Do not ship or run a development build on a machine handling sensitive data.
- `command:execute` is now checked in the main process, not only in preload: `isCommandSafe` lives in `src/main/ipc/command-guard.ts`, the handler rejects before `exec`, and `command-guard.test.ts` covers it by importing the production module.

## Known weak points

These are current, verified properties of the design, not hypotheticals. If a fix lands here, this section changes.

1. **The `command:execute` blocklist is a keyword filter, not a boundary.** Both layers now apply it — `src/preload/preload.ts:188-193` and, since the guard landed, `src/main/ipc/command-guard.ts` in main — but `Remove-Item -Recurse -Force`, aliases and encoded commands all pass through unchanged. Treat the channel as arbitrary command execution with the app's privileges. `file:search` is still the older shape: metacharacter filtering only in `src/preload/preload.ts:231-240`, none in main (`src/main/ipc/handlers.ts:261`).
2. **Any DevTools endpoint on this app is remote code execution as the logged-in user.** The renderer can invoke `command:execute`, so anything holding `Runtime.evaluate` against the debug port can too — and it never passes through preload, so the blocklist is the only check and it is bypassable. This is live in development (`NODE_ENV=development` opens 9222 with `remote-allow-origins *`) and becomes live in a packaged build for as long as it is launched with `--remote-debugging-port`. Loopback binding is the only mitigation. `scripts/harness/` is built around this: its MCP server accepts no caller-supplied JavaScript, and the Playwright MCP pointed at the app is treated as observation-only.
3. **`file:revealInFolder` has no validation at any layer** — it passes its argument straight to `shell.showItemInFolder` (`src/main/ipc/handlers.ts:182-184`).
4. **There is one shared IPC validator and it is the exception.** `isCommandSafe` is real production code (`src/main/ipc/command-guard.ts`); `validateUrl` and `validatePath` still exist only as local functions inside `src/main/ipc/handlers.test.ts:6,48`, so that file is not evidence that validation is covered — it tests its own copies.
5. **Every IPC channel is four hand-synced sites** with no schema and no codegen, so a channel can be half-wired and stay that way silently. `src/main/ipc/AGENTS.md` keeps the current drift list.
6. **External child processes are trusted as much as the app itself.** File search shells out to the Everything CLI (`es.exe`, located or downloaded by `src/main/utils/esDownloader.ts`, invoked by `src/main/utils/esRunner.ts`), and MCP servers are launched as stdio child processes from `mcp-config.json` (`src/main/services/mcp/client.ts`). Anyone who can edit `es.exe`, `mcp-config.json`, or the paths in it controls a process running with your desktop privileges and no sandbox.
7. **The document generator's only boundary is `~/Documents` plus a filename allowlist.** There is no path dialog, no per-write confirmation, and the collision-rename code in `document-executor.ts:60-86` is unreachable, so a repeat title overwrites the earlier file.
8. **Screenshots and accessibility reads capture whatever is on screen**, including other applications' private content, and that text goes to your configured LLM endpoint.

## Reporting a vulnerability

Report security problems **privately**. Use GitHub's private vulnerability reporting for this repository: `https://github.com/Launchero/Qyther/security/advisories/new`. Reporting is enabled at the repository level by the maintainer; if that form is not yet available, open a normal issue whose title and body say only "security issue — please contact me privately", and put nothing sensitive in it. There is no published email address for this project, and you should not expect one.

What to include:

- The version or commit you tested (`git rev-parse HEAD`), and that you are on Windows plus its build number.
- The exact path to reproduce, including which mode (Files, Ask, browser, desktop, document) and what the agent did.
- Whether exploitation requires the victim to have already modified the app, its config, or its environment.
- Impact: which boundary is crossed, and what an attacker gains.

Please give the maintainer time to fix before you disclose publicly, and do not open a pull request that fixes a security problem in a public branch before the report is private.

**Do not post in a public issue:**

- A working exploit, proof-of-concept payload, or step-by-step bypass of the preload blocklist or the command guard.
- Your own or anyone's `API_KEY`, `BASE_URL`, `TAVILY_API_KEY`, `BRAVE_API_KEY`, `JINA_API_KEY`, MCP server `env` values, or a real `.env` file.
- Log excerpts or screenshots containing file paths, window titles, usernames, document contents or clipboard contents — the same material that makes this app useful is what makes its logs sensitive.
- Another user's session data, trajectory database, or `~/Documents` output.

The trajectory and failure memory stored by `src/main/services/database/` is a local sql.js file under Electron's `userData` path. It is not encrypted; do not attach it to an issue.

## Out of scope

Report these if you want, but they are not vulnerabilities and are unlikely to be treated as such:

- Anything that requires the reporter to already have arbitrary code execution on the target machine, or that depends on the attacker having write access to the installed files, `mcp-config.json`, `.env`, or `es.exe`. Once code runs as you, the app has no separate trust boundary to break.
- Denial of service against third-party services or endpoints you choose to send traffic to, including DuckDuckGo or Tavily search, your LLM provider, or MCP servers.
- The documented trust model itself: `es.exe` being downloaded and executed, MCP child processes running unsandboxed with your privileges, and the Playwright MCP child process. These are declared behaviours of a Windows automation tool, not bugs. Include them in a report only if you can cross a boundary the app actually intends to hold.
- An action the agent performed on its own. The desktop agent runs without an approval gate by design, so an unprompted-but-authorized action is not a vulnerability — include it only if it crosses a boundary the app actually intends to hold.
- Vulnerabilities in dependencies, upstream Electron, Chromium, Node, `npx`-fetched MCP packages, or Windows itself. Please report those upstream; we will take a mention and update the pin.
- Attacks that require the victim to ignore every warning in this file and this repository's `AGENTS.md` docs.
- Social engineering of users, and physical access attacks.

## Hardening we would like help with

These are open, useful, and reasonably scoped — see `CONTRIBUTING.md` for how to work in the tree:

- Move IPC validation into the main process for `command:execute` and `file:search`, and add a check to `file:revealInFolder`, so the boundary the sandbox guarantees is the boundary that decides.
- Introduce real shared validators and tests that import production handlers instead of local copies.
- Add an allowlist to `execute_command`, which currently has neither a blocklist nor any confirmation prompt.
- Make generated document filenames collision-safe once the dead branch in `document-executor.ts:60-86` is repaired.
