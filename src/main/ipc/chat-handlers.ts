import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { langChainAgent, ChatSession } from '../services/langchain/agent';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { getAskGraph } from '../services/langgraph/research-agent';
import { Command } from '@langchain/langgraph';
import * as fs from 'fs/promises';
import * as path from 'path';
import { extractDocument, getFormatConfig, DOCUMENT_EXTENSIONS } from '../services/utils/document-loader';
import { createLogger } from '../utils/logger';

interface GraphStateValues {
  finalResponse?: string;
  uiPayloads?: Array<{ type: string; title: string; data: Record<string, unknown>; node: string }>;
  desktopActions?: Array<{ type: string; description: string; success: boolean; result?: string }>;
  __interrupt__?: Array<{ value: { type: string; action: string; description: string; dangerLevel?: string; args?: Record<string, unknown>; confirmationId?: string; sessionId?: string } }>;
  retryCount?: number;
  qualityScore?: number;
  confidence?: number;
  sources?: Array<{ url: string; title: string; excerpt: string }>;
  reasoningSteps?: Array<{ step: string; status: string; detail: string }>;
  userQuery?: string;
  [key: string]: unknown;
}

interface GraphState {
  values: GraphStateValues;
}

const log = createLogger('Chat');

// Serialize SQLite state access to prevent SQLITE_BUSY errors from concurrent reads/writes
let stateAccessLock = Promise.resolve();

async function withStateLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = stateAccessLock;
  let resolve!: () => void;
  const next = new Promise<void>((r) => { resolve = r; });
  stateAccessLock = prev.then(() => next);
  await prev;
  try {
    return await fn();
  } finally {
    resolve();
  }
}

