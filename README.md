# Qyther

A desktop command launcher application built with Electron, React, and TypeScript. Features a sleek command palette interface with AI-powered chat, MCP tool integration, browser automation, and keyboard-first navigation.

| | |
|---|---|
| **Version** | 1.0.0 |
| **Electron** | 41 |
| **React** | 19 |
| **TypeScript** | 5.7 |
| **Tailwind** | 4.2 |

## Features

### Core

- Lightning Fast — Optimized for cold start < 500ms
- Modern UI — Clean, minimal dark/light theme with shadcn/ui components and design tokens
- Keyboard-First — Global hotkey (`Alt+Space`) to toggle
- Smart Search — Fuzzy search (Fuse.js) with relevance ranking
- App Launcher — Quick access to installed applications
- URL Opening — Open websites directly from the palette
- System Tray — Quick access menu with show/hide/quit options

### AI & Chat

- LLM Chat — Conversational AI chat with multiple model providers (Custom LLM, Ollama, OpenAI-compatible)
- LangGraph Agents — Multi-step reasoning agent with tool calling and state management
- MCP Integration — Connect to Model Context Protocol servers to extend agent capabilities with external tools
- Browser Automation — Stateful browser agent for web research and automation tasks
- Document Loading — RAG support for PDFs, DOCX, EPUBs, Excel spreadsheets, and ZIP archives
- Citations & Sources — Source attribution with citation brackets and source cards
- Thinking Steps — Transparent reasoning traces showing agent thought process

### Search Modes

- **Command Mode** — Quick app launching and built-in commands
- **Ask Mode** — AI-powered conversational search with chat history
- **Browser Mode** — Web research with live progress tracking
- **File Search** — Local file system search with context attachments

## Screenshots

The app features a beautiful, minimal interface:

- Centered floating window with transparent background
- Real-time search filtering with visual feedback
- Dark and light theme support with smooth transitions
- Context chips, source attribution, and trust indicators

## Getting Started

### Prerequisites

- Node.js 22+ (recommended)
- npm or yarn

### Environment Setup

For AI features, create a `.env` file:

```bash
cp .env.example .env
```

Edit `.env` and add your configuration:

**Custom LLM Provider (vLLM example):**

```env
USE_CUSTOM_LLM_PROVIDER=true
LLM_BASE_URL=http://localhost:8000/v1
LLM_API_KEY=
LLM_MODEL=meta-llama/Llama-2-7b-chat-hf
LLM_PROVIDER_TYPE=vllm
```

**Ollama:**

```env
USE_CUSTOM_LLM_PROVIDER=true
LLM_BASE_URL=http://localhost:11434/v1
LLM_API_KEY=
LLM_MODEL=llama2
LLM_PROVIDER_TYPE=ollama
```

See `.env.example` for all available configuration options.

### Installation

1. **Install dependencies:**

```bash
npm install
```

2. **Start development server:**

```bash
npm run dev
```

The app will open automatically. Press `Alt+Space` to toggle the launcher window.

### Build for Production

```bash
npm run build            # Build for current platform
npm run build:win        # Windows
npm run build:mac        # macOS
npm run build:linux      # Linux
```

## Usage

### Keyboard Shortcuts

| Shortcut    | Action                 |
| ----------- | ---------------------- |
| `Alt+Space` | Toggle launcher window |
| `↑` / `↓`   | Navigate results       |
| `Enter`     | Execute selected item  |
| `Esc`       | Close window           |
| `Tab`       | Cycle through results  |

### System Tray

The app includes a system tray icon (Windows) or menu bar icon (macOS) with:

- **Show Qyther** — Opens the launcher window
- **Hide Window** — Hides the launcher window
- **Quit** — Exits the application completely

Double-click the tray icon to show/hide the window.

### Built-in Commands

- **Quit App** — Close the application
- **Hide Window** — Hide the launcher window
- **Open Documentation** — Opens Electron docs
- **Open React Docs** — Opens React docs

### Adding Custom Commands

Edit `src/renderer/App.tsx` and add to the `DEFAULT_COMMANDS` array:

```typescript
{
  id: 'cmd-custom',
  title: 'My Custom Command',
  subtitle: 'Description',
  icon: '🎯',
  type: 'command',
  action: 'custom-action',
}
```

Then handle the action in the `onExecute` function.

