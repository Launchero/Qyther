import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';

/**
 * Session data structure for persistence
 */
export interface SessionData {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: SessionMessage[];
  mcpServers: string[];
  model?: string;
  parentId?: string;
}

export interface SessionMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  toolCalls?: ToolCallData[];
}

export interface ToolCallData {
  id: string;
  name: string;
  server: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  args?: Record<string, unknown>;
  result?: string;
}

// Sessions directory path
function getSessionsPath(): string {
  return path.join(app.getPath('userData'), 'opencode-sessions');
}

/**
 * Initialize sessions directory
 */
export async function initSessions(): Promise<void> {
  const sessionsPath = getSessionsPath();
  await fs.mkdir(sessionsPath, { recursive: true });
  console.log('[OpenCode Sessions] Initialized at:', sessionsPath);
}

/**
 * Get all session IDs
 */
export async function listSessions(): Promise<string[]> {
  const sessionsPath = getSessionsPath();

  try {
    const files = await fs.readdir(sessionsPath);
    return files
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));
  } catch (error) {
    return [];
  }
}

/**
 * Load a session by ID
 */
export async function loadSession(sessionId: string): Promise<SessionData | null> {
  const sessionsPath = getSessionsPath();
  const filePath = path.join(sessionsPath, `${sessionId}.json`);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.log('[OpenCode Sessions] Session not found:', sessionId);
    return null;
  }
}

/**
 * Save a session
 */
export async function saveSession(session: SessionData): Promise<void> {
  const sessionsPath = getSessionsPath();
  const filePath = path.join(sessionsPath, `${session.id}.json`);

  await fs.mkdir(sessionsPath, { recursive: true });

  // Update timestamps
  session.updatedAt = new Date().toISOString();

  await fs.writeFile(filePath, JSON.stringify(session, null, 2));
  console.log('[OpenCode Sessions] Saved session:', session.id);
}

/**
 * Create a new session
 */
export async function createSession(title: string = 'New Chat', mcpServers: string[] = []): Promise<SessionData> {
  const session: SessionData = {
    id: `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    title,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [],
    mcpServers,
  };

  await saveSession(session);
  return session;
}

/**
 * Delete a session
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const sessionsPath = getSessionsPath();
  const filePath = path.join(sessionsPath, `${sessionId}.json`);

  try {
    await fs.unlink(filePath);
    console.log('[OpenCode Sessions] Deleted session:', sessionId);
  } catch (error) {
    console.log('[OpenCode Sessions] Failed to delete session:', sessionId);
  }
}

/**
 * Add a message to a session
 */
export async function addMessageToSession(
  sessionId: string,
  message: SessionMessage
): Promise<SessionData | null> {
  const session = await loadSession(sessionId);

  if (!session) {
    console.log('[OpenCode Sessions] Session not found for adding message:', sessionId);
    return null;
  }

  session.messages.push(message);

  // Update title if first message
  if (session.messages.length === 1 && message.role === 'user') {
    session.title = message.content.slice(0, 50) + (message.content.length > 50 ? '...' : '');
  }

  await saveSession(session);
  return session;
}

/**
 * Get session history (list of sessions with metadata)
 */
export async function getSessionHistory(limit: number = 20): Promise<Array<{
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}>> {
  const sessionIds = await listSessions();
  const sessions: Array<{
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    messageCount: number;
  }> = [];

  for (const id of sessionIds.slice(0, limit)) {
    const session = await loadSession(id);
    if (session) {
      sessions.push({
        id: session.id,
        title: session.title,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messageCount: session.messages.length,
      });
    }
  }

  // Sort by updatedAt descending
  sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return sessions;
}

/**
 * Fork a session at a specific message
 */
export async function forkSession(
  sessionId: string,
  fromMessageIndex?: number
): Promise<SessionData | null> {
  const originalSession = await loadSession(sessionId);

  if (!originalSession) {
    return null;
  }

  const fork: SessionData = {
    id: `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    title: `${originalSession.title} (fork)`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: fromMessageIndex !== undefined
      ? originalSession.messages.slice(0, fromMessageIndex + 1)
      : [...originalSession.messages],
    mcpServers: [...originalSession.mcpServers],
    model: originalSession.model,
    parentId: sessionId,
  };

  await saveSession(fork);
  return fork;
}

/**
 * Check if session exists
 */
export async function sessionExists(sessionId: string): Promise<boolean> {
  const sessionsPath = getSessionsPath();
  const filePath = path.join(sessionsPath, `${sessionId}.json`);

  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get or create a session (cached in memory for quick access)
 */
const sessionCache: Map<string, SessionData> = new Map();

export async function getOrCreateSession(sessionId: string): Promise<SessionData> {
  // Check cache first
  const cached = sessionCache.get(sessionId);
  if (cached) {
    return cached;
  }

  // Try to load from disk
  const session = await loadSession(sessionId);
  if (session) {
    sessionCache.set(sessionId, session);
    return session;
  }

  // Create new session
  const newSession = await createSession();
  sessionCache.set(newSession.id, newSession);
  return newSession;
}

/**
 * Clear session cache
 */
export function clearSessionCache(): void {
  sessionCache.clear();
}

/**
 * Get recent sessions for quick access
 */
export async function getRecentSessions(limit: number = 10): Promise<SessionData[]> {
  const history = await getSessionHistory(limit);
  const sessions: SessionData[] = [];

  for (const item of history) {
    const session = await loadSession(item.id);
    if (session) {
      sessions.push(session);
    }
  }

  return sessions;
}