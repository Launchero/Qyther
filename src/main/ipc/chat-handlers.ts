import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { langChainAgent, ChatSession } from '../services/langchain/agent';
import { runAskTurn, AskNotConfiguredError, type AskHistoryEntry } from '../services/pi/ask-turn';
import type { AskStreamEvent } from '../services/pi/ask-events';
import type { UiPayload } from '../../shared/ipc/ui-payload';
import type { Source } from '../../shared/ipc/source';
import * as fs from 'fs/promises';
import * as path from 'path';
import { extractDocument, getFormatConfig, DOCUMENT_EXTENSIONS } from '../services/utils/document-loader';
import type { ChatSessionSummary } from '../../shared/ipc/sessions';
import { createLogger } from '../utils/logger';

const log = createLogger('Chat');

/**
 * How long the pump waits before giving up on the renderer.
 *
 * Replaces the `timeout: GRAPH_TIMEOUT_MS` option the old `graph.streamEvents()` call
 * passed � LangGraph enforced it, and now the pump owns it. It is a leash on *waiting*,
 * not on the run: `ask-turn.ts` has its own 10-minute `ASK_RUN_TIMEOUT_MS` for that.
 */
const ASK_PUMP_TIMEOUT_MS = 120_000;

/** One entry per push the translator produced; the shape the renderer folds into a message. */
interface ThinkingStepRow {
  type: string;
  step: string;
  status: string;
  detail: string;
  data?: unknown;
  update?: boolean;
}

/**
 * Turns whose stream pump is currently running, so `chat:cancelTurn` can stop one and so
 * every push of that turn can share one monotonic sequence. Keyed by the per-turn
 * `thread_id`, which the renderer already holds from the `chat:turn-started` push.
 */
interface ActiveTurn {
  controller: AbortController;
  cancelledByUser: boolean;
  /** Stamped on every push; the renderer uses it to order and to drop replayed events. */
  seq: number;
}

const activeTurns = new Map<string, ActiveTurn>();

/**
 * Start a turn and get back a `send` that stamps `{threadId, sessionId, seq}` on every
 * push it makes.
 *
 * The renderer correlates a stream positionally today — "the last message if it is the
 * assistant and still streaming" (`useChatSession.ts:218-230`) — so it cannot tell a stale
 * chunk from a fresh one, and two concurrent turns interleave into a single transcript.
 * `browser:*` already carries a sessionId (`browser-handlers.ts:57`), so this is the repo's
 * own pattern applied to the chat channels rather than a new invention.
 *
 * The envelope is additive: `seq` is assigned by reference through the shared `ActiveTurn`,
 * so a turn that ends and gets cancelled still reports its true ordering.
 */
function beginTurn(sender: Electron.WebContents, threadId: string, sessionId: string | null) {
  const turn: ActiveTurn = { controller: new AbortController(), cancelledByUser: false, seq: 0 };
  activeTurns.set(threadId, turn);
  const send = (channel: string, payload: Record<string, unknown>) => {
    turn.seq += 1;
    sender.send(channel, { ...payload, threadId, sessionId, seq: turn.seq });
  };
  return { turn, send };
}

interface AttachmentPath {
  name: string;
  path: string;
  type: string;
}

interface AttachmentContent {
  name: string;
  content: string;
  type: string;
}

const MAX_TEXT_FILE_SIZE = 100 * 1024; // 100KB for plain text/code files

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'json', 'js', 'jsx', 'ts', 'tsx', 'py', 'html', 'css',
  'yaml', 'yml', 'xml', 'csv', 'log', 'ini', 'toml', 'go', 'rs', 'java',
  'cpp', 'c', 'h', 'rb', 'php', 'sql', 'sh', 'bash', 'zsh', 'env',
  'gitignore', 'dockerfile', 'makefile', 'prisma', 'graphql', 'gql',
  'vue', 'svelte', 'astro', 'scss', 'less', 'styl', 'svg',
]);

