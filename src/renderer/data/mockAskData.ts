export interface ToolCall {
  id: string;
  name: string;
  server: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  progress?: number;
  args?: Record<string, unknown>;
  result?: string;
  logs?: string[];
}

export interface MCPServer {
  id: string;
  name: string;
  status: 'connected' | 'disconnected' | 'connecting';
  icon?: string;
}

export interface AIModel {
  id: string;
  name: string;
  description?: string;
  isRecommended?: boolean;
}

export const mockAIModels: AIModel[] = [
  { id: 'claude-sonnet', name: 'Claude Sonnet 4', description: 'Best for coding tasks', isRecommended: true },
  { id: 'claude-opus', name: 'Claude Opus 4', description: 'Most capable model' },
  { id: 'gpt-4o', name: 'GPT-4o', description: 'OpenAI flagship model' },
  { id: 'gemini-pro', name: 'Gemini 2.0 Pro', description: 'Google best model' },
  { id: 'auto', name: 'Auto', description: 'Automatically select best model' },
];

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  /** @deprecated - streaming removed */
  isStreaming?: boolean;
  toolCalls?: ToolCall[];
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
  mcpServers: MCPServer[];
}

export const mockMCPServers: MCPServer[] = [
  { id: 'filesystem', name: 'Filesystem', status: 'connected', icon: '📁' },
  { id: 'github', name: 'GitHub', status: 'connected', icon: '🐙' },
  { id: 'context7', name: 'Context7', status: 'connected', icon: '📚' },
  { id: 'playwright', name: 'Playwright', status: 'disconnected', icon: '🎭' },
];

export const mockSuggestions = [
  'Optimize Electron cold start time',
  'How to use React 19 use() hook?',
  'Add authentication to the app',
  'Explain context isolation in Electron',
];

const createMessage = (
  id: string,
  role: 'user' | 'assistant',
  content: string,
  isStreaming = false,
  toolCalls?: ToolCall[]
): ChatMessage => ({
  id,
  role,
  content,
  timestamp: new Date(Date.now() - (Math.random() * 3600000)),
  isStreaming,
  toolCalls,
});

export const mockSessions: ChatSession[] = [
  {
    id: 'session-1',
    title: 'Optimize Electron cold start',
    createdAt: new Date(Date.now() - 86400000),
    updatedAt: new Date(Date.now() - 3600000),
    mcpServers: mockMCPServers,
    messages: [
      createMessage('msg-1', 'user', 'How can I optimize the cold start time of my Electron app? It currently takes over 2 seconds.'),
      createMessage(
        'msg-2',
        'assistant',
        `Here are several strategies to optimize Electron cold start time:

1. **Enable lazy loading** - Only load modules when needed, not at startup
2. **Use V8 code caching** - Enable \`contextIsolated\` and pre-compile regexes
3. **Defer non-critical operations** - Move logging, analytics to background
4. **Optimize the main process** - Minimize IPC calls at startup
5. **Use native modules wisely** - Consider pure JS alternatives

Would you like me to show code examples for any of these?`
      ),
      createMessage('msg-3', 'user', 'Can you show me how to implement lazy loading?'),
      createMessage(
        'msg-4',
        'assistant',
        `Here's an example of lazy loading in your main process:

\`\`\`typescript
// Instead of requiring at top
// const fs = require('fs'); // Don't do this

// Lazy require when needed
const loadFileSystem = () => {
  const fs = require('fs');
  return fs.promises.readFile('path');
}
\`\`\`

For renderer code, you can use dynamic \`import()\`:
\`\`\`typescript
// Lazy load a heavy component
const HeavyComponent = React.lazy(() => import('./HeavyComponent'));
\`\`\`

Would you like me to show more examples?`
      ),
    ],
  },
  {
    id: 'session-2',
    title: 'React 19 best practices',
    createdAt: new Date(Date.now() - 172800000),
    updatedAt: new Date(Date.now() - 7200000),
    mcpServers: mockMCPServers,
    messages: [
      createMessage('msg-1', 'user', 'What are the best practices for using React 19?'),
      createMessage(
        'msg-2',
        'assistant',
        `React 19 introduces several new features and best practices:

### 1. Use the \`use()\` Hook
For reading resources like Promises and contexts in components:

\`\`\`tsx
function Component({ promise }) {
  const data = use(promise);
  return <div>{data.name}</div>;
}
\`\`\`

### 2. Use Form Actions
Handle form submissions without useState:

\`\`\`tsx
function MyForm() {
  async function action(formData: FormData) {
    'use server';
    // Handle form submission
  }
  
  return <form action={action}>...</form>;
}
\`\`\`

### 3. Optimistic Updates
Use \`useOptimistic()\` for instant UI feedback:

\`\`\`tsx
const [optimisticPosts, addOptimisticPost] = useOptimistic(posts);
\`\`\`

### 4. Use \`useRef\` with initialValue
For refs that need initial values:

\`\`\`tsx
const ref = useRef(null, initialValue);
\`\`\`

Would you like me to dive deeper into any of these?`
      ),
    ],
  },
  {
    id: 'session-3',
    title: 'Fix ESLint errors in ipc',
    createdAt: new Date(Date.now() - 259200000),
    updatedAt: new Date(Date.now() - 14400000),
    mcpServers: mockMCPServers,
    messages: [
      createMessage('msg-1', 'user', 'I have ESLint errors in my IPC handlers. Can you help fix them?'),
      createMessage(
        'msg-2',
        'assistant',
        `I'd be happy to help! Could you share the specific ESLint errors you're seeing? 

Common IPC-related ESLint issues include:

1. **no-unsafe-assignment** - Assigning \`any\` types
2. **no-explicit-any** - Missing type annotations
3. **@typescript-eslint/no-unused-vars** - Unused parameters
4. **security** - Missing validation on IPC inputs

You can run \`npm run lint\` to see the exact errors, or share the relevant file paths and I'll help you fix them.`
      ),
    ],
  },
  {
    id: 'session-4',
    title: 'TypeScript strict mode',
    createdAt: new Date(Date.now() - 345600000),
    updatedAt: new Date(Date.now() - 28800000),
    mcpServers: mockMCPServers,
    messages: [
      createMessage('msg-1', 'user', 'How do I enable strict mode in TypeScript?'),
      createMessage(
        'msg-2',
        'assistant',
        `Add \`"strict": true\` to your \`tsconfig.json\`:

\`\`\`json
{
  "compilerOptions": {
    "strict": true
  }
}
\`\`\`

This enables all strict type-checking options:
- strictNullChecks
- strictBindCallApply
- strictFunctionTypes
- strictPropertyInitialization
- noImplicitAny
- noImplicitReturns
- noImplicitThis
- noUnusedLocals
- noUnusedParameters

You can also enable them individually if you want a gradual migration.`
      ),
    ],
  },
];

export const getDefaultSession = (): ChatSession => mockSessions[0];

export const createEmptySession = (mcpServers: MCPServer[] = mockMCPServers): ChatSession => ({
  id: `session-${Date.now()}`,
  title: 'New Chat',
  createdAt: new Date(),
  updatedAt: new Date(),
  mcpServers,
  messages: [],
});