const MAX_MESSAGES = 20;

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
  
  ipcMain.handle('chat:initialize', async () => {
    try {
      await langChainAgent.initialize();
      return { success: true, ready: langChainAgent.isReady() };
    } catch (error) {
      log.error('Initialization error:', error);
      return { 
        success: false, 
        ready: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });

  ipcMain.handle('chat:sendMessage', async (
    event: IpcMainInvokeEvent,
    { content, sessionId }: { content: string; sessionId?: string }
  ): Promise<{ success: boolean; response?: string; error?: string }> => {
    try {
      // Check for slash commands
      if (content === '/browser-close') {
        await langChainAgent.closeBrowserSession();
        return { 
          success: true, 
          response: 'Browser session closed. Enable browser mode and ask a question to start a new session.'
        };
      }

      // Switch to session if provided
      if (sessionId) {
        await langChainAgent.switchSession(sessionId);
      }

      const response = await langChainAgent.sendMessage(content, (chunk: string) => {
        // Send chunks to renderer via webContents
        event.sender.send('chat:stream-chunk', { chunk, isComplete: false });
      });

      // Send completion signal
      event.sender.send('chat:stream-chunk', { chunk: '', isComplete: true });

      return { success: true, response };
    } catch (error) {
      log.error('Error sending message:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
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
    log.debug('Received sendStreamMessage:', {
      content: content.substring(0, 100),
      sessionId,
      attachmentCount: attachmentPaths?.length || 0,
      attachmentPaths: attachmentPaths?.map(a => a.path),
    });
    try {
      const graph = await getAskGraph();

      // Align backend session with the caller's session before reading history
      if (sessionId) {
        await langChainAgent.switchSession(sessionId);
      }

      // Per-turn thread ID isolates LangGraph checkpoint state from other turns
      const turnThreadId = sessionId
        ? `${sessionId}:turn-${Date.now()}`
        : `thread-${Date.now()}`;

      // Read file contents from attachment paths
      let attachmentContents: AttachmentContent[] = [];
      if (attachmentPaths && attachmentPaths.length > 0) {
        log.debug('Starting to read attachment files:', attachmentPaths.map(a => a.path));
        attachmentContents = await readAttachmentContents(attachmentPaths);
        log.debug('File read results:', attachmentContents.map(a => ({ name: a.name, contentLen: a.content.length })));
      }

      const history = await langChainAgent.getCurrentSession();

      // Build messages array — inject attachment context first if files are attached
      const messages: Array<HumanMessage | AIMessage | SystemMessage> = [];

      // Inject current date as system context so the LLM can answer date-related queries
      const today = new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      messages.push(new SystemMessage(`You have access to the current date. Today is ${today}. When asked about the date, day, or time, use this information directly. Do NOT say you don't have access to a clock or calendar — use the date provided here.`));

      if (attachmentContents.length > 0) {
        const attachmentContext = attachmentContents.map(a =>
          `\n--- ${a.name} ---\n${a.content}\n--- End: ${a.name} ---`
        ).join('\n');
        messages.push(new SystemMessage(`The user has attached the following files as context for this conversation. Reference their contents when answering:\n${attachmentContext}`));
      }

      if (history) {
        const recentMessages = history.messages
          .filter(m => m.role !== 'system')
          .slice(-10)
          .map(m => m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content));
        messages.push(...recentMessages);
      }

      messages.push(new HumanMessage(content));

      // Cap messages to prevent context window overflow
      if (messages.length > MAX_MESSAGES) {
        const systemMsgs = messages.filter(m => m instanceof SystemMessage);
        const nonSystem = messages.filter(m => !(m instanceof SystemMessage));
        messages.length = 0;
        messages.push(...systemMsgs, ...nonSystem.slice(-(MAX_MESSAGES - systemMsgs.length)));
      }

      let fullResponse = '';
      let thinkingSteps: Array<{ type: string; step: string; status: string; detail: string; data?: unknown }> = [];
      const startTime = Date.now();
      let estimatedTokens = 0;

      const responseNodes = new Set([
        'generalChat', 'synthesizeWithSelfCheck',
        'internalKnowledge', 'quickVerify', 'fastPath', 'fallbackSearch',
        'browserAgent', 'desktopAgent',
      ]);

      let streamedContent = '';
      const nodeRunCounts = new Map<string, number>();

      const GRAPH_TIMEOUT_MS = 120_000; // 120 seconds max for graph execution (desktop/browser agents need more time)
      const abortController = new AbortController();

      const stream = graph.streamEvents(
        { messages, userQuery: content, attachments: attachmentContents },
        {
          version: "v2",
          configurable: { thread_id: turnThreadId },
          recursionLimit: 50,
          signal: abortController.signal,
          timeout: GRAPH_TIMEOUT_MS,
        }
      );

      try {
        for await (const streamEvent of stream) {
        if (abortController.signal.aborted) {
          log.warn('Aborting stream iteration due to timeout or cancellation');
          break;
        }

        const nodeName = streamEvent.metadata?.langgraph_node as string | undefined;
        const eventName = streamEvent.event;
        const streamName = streamEvent.name;

        if (eventName === "on_chat_model_stream") {
          if (!nodeName || !responseNodes.has(nodeName)) {
            continue;
          }

          // Track how many times each node has run
          const runCount = (nodeRunCounts.get(nodeName) || 0) + 1;
          nodeRunCounts.set(nodeName, runCount);

          // Detect loop: if synthesize/quickVerify/replan runs more than once, it's a retry
          const isLoopNode = ['synthesizeWithSelfCheck', 'quickVerify', 'replan'].includes(nodeName);
          if (isLoopNode && runCount > 1) {
            // New iteration: reset streamed content and update the UI
            if (runCount === 2) {
              // Replace the entire response with the new attempt's content
              streamedContent = '';
              // Reset UI payload state for the retry
              event.sender.send('chat:ui-payload-reset', {});
            }
          }

          const contentChunk = streamEvent.data.chunk?.content;

          if (contentChunk) {
            const textContent = typeof contentChunk === 'string'
              ? contentChunk
              : Array.isArray(contentChunk)
                ? contentChunk.filter((c: { type: string; text: string }) => c.type === 'text').map((c: { type: string; text: string }) => c.text).join('')
                : '';

            if (textContent) {
              if (isLoopNode && runCount > 1) {
                // On retries, accumulate fresh content for this attempt only
                streamedContent += textContent;
                // Replace the entire assistant message in the UI
                event.sender.send('chat:stream-replace', { content: streamedContent, isComplete: false });
              } else {
                streamedContent += textContent;
                fullResponse += textContent;
                event.sender.send('chat:stream-chunk', { chunk: textContent, isComplete: false });
              }
            }
          }

          if (nodeName === 'synthesizeWithSelfCheck' && runCount > 0) {
            event.sender.send('chat:ui-payload-progress', { progress: 0.6, message: 'Synthesizing results...' });
          }

          if (nodeName === 'chartNode' && runCount > 0) {
            event.sender.send('chat:ui-payload-progress', { progress: 0.7, message: 'Rendering visualization...' });
          }
        } else if (eventName === "on_chain_start" && streamName) {
          const step: typeof thinkingSteps[number] = {
            type: "node_start",
            step: streamName,
            status: "in_progress",
            detail: `Starting ${streamName}`,
          };
          thinkingSteps.push(step);
          event.sender.send('chat:thinking-step', step);

          if (streamName === 'comparisonNode') {
            event.sender.send('chat:ui-payload-started', { type: 'comparison' });
            event.sender.send('chat:ui-payload-progress', { progress: 0.2, message: 'Analyzing comparison request...' });
          }
          if (streamName === 'formNode') {
            event.sender.send('chat:ui-payload-started', { type: 'form' });
            event.sender.send('chat:ui-payload-progress', { progress: 0.2, message: 'Analyzing configuration requirements...' });
          }
          if (streamName === 'chartNode') {
            event.sender.send('chat:ui-payload-started', { type: 'chart' });
            event.sender.send('chat:ui-payload-progress', { progress: 0.2, message: 'Analyzing data...' });
          }
          if (streamName === 'desktopAgent') {
            event.sender.send('chat:ui-payload-progress', { progress: 0.2, message: 'Analyzing desktop task...' });
          }
        } else if (eventName === "on_chain_end" && streamName) {
          const existingStep = thinkingSteps.find(s => s.step === streamName && s.status === 'in_progress');
          if (existingStep) {
            existingStep.status = 'completed';
            existingStep.detail = `Completed ${streamName}`;
            event.sender.send('chat:thinking-step', { ...existingStep, update: true });
          } else {
            const step: typeof thinkingSteps[number] = {
              type: "node_end",
              step: streamName,
              status: "completed",
              detail: `Completed ${streamName}`,
            };
            thinkingSteps.push(step);
            event.sender.send('chat:thinking-step', step);
          }

          // Send final progress for structured UI nodes
          if (streamName === 'comparisonNode') {
            event.sender.send('chat:ui-payload-progress', { progress: 0.9, message: 'Building comparison table...' });
          }
          if (streamName === 'formNode') {
            event.sender.send('chat:ui-payload-progress', { progress: 0.9, message: 'Validating form fields...' });
          }
          if (streamName === 'chartNode') {
            event.sender.send('chat:ui-payload-progress', { progress: 0.9, message: 'Rendering visualization...' });
          }
        } else if (eventName === "on_tool_start") {
          const step: typeof thinkingSteps[number] = {
            type: "tool_start",
            step: "tool_execution",
            status: "in_progress",
            detail: `Executing: ${streamName}`,
            data: streamEvent.data.input,
          };
          thinkingSteps.push(step);
          event.sender.send('chat:thinking-step', step);
        } else if (eventName === "on_tool_end") {
          const existingStep = thinkingSteps.find(s => s.status === 'in_progress' && s.type === 'tool_start');
          if (existingStep) {
            existingStep.status = 'completed';
            existingStep.detail = `Completed: ${(existingStep.data as { name?: string } | undefined)?.name || 'tool'}`;
            event.sender.send('chat:thinking-step', { ...existingStep, update: true });
          }
        }
      }
      } catch (streamError) {
        // Error boundary: catch node-level failures without crashing the entire request
        log.error('Graph stream error:', streamError instanceof Error ? streamError.message : String(streamError));
        event.sender.send('chat:stream-chunk', {
          chunk: '',
          isComplete: true,
          error: streamError instanceof Error ? streamError.message : 'Graph execution error',
        });
        // Attempt graceful recovery: get whatever state was accumulated
        try {
          const recoveryState = await withStateLock(() =>
            graph.getState({ configurable: { thread_id: turnThreadId } })
          ) as { values?: Record<string, unknown> };
          if (recoveryState?.values?.finalResponse) {
            fullResponse = recoveryState.values.finalResponse as string;
          }
        } catch {
          // State unavailable; fall through with whatever content was streamed
        }
      }

      // Handle timeout: check if the signal was aborted due to timeout
      if (abortController.signal.aborted) {
        event.sender.send('chat:stream-chunk', {
          chunk: '',
          isComplete: true,
          error: 'Request timed out. Please try again.',
        });
        return { success: false, error: 'Graph execution timed out' };
      }

      // Get final state from checkpointer to ensure we have the last finalResponse
      let uiPayloads: GraphStateValues['uiPayloads'] = [];
      let graphState: GraphState | undefined;
      try {
        graphState = await withStateLock(() =>
          graph.getState({ configurable: { thread_id: turnThreadId } })
        );
        const stateFinalResponse = graphState?.values?.finalResponse as string | undefined;
        if (stateFinalResponse && stateFinalResponse !== streamedContent) {
          // The state has the authoritative final response
          fullResponse = stateFinalResponse;
          streamedContent = stateFinalResponse;
        }
        uiPayloads = (graphState?.values?.uiPayloads as GraphStateValues['uiPayloads']) || [];
      } catch (e) {
        log.warn('Could not get final graph state, using streamed content:', e);
      }

      // Emit desktop confirmation request when graph hit an interrupt() for destructive action.
      // LangGraph stores interrupt state; when interrupted, the graph pauses waiting for resume.
      const interruptState = graphState?.values?.__interrupt__ as Array<{ value: { type: string; action: string; description: string; dangerLevel?: string; args?: Record<string, unknown>; confirmationId?: string; sessionId?: string } }> | undefined;
      const needsConfirmation = Array.isArray(interruptState) && interruptState.length > 0
        && interruptState[0]?.value?.type === 'desktop_confirmation';
      if (needsConfirmation) {
        const interruptPayload = interruptState[0].value;
        event.sender.send('desktop:confirmation-request', {
          threadId: turnThreadId,
          interruptPayload: {
            type: interruptPayload.type,
            action: interruptPayload.action,
            description: interruptPayload.description,
          },
          pendingAction: {
            id: interruptPayload.confirmationId || `pending-${Date.now()}`,
            type: interruptPayload.action,
            description: interruptPayload.description,
            dangerLevel: interruptPayload.dangerLevel,
            args: interruptPayload.args,
            timestamp: new Date(),
            success: false,
            reversible: true,
          },
          planActions: graphState?.values?.desktopActions || [],
        });
      }

      // Compute metrics
      estimatedTokens = Math.floor(fullResponse.length / 4);
      const durationMs = Date.now() - startTime;
      const metrics = {
        tokensUsed: estimatedTokens,
        inputTokens: Math.floor(estimatedTokens * 0.3),
        outputTokens: Math.floor(estimatedTokens * 0.7),
        estimatedCost: (estimatedTokens * 0.0002) / 1000,
        durationMs,
        model: process.env.FAST_MODEL
          ? `fast:${process.env.FAST_MODEL} → ${process.env.MODEL}`
          : process.env.MODEL || 'qwen3.6-plus',
      };

      // Format reasoning steps for the ReasoningTrace component
      const reasoning = {
        steps: thinkingSteps
          .filter(s => s.status === 'completed')
          .map((s, i) => ({
            stepNumber: i + 1,
            action: s.step,
            reasoning: s.detail,
            confidence: 85,
          })),
      };

      // Get retry metadata from graph state
      let selfCorrected = false;
      let iterationsUsed = 1;
      let finalQualityScore = 0;
      let finalConfidence = 0;
      try {
        const graphState = await withStateLock(() =>
          graph.getState({ configurable: { thread_id: turnThreadId } })
        ) as { values: Record<string, unknown> };
        const stateValues = graphState?.values || {};
        const retryCount = (stateValues.retryCount as number) || 0;
        selfCorrected = retryCount > 0;
        iterationsUsed = retryCount + 1;
        finalQualityScore = (stateValues.qualityScore as number) || 0;
        finalConfidence = (stateValues.confidence as number) || 0;
      } catch (e) {
        // Fallback: check thinking steps for retry indicators
        const validateSteps = thinkingSteps.filter(s => s.step === 'validate' || s.step === 'Quality Validation');
        if (validateSteps.length > 1) {
          selfCorrected = true;
          iterationsUsed = validateSteps.length;
        }
        log.warn("Could not get graph state for confidence:", e);
      }

      // Include sources and reasoning steps from graph state
      const graphSources = (graphState?.values?.sources as Array<{ url: string; title: string; excerpt: string }> ) || [];
      const graphReasoningSteps = (graphState?.values?.reasoningSteps as Array<{ step: string; status: string; detail: string }> ) || [];

      // Convert graph reasoning steps to the renderer's ThinkingStep shape for a more truthful timeline
      const graphThinkingSteps: Array<{ type: string; step: string; status: string; detail: string }> = graphReasoningSteps.map(rs => ({
        type: 'graph_reasoning',
        step: rs.step,
        status: rs.status,
        detail: rs.detail,
      }));

      // Prefer graph-native steps when available; fall back to stream events so the UI stays live during streaming
      const effectiveThinkingSteps = graphThinkingSteps.length > 0 ? graphThinkingSteps : thinkingSteps;

      // Canonicalize: validationScore is derived from qualityScore so the UI never sees a permanently-zero field
      const validationScore = finalQualityScore;

      event.sender.send('chat:stream-chunk', {
        chunk: '',
        isComplete: true,
        metrics,
        reasoning,
        thinkingSteps: effectiveThinkingSteps,
        selfCorrected,
        iterationsUsed,
        validationScore,
        confidence: finalConfidence,
        qualityScore: finalQualityScore,
        verificationSkipped: finalConfidence >= 0.8,
        fullContent: streamedContent || null,
        uiPayloads,
        sources: graphSources,
      });

      if (fullResponse) {
        langChainAgent.addMessagePublic('user', content);
        langChainAgent.addMessagePublic('assistant', fullResponse, {
          sources: graphSources.map((s, i) => ({
            id: `source-${i}`,
            url: s.url,
            title: s.title,
            excerpt: s.excerpt,
          })),
          uiPayloads: uiPayloads.length > 0 ? uiPayloads : undefined,
          confidence: finalConfidence,
          qualityScore: finalQualityScore,
        });
      }

      return { success: true, response: fullResponse };
    } catch (error) {
      log.error('Stream error:', error);
      event.sender.send('chat:stream-chunk', {
        chunk: '',
        isComplete: true,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  });

  ipcMain.handle('chat:resumeGraph', async (
    event: IpcMainInvokeEvent,
    { threadId, resumeValue }: { threadId: string; resumeValue: { confirmed: boolean } }
  ): Promise<{ success: boolean; response?: string; error?: string }> => {
    try {
      const graph = await getAskGraph();
      const command = new Command({ resume: resumeValue.confirmed });

      let fullResponse = '';
      const responseNodes = new Set([
        'generalChat', 'synthesizeWithSelfCheck',
        'internalKnowledge', 'quickVerify', 'fastPath', 'fallbackSearch',
        'browserAgent', 'desktopAgent',
      ]);

      const RESUME_TIMEOUT_MS = 60_000; // 60 seconds max for resume (desktop confirmation flows need more time)
      const abortController = new AbortController();

      try {
        const stream = graph.streamEvents(
          command,
          {
            version: "v2",
            configurable: { thread_id: threadId },
            recursionLimit: 50,
            signal: abortController.signal,
            timeout: RESUME_TIMEOUT_MS,
          }
        );

        for await (const streamEvent of stream) {
          if (abortController.signal.aborted) {
            log.warn('Aborting resume stream due to timeout or cancellation');
            break;
          }

          const nodeName = streamEvent.metadata?.langgraph_node as string | undefined;
          const eventName = streamEvent.event;

          if (eventName === "on_chat_model_stream") {
            if (!nodeName || !responseNodes.has(nodeName)) continue;

            const contentChunk = streamEvent.data.chunk?.content;
            if (contentChunk) {
              const textContent = typeof contentChunk === 'string'
                ? contentChunk
                : Array.isArray(contentChunk)
                  ? contentChunk.filter((c: { type: string; text: string }) => c.type === 'text').map((c: { type: string; text: string }) => c.text).join('')
                  : '';

              if (textContent) {
                fullResponse += textContent;
                event.sender.send('chat:stream-chunk', { chunk: textContent, isComplete: false });
              }
            }
          }
        }
      } catch (resumeError) {
        // Error boundary for resume graph
        log.error('Resume graph stream error:', resumeError instanceof Error ? resumeError.message : String(resumeError));
        event.sender.send('chat:stream-chunk', {
          chunk: '',
          isComplete: true,
          error: resumeError instanceof Error ? resumeError.message : 'Resume graph execution error',
        });
        // Attempt to recover whatever state was accumulated
        try {
          const recoveryState = await withStateLock(() =>
            graph.getState({ configurable: { thread_id: threadId } })
          ) as { values?: Record<string, unknown> };
          if (recoveryState?.values?.finalResponse) {
            fullResponse = recoveryState.values.finalResponse as string;
          }
        } catch {
          // State unavailable; use whatever was streamed
        }
      } finally {
        // Timeout is handled by LangGraph's native timeout option; no manual cleanup needed
      }

      // Handle timeout: check if the signal was aborted due to timeout
      if (abortController.signal.aborted) {
        event.sender.send('chat:stream-chunk', {
          chunk: '',
          isComplete: true,
          error: 'Resume request timed out. Please try again.',
        });
        return { success: false, error: 'Resume graph execution timed out' };
      }

      // Get final state
      let uiPayloads: GraphStateValues['uiPayloads'] = [];
      let graphState: GraphState | undefined;
      try {
        graphState = await withStateLock(() =>
          graph.getState({ configurable: { thread_id: threadId } })
        );
        const stateFinalResponse = graphState?.values?.finalResponse as string | undefined;
        if (stateFinalResponse) {
          fullResponse = stateFinalResponse;
        }
        uiPayloads = (graphState?.values?.uiPayloads as GraphStateValues['uiPayloads']) || [];
      } catch (e) {
        log.warn('Could not get final graph state after resume:', e);
      }

      // Merge desktop actions into uiPayloads (single completion event)
      const desktopActions = (graphState?.values?.desktopActions as GraphStateValues['desktopActions']) || [];
      if (desktopActions.length > 0) {
        uiPayloads = [
          ...uiPayloads,
          ...desktopActions.map(a => ({
            type: 'desktop_action',
            title: a.description || a.type,
            data: { success: a.success, result: a.result },
            node: 'desktopConfirmation',
          })),
        ];
      }

      const finalConfidence = (graphState?.values?.confidence as number) || 0;
      const graphSources = (graphState?.values?.sources as Array<{ url: string; title: string; excerpt: string }>) || [];

      // Send single consolidated completion event
      event.sender.send('chat:stream-chunk', {
        chunk: '',
        isComplete: true,
        uiPayloads: uiPayloads.length > 0 ? uiPayloads : undefined,
        confidence: finalConfidence,
        sources: graphSources,
      });

      if (fullResponse) {
        const userQuery = (graphState?.values?.userQuery as string) || 'Resumed action';
        langChainAgent.addMessagePublic('user', userQuery);
        langChainAgent.addMessagePublic('assistant', fullResponse, {
          sources: graphSources.map((s, i) => ({
            id: `source-${i}`,
            url: s.url,
            title: s.title,
            excerpt: s.excerpt,
          })),
        });
      }

      return { success: true, response: fullResponse };
    } catch (error) {
      log.error('Resume graph error:', error);
      event.sender.send('chat:stream-chunk', {
        chunk: '',
        isComplete: true,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  });
}
