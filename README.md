# Qyther

A command launcher application built with Electron and React. Features a sleek command palette interface, keyboard-first navigation, and extensible command system.

Version
Electron
React
TypeScript

## Features

- ⚡ **Lightning Fast**: Optimized for cold start < 500ms
- 🎨 **Modern UI**: Clean, minimal dark theme
- ⌨️ **Keyboard-First**: Global hotkey (`Alt+Space`) to toggle
- 🔍 **Smart Search**: Fuzzy search with relevance ranking
- 🚀 **App Launcher**: Quick access to installed applications
- 🌐 **URL Opening**: Open websites directly from the palette
- 🔌 **Extensible**: Easy to add custom commands and integrations
- 📱 **System Tray**: Quick access menu with quit option

## Screenshots

The app features a beautiful, minimal interface:

- Centered floating window (800x600px)
- Transparent background with shadow
- Real-time search filtering
- Keyboard navigation with visual feedback

## Getting Started

### Prerequisites

- Node.js 22+ (recommended)
- npm or yarn

### Environment Setup

For AI features (custom LLM providers), create a `.env` file:

```bash
cp .env.example .env
```

Edit `.env` and add your configuration:

**For Custom LLM Provider (vLLM example):**

```env
USE_CUSTOM_LLM_PROVIDER=true
LLM_BASE_URL=http://localhost:8000/v1
LLM_API_KEY=
LLM_MODEL=meta-llama/Llama-2-7b-chat-hf
LLM_PROVIDER_TYPE=vllm
```

**For Ollama:**

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
cd qyther
npm install
```

1. **Start development server:**

```bash
npm run dev
```

The app will open automatically. Press `Alt+Space` to toggle the launcher window.

### Build for Production

```bash
# Build for current platform
npm run build

# Build for specific platforms
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux
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

The app includes a system tray icon (Windows) or menu bar icon (macOS) with the following options:

- **Show Qyther**: Opens the launcher window
- **Hide Window**: Hides the launcher window
- **Quit**: Exits the application completely

You can also double-click the tray icon to show/hide the window.

### Built-in Commands

- **Quit App**: Close the application
- **Hide Window**: Hide the launcher window
- **Open Documentation**: Opens Electron docs
- **Open React Docs**: Opens React docs

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

## Project Structure

```
qyther/
├── src/
│   ├── main/                    # Electron main process
│   │   ├── main.ts              # App entry point
│   │   ├── windows.ts           # Window management
│   │   ├── shortcuts.ts         # Global shortcuts
│   │   └── ipc/
│   │       └── handlers.ts      # IPC handlers
│   ├── preload/                 # Preload script
│   │   ├── preload.ts           # contextBridge setup
│   │   └── types.d.ts           # TypeScript declarations
│   └── renderer/                # React renderer
│       ├── App.tsx              # Root component
│       ├── main.tsx             # React entry
│       ├── components/          # UI components
│       │   ├── CommandPalette.tsx
│       │   ├── SearchBar.tsx
│       │   ├── ResultItem.tsx
│       │   └── ResultsList.tsx
│       ├── hooks/               # Custom hooks
│       │   ├── useKeyboard.ts
│       │   └── useSearch.ts
│       └── styles/              # CSS styles
│           └── globals.css
├── electron.vite.config.ts      # Vite config for Electron
├── tsconfig.json                # TypeScript config
├── tsconfig.node.json           # Node-side TS config
├── tsconfig.web.json            # Web-side TS config
├── index.html                   # HTML entry point
└── package.json                 # Dependencies
```

## Technology Stack

- **Electron 35**: Desktop application framework
- **React 19**: UI library with automatic memoization
- **Vite 6**: Fast build tool and dev server
- **TypeScript 5.7**: Type-safe JavaScript
- **Fuzzy Search**: Custom implementation for fast filtering

## Security Features

- ✅ Context Isolation enabled
- ✅ Node Integration disabled
- ✅ Sandbox mode enabled
- ✅ Content Security Policy (CSP)
- ✅ Input validation on all IPC calls
- ✅ Command sanitization

## Performance Targets

- Cold start: < 500ms
- Search latency: < 50ms
- Window toggle: < 100ms

## Customization

### Themes

Edit `src/renderer/styles/globals.css` to customize colors:

```css
:root {
  --bg-primary: #1d1d1d;
  --accent: #007aff;
  /* ... more variables */
}
```

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

### Search is slow

1. Reduce the number of default commands
2. Limit app listing in `src/main/ipc/handlers.ts`
3. Consider debouncing the search input

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - feel free to use this project for learning or building your own launcher.

## Acknowledgments

- Inspired by modern launcher applications
- Built with [Electron](https://www.electronjs.org/)
- UI inspired by modern launcher applications

## Next Steps

Potential enhancements:

- Plugin system for extensibility
- Clipboard history
- Snippets and templates
- File search integration
- Calculator mode
- Weather and time widgets
- Custom themes
- Preferences/settings window
- Auto-update functionality