function isBinary(buffer: Buffer): boolean {
  // Check first 1KB for null bytes
  const sampleSize = Math.min(buffer.length, 1024);
  for (let i = 0; i < sampleSize; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

async function readSingleFile(filePath: string, fileName: string): Promise<AttachmentContent> {
  try {
    const stat = await fs.stat(filePath);
    const ext = path.extname(fileName).replace('.', '').toLowerCase();

    // Try document-specific extraction for known formats
    if (DOCUMENT_EXTENSIONS.has(ext)) {
      const formatConfig = getFormatConfig(ext);
      if (formatConfig && stat.size > formatConfig.maxSize) {
        return {
          name: fileName,
          content: `[File too large (${(stat.size / (1024 * 1024)).toFixed(1)}MB). Maximum for ${ext.toUpperCase()} is ${(formatConfig.maxSize / (1024 * 1024))}MB.]`,
          type: 'file',
        };
      }

      if (stat.size === 0) {
        return { name: fileName, content: `[File "${fileName}" is empty.]`, type: 'file' };
      }

      const result = await extractDocument(filePath, fileName, ext);
      return { name: fileName, content: result.content, type: result.type };
    }

    // Fall back to text file logic
    if (stat.size > MAX_TEXT_FILE_SIZE) {
      return {
        name: fileName,
        content: `[File too large (${(stat.size / 1024).toFixed(1)}KB). Maximum is ${(MAX_TEXT_FILE_SIZE / 1024)}KB.]`,
        type: 'file',
      };
    }

    const buffer = await fs.readFile(filePath);

    if (isBinary(buffer)) {
      return {
        name: fileName,
        content: `[Binary file — content not available]`,
        type: 'file',
      };
    }

    const content = buffer.toString('utf-8');
    const lang = TEXT_EXTENSIONS.has(ext) ? ext : 'text';

    return {
      name: fileName,
      content: `\`\`\`${lang}\n${content}\n\`\`\``,
      type: 'file',
    };
  } catch (err) {
    return {
      name: fileName,
      content: `[Error reading file: ${err instanceof Error ? err.message : 'Unknown error'}]`,
      type: 'file',
    };
  }
}

async function readAttachmentContents(attachmentPaths: AttachmentPath[]): Promise<AttachmentContent[]> {
  const results: AttachmentContent[] = [];

  for (const item of attachmentPaths) {
    try {
      const stat = await fs.stat(item.path);

      if (stat.isDirectory()) {
        // Read top-level text/code/document files from folder only
        const entries = await fs.readdir(item.path, { withFileTypes: true });
        const allFiles = entries
          .filter(entry => {
            if (!entry.isFile()) return false;
            const ext = path.extname(entry.name).replace('.', '').toLowerCase();
            return TEXT_EXTENSIONS.has(ext) || DOCUMENT_EXTENSIONS.has(ext);
          })
          .slice(0, 20); // Max 20 files per folder

        for (const file of allFiles) {
          const fullPath = path.join(item.path, file.name);
          results.push(await readSingleFile(fullPath, `${item.name}/${file.name}`));
        }
      } else {
        results.push(await readSingleFile(item.path, item.name));
      }
    } catch (err) {
      results.push({
        name: item.name,
        content: `[Error: ${err instanceof Error ? err.message : 'Path not accessible'}]`,
        type: 'file',
      });
    }
  }

  return results;
}

export function registerChatHandlers(): void {
  log.info('Registering chat handlers...');

  /**
   * The renderer that last asked about chat. A session-list push has no originating event to
   * answer, so it goes here instead of `getMainWindow()` — the palette window can be recreated, and
   * a stale reference would silently stop updating the history list. It is refreshed by every
   * renderer-initiated chat call, so a new window re-establishes it on its first `chat:initialize`.
   */
  let chatRenderer: Electron.WebContents | null = null;

  const publishSessions = (sessions: ChatSession[]) => {
    if (!chatRenderer || chatRenderer.isDestroyed()) return;
    // A summary, not the transcripts: the history list renders `{id, title}` and a session's
    // messages can be hundreds of KB, so pushing them would serialise the whole conversation on
    // every message.
    const summaries: ChatSessionSummary[] = sessions.map((session) => ({
      id: session.id,
      title: session.title,
      updatedAt: new Date(session.updatedAt).toISOString(),
      messageCount: session.messages.length,
    }));
    chatRenderer.send('chat:sessions-changed', summaries);
  };
  langChainAgent.setSessionsChangedNotifier(publishSessions);

  ipcMain.handle('chat:initialize', async (event: IpcMainInvokeEvent) => {
    chatRenderer = event.sender;
    try {
      await langChainAgent.initialize();
      const ready = langChainAgent.isReady();
      if (ready) {
        // The first session list arrives as a push, so the renderer never fetches it. That fetch,
        // wrapped in an effect whose dependency was a fresh closure every render, is what became an
        // unbounded `chat:listSessions` loop while Ask mode was open.
        publishSessions(await langChainAgent.listSessions());
        return { success: true, ready };
      }
      // `initialize()` latches `isInitialized`, so a second call cannot pick up a key
      // added after boot — the renderer must not offer a retry that cannot succeed.
      return {
        success: true,
        ready: false,
        retryable: false,
        error: process.env.API_KEY
          ? 'The model client could not be created. Check MODEL and BASE_URL, then restart Qyther.'
          : 'No model is configured. Set the API_KEY environment variable (optionally MODEL and BASE_URL) and restart Qyther.',
      };
    } catch (error) {
      log.error('Initialization error:', error);
      return { 
        success: false, 
        ready: false, 
        retryable: true,
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });

  ipcMain.handle('chat:createSession', async (
    _event: IpcMainInvokeEvent,
    title?: string
  ): Promise<{ success: boolean; sessionId?: string; error?: string }> => {
    try {
      const sessionId = await langChainAgent.createSession(title);
      return { success: true, sessionId };
    } catch (error) {
      log.error('Error creating session:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  });

  // Get current session
  ipcMain.handle('chat:getCurrentSession', async (): Promise<ChatSession | null> => {
    return await langChainAgent.getCurrentSession();
  });

  // Get specific session
  ipcMain.handle('chat:getSession', async (
    _event: IpcMainInvokeEvent,
    sessionId: string
  ): Promise<ChatSession | null> => {
    return await langChainAgent.getSession(sessionId);
  });

  // List all sessions
  ipcMain.handle('chat:listSessions', async (): Promise<ChatSession[]> => {
    return await langChainAgent.listSessions();
  });

  // Switch to a session
  ipcMain.handle('chat:switchSession', async (
    _event: IpcMainInvokeEvent,
    sessionId: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      await langChainAgent.switchSession(sessionId);
      return { success: true };
    } catch (error) {
      log.error('Error switching session:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  });

  ipcMain.handle('chat:deleteSession', async (
    _event: IpcMainInvokeEvent,
    sessionId: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      await langChainAgent.deleteSession(sessionId);
      return { success: true };
    } catch (error) {
      log.error('Error deleting session:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  });

  // Clear chat history
  ipcMain.handle('chat:clearHistory', async (): Promise<{ success: boolean; error?: string }> => {
    try {
      await langChainAgent.clearHistory();
      return { success: true };
    } catch (error) {
      log.error('Error clearing history:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  });

  ipcMain.handle('chat:isReady', async (): Promise<boolean> => {
    return langChainAgent.isReady();
  });

  ipcMain.handle('chat:sendStreamMessage', async (
    event: IpcMainInvokeEvent,
    { content, sessionId, attachmentPaths }: { content: string; sessionId?: string; attachmentPaths?: AttachmentPath[] }
  ): Promise<{ success: boolean; response?: string; error?: string }> => {
    chatRenderer = event.sender;
    log.debug('Received sendStreamMessage:', {
      content: content.substring(0, 100),
      sessionId,
      attachmentCount: attachmentPaths?.length || 0,
      attachmentPaths: attachmentPaths?.map(a => a.path),
    });
    let turnKey: string | undefined;
    // Replaced by the stamping sender once the turn opens. The catch block runs even when
    // the turn never started (an attachment read or the model bootstrap threw first), so
    // the fallback must still deliver the terminal chunk — unstamped, which the renderer
    // accepts by design.
    let send: (channel: string, payload: Record<string, unknown>) => void =
      (channel, payload) => event.sender.send(channel, payload);
    try {
      // Align backend session with the caller's session before reading history
      if (sessionId) {
        await langChainAgent.switchSession(sessionId);
      }

      // Per-turn id. It no longer isolates LangGraph checkpoint state — there is no
      // checkpointer — but the renderer echoes it back on `chat:cancelTurn`, so it must stay
      // unique per turn and it is still the attribution key for the `{threadId, seq}` stamp.
      const turnThreadId = sessionId
        ? `${sessionId}:turn-${Date.now()}`
        : `thread-${Date.now()}`;

      // Open the turn before anything can be pushed, so attachment reads and the first
      // token share one sequence, and `chat:cancelTurn` can stop a turn still preparing.
      const begun = beginTurn(event.sender, turnThreadId, sessionId ?? null);
      const turn = begun.turn;
      send = begun.send;
      const abortController = turn.controller;
      turnKey = turnThreadId;
      send('chat:turn-started', {});

      // Read file contents from attachment paths
      let attachmentContents: AttachmentContent[] = [];
      if (attachmentPaths && attachmentPaths.length > 0) {
        log.debug('Starting to read attachment files:', attachmentPaths.map(a => a.path));
        attachmentContents = await readAttachmentContents(attachmentPaths);
        log.debug('File read results:', attachmentContents.map(a => ({ name: a.name, contentLen: a.content.length })));
      }

      const history = await langChainAgent.getCurrentSession();
      const priorTurns: AskHistoryEntry[] = (history?.messages ?? [])
        .filter(m => m.role !== 'system')
        .slice(-10)
        .map(m => ({ role: m.role === 'user' ? 'user' as const : 'assistant' as const, content: m.content }));

      const attachmentContext = attachmentContents.length > 0
        ? attachmentContents.map(a => `\n--- ${a.name} ---\n${a.content}\n--- End: ${a.name} ---`).join('\n')
        : undefined;

      /**
       * The whole pump. One `AgentEvent` at a time becomes zero or more semantic pushes,
       * and the run returns the accumulated answer — so there is no final state read back
       * from a checkpointer, and no `metadata.langgraph_node` to route on.
       *
       * `tool_execution` is sequential inside the agent, so `step` (the tool name) is unique
       * among steps in flight; that is what lets the renderer's fold match a completion onto
       * the right open step.
       */
      const thinkingSteps: ThinkingStepRow[] = [];
      const openSteps = new Map<string, ThinkingStepRow>();
      let streamedContent = '';
      let lastEmittedAgent = '';
      const startedAt = Date.now();

      const pushStep = (row: ThinkingStepRow) => {
        if (row.status === 'completed') openSteps.delete(row.step);
        else openSteps.set(row.step, row);
        thinkingSteps.push(row);
        send('chat:thinking-step', row as unknown as Record<string, unknown>);
      };

      const onEvent = (event: AskStreamEvent) => {
        switch (event.kind) {
          case 'token':
            streamedContent += event.text;
            send('chat:stream-chunk', { chunk: event.text, isComplete: false });
            return;
          case 'agent':
            if (event.label !== lastEmittedAgent) {
              lastEmittedAgent = event.label;
              send('chat:agent-change', { label: event.label });
            }
            return;
          case 'step-start':
            pushStep({ type: 'tool_start', step: event.step, status: 'in_progress', detail: event.detail, data: event.data });
            return;
          case 'step-complete': {
            const open = openSteps.get(event.step);
            const row: ThinkingStepRow = open
              ? { ...open, status: 'completed', detail: event.detail, update: true }
              : { type: 'node_end', step: event.step, status: 'completed', detail: event.detail };
            pushStep(row);
            return;
          }
          // `ui-payload` and `sources` are accumulated by the translator and shipped in the
          // terminal chunk. Pushing them mid-turn would be wrong: the renderer only renders a
          // payload once `isStreaming` is false (`ChatMessageBubble.tsx:280`), so an early push
          // would be dropped rather than shown.
          default:
            return;
        }
      };

      /**
       * The pump's own leash on *waiting*. Distinct from `ASK_RUN_TIMEOUT_MS` inside
       * `ask-turn.ts`, which is a whole-run budget: this one stops the renderer waiting
       * after two minutes and tells the user so, exactly as `GRAPH_TIMEOUT_MS` did.
       */
      let timedOut = false;
      const timeoutTimer = setTimeout(() => {
        timedOut = true;
        abortController.abort();
      }, ASK_PUMP_TIMEOUT_MS);

      let run;
      try {
        run = await runAskTurn(
          { query: content, sessionId: sessionId ?? turnThreadId, history: priorTurns, attachmentContext, signal: abortController.signal },
          onEvent,
        );
      } finally {
        clearTimeout(timeoutTimer);
      }

      // Three exits, three shapes: a user Stop is a finished turn, a timeout is an error the
      // user should retry, and anything else falls through to the normal terminal chunk.
      if (timedOut) {
        send('chat:stream-chunk', {
          chunk: '',
          isComplete: true,
          error: 'Request timed out. Please try again.',
        });
        return { success: false, error: 'Ask turn timed out' };
      }

      if (abortController.signal.aborted && turn.cancelledByUser) {
        send('chat:stream-chunk', { chunk: '', isComplete: true });
        return { success: true, response: streamedContent };
      }

      const fullResponse = run.text || streamedContent;
      const uiPayloads: UiPayload[] = [...run.summary.uiPayloads];
      const sources: Source[] = [...run.summary.sources];

      const estimatedTokens = Math.floor(fullResponse.length / 4);
      const metrics = {
        tokensUsed: estimatedTokens,
        inputTokens: Math.floor(estimatedTokens * 0.3),
        outputTokens: Math.floor(estimatedTokens * 0.7),
        estimatedCost: (estimatedTokens * 0.0002) / 1000,
        durationMs: Date.now() - startedAt,
        model: process.env.MODEL || 'qwen3.6-plus',
      };

      // `uiPayloads` and `sources` are applied by the renderer only when non-empty, so an
      // empty array and an absent key are the same thing on the wire — send them anyway so
      // the payload shape stays flat.
      send('chat:stream-chunk', {
        chunk: '',
        isComplete: true,
        metrics,
        thinkingSteps,
        fullContent: fullResponse || null,
        uiPayloads,
        sources,
      });

      if (fullResponse) {
        langChainAgent.addMessagePublic('user', content);
        langChainAgent.addMessagePublic('assistant', fullResponse, {
          sources: sources.map((s, i) => ({ id: `source-${i}`, url: s.url, title: s.title, excerpt: s.excerpt })),
          uiPayloads: uiPayloads.length > 0 ? uiPayloads : undefined,
        });
      }

      return { success: true, response: fullResponse };
    } catch (error) {
      log.error('Ask turn error:', error);
      const message = error instanceof AskNotConfiguredError
        ? 'AI endpoint is not configured (MODEL/BASE_URL/API_KEY)'
        : error instanceof Error ? error.message : 'Unknown error occurred';
      send('chat:stream-chunk', { chunk: '', isComplete: true, error: message });
      return { success: false, error: message };
    } finally {
      // Every exit path — normal completion, a Stop press, a thrown tool, the timeout —
      // drops the turn so its `AbortController` cannot outlive the turn that made it.
      if (turnKey) activeTurns.delete(turnKey);
    }
  });

  /**
   * Stops the turn the renderer is watching. Without this, Stop reset renderer state
   * while main kept generating and streaming into the transcript it had just cleared.
   */
  ipcMain.handle('chat:cancelTurn', async (
    _event: IpcMainInvokeEvent,
    { threadId }: { threadId: unknown }
  ): Promise<{ success: boolean; error?: string }> => {
    if (typeof threadId !== 'string' || threadId.length === 0) {
      return { success: false, error: 'threadId must be a non-empty string' };
    }

    const turn = activeTurns.get(threadId);
    if (!turn) {
      // Already finished, already cancelled, or never started — nothing to stop.
      return { success: true };
    }

    turn.cancelledByUser = true;
    turn.controller.abort();
    log.info('Cancelled turn:', threadId);
    return { success: true };
  });
}