### MCP Server Configuration

Configure MCP servers in `mcp-config.json` to extend the AI agent with external tools:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-example"]
    }
  }
}
```

## Project Structure

```
qyther/
├── src/
│   ├── main/                    # Electron main process
│   │   ├── main.ts              # App entry point
│   │   ├── windows.ts           # Window management
│   │   ├── shortcuts.ts         # Global shortcuts
│   │   ├── tray.ts              # System tray
│   │   ├── preferences.ts       # User preferences
│   │   ├── windowManager.ts     # Window state management
│   │   ├── ipc/                 # IPC handlers
│   │   │   ├── handlers.ts
│   │   │   ├── chat-handlers.ts
│   │   │   ├── browser-handlers.ts
│   │   │   └── mcp-handlers.ts
│   │   ├── services/
│   │   │   ├── langgraph/       # Agent orchestration
│   │   │   │   ├── research-agent.ts
│   │   │   │   ├── state.ts
│   │   │   │   └── tools.ts
│   │   │   ├── langchain/       # LLM integration
│   │   │   │   └── agent.ts
│   │   │   ├── mcp/             # MCP client
│   │   │   │   └── client.ts
│   │   │   ├── browser/         # Browser automation
│   │   │   │   └── stateful-browser-agent.ts
│   │   │   └── utils/
│   │   │       └── document-loader.ts
│   │   └── utils/               # Downloaders & runners
│   │       ├── esDownloader.ts
│   │       └── esRunner.ts
│   ├── preload/                 # Preload script
│   │   └── preload.ts           # contextBridge setup
│   └── renderer/                # React renderer
│       ├── App.tsx              # Root component
│       ├── main.tsx             # React entry
│       ├── components/          # UI components
│       │   ├── CommandPalette.tsx
│       │   ├── SearchBar.tsx
│       │   ├── ResultItem.tsx
│       │   ├── ResultsList.tsx
│       │   ├── ChatInputArea.tsx
│       │   ├── ChatMessage.tsx
│       │   ├── ChatMessageBubble.tsx
│       │   ├── ChatHistoryDropdown.tsx
│       │   ├── ModeTabs.tsx
│       │   ├── MCPServerCard.tsx
│       │   ├── MCPToolModal.tsx
│       │   ├── MCPToolToggle.tsx
│       │   ├── ThemeToggle.tsx
│       │   ├── ask-mode/        # Ask mode components
│       │   │   ├── ChatMessagesList.tsx
│       │   │   ├── ChatWelcomeState.tsx
│       │   │   ├── ChatHistoryPanel.tsx
│       │   │   ├── BrowserProgressPanel.tsx
│       │   │   ├── ChatErrorBanner.tsx
│       │   │   ├── ThinkingSteps.tsx
│       │   │   ├── SourcesPanel.tsx
│       │   │   ├── SourceChips.tsx
│       │   │   ├── ContextChips.tsx
│       │   │   ├── UnifiedCommandBar.tsx
│       │   │   ├── CitationBracket.tsx
│       │   │   ├── CodeBlock.tsx
│       │   │   ├── ConfidenceBadge.tsx
│       │   │   ├── RelatedQuestions.tsx
│       │   │   ├── SearchWebToggle.tsx
│       │   │   ├── GenerativeUI/  # Generative UI components
│       │   │   ├── Timeline/      # Agent timeline components
│       │   │   ├── Trust/         # Trust & transparency
│       │   │   └── Transparency/  # Cost & token metrics
│       │   ├── ui/              # shadcn/ui primitives
│       │   └── common/          # Shared components
│       ├── hooks/               # Custom hooks
│       │   ├── useKeyboard.ts
│       │   ├── useSearch.ts
│       │   ├── useFileSearch.ts
│       │   ├── useCommandExecution.ts
│       │   ├── useWindowMode.ts
│       │   ├── useChatSession.ts
│       │   ├── useBrowserState.ts
│       │   ├── useContextAttachments.ts
│       │   ├── useRecentFiles.ts
│       │   ├── useFocusTrap.ts
│       │   ├── useLocalStorage.ts
│       │   └── useMCPKeyboardShortcuts.ts
│       ├── context/
│       │   └── ThemeProvider.tsx
│       ├── storage/
│       │   ├── indexeddb.ts
│       │   └── useSessionHistory.ts
│       ├── styles/
│       │   ├── globals.css
│       │   ├── ask-mode-perplexity.css
│       │   ├── tokens/          # Design token system
│       │   │   ├── colors.css
│       │   │   ├── spacing.css
│       │   │   ├── typography.css
│       │   │   ├── radius.css
│       │   │   ├── shadow.css
│       │   │   ├── motion.css
│       │   │   └── z-index.css
│       │   └── semantic/
│       │       └── theme.css
│       ├── utils/
│       │   ├── fuzzySearch.ts
│       │   ├── citationFormatter.ts
│       │   ├── costCalculator.ts
│       │   ├── fileUtils.ts
│       │   └── shortcuts.ts
│       └── lib/
│           └── utils.ts
├── design-systems/
│   └── SHADCN-DESIGN-SYSTEM.md
├── docs/
│   └── WEB-TOOLS-GUIDE.md
├── public/                    # Static assets
├── electron.vite.config.ts    # Vite config for Electron
├── mcp-config.json            # MCP server configuration
├── postcss.config.js          # PostCSS config
├── tsconfig.json              # TypeScript config
├── tsconfig.node.json         # Node-side TS config
├── index.html                 # HTML entry point
└── package.json               # Dependencies
```

## Technology Stack

- **Electron 41** — Desktop application framework
- **React 19** — UI library with concurrent features
- **Vite 6** — Fast build tool and dev server
- **TypeScript 5.7** — Type-safe JavaScript
- **Tailwind CSS 4.2** — Utility-first CSS framework
- **shadcn/ui** — Accessible component primitives with Radix UI
- **LangChain & LangGraph** — LLM orchestration and multi-step agent graphs
- **MCP SDK** — Model Context Protocol for tool integration
- **Fuse.js** — Client-side fuzzy search

## Design System

The project uses a comprehensive design token system with CSS custom properties:

- **Colors** — Semantic color tokens for light/dark themes
- **Spacing** — Consistent spacing scale
- **Typography** — Font sizes, weights, and line heights
- **Radius** — Border radius tokens
- **Shadow** — Elevation and shadow tokens
- **Motion** — Animation duration and easing tokens
- **Z-Index** — Layer management tokens

See `SHADCN-DESIGN-SYSTEM.md` in the `design-systems/` directory for the full design specification.

## Security Features

- Context Isolation enabled
- Node Integration disabled
- Sandbox mode enabled
- Content Security Policy (CSP)
- Input validation on all IPC calls
- Command sanitization

## Performance Targets

- Cold start: < 500ms
- Search latency: < 50ms
- Window toggle: < 100ms

## Customization

### Themes

The theme system uses CSS custom properties. Edit `src/renderer/styles/tokens/colors.css` to customize colors:

```css
:root {
  --color-bg-primary: #1d1d1d;
  --color-accent: #007aff;
  /* ... more variables */
}
```

Toggle between dark and light themes using the theme toggle in the UI.

### Window Size

Edit `src/main/windows.ts`:

```typescript
const windowWidth = 800;
const windowHeight = 600;
```

### Keyboard Shortcuts

Edit `src/main/shortcuts.ts`:

```typescript
globalShortcut.register('YourShortcut', () => {
  toggleMainWindow();
});
```

## Troubleshooting

### App doesn't start

1. Make sure all dependencies are installed: `npm install`
2. Check Node.js version: `node --version` (should be 22+)
3. Clear cache: `rm -rf node_modules out dist && npm install`

### Global shortcut not working

1. Check if another app is using the same shortcut
2. On macOS, ensure Accessibility permissions are granted
3. Try alternative shortcut: `Alt+Space`

### AI features not working

1. Verify `.env` file exists with correct provider settings
2. Check that the LLM server is running and accessible
3. Review main process logs for connection errors

### MCP servers not connecting

1. Verify `mcp-config.json` syntax is valid JSON
2. Ensure MCP server commands are available on your system
3. Check the MCP server card UI for connection status

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License — feel free to use this project for learning or building your own launcher.

## Acknowledgments

- Inspired by modern command launchers
- Built with [Electron](https://www.electronjs.org/)
- UI built with [shadcn/ui](https://ui.shadcn.com/) component primitives
- AI orchestration via [LangChain](https://js.langchain.com/) and [LangGraph](https://langchain-ai.github.io/langgraphjs/)
