/**
 * IndexedDB storage for session persistence
 * Provides offline storage for chat sessions
 */

const DB_NAME = 'raycast-ask-sessions';
const DB_VERSION = 1;
const SESSION_STORE = 'sessions';

/**
 * Session data structure for IndexedDB
 */
export interface StoredSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: StoredMessage[];
  mcpServers: string[];
  model?: string;
  parentId?: string;
  lastAccessed?: number;
}

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  toolCalls?: StoredToolCall[];
}

export interface StoredToolCall {
  id: string;
  name: string;
  server: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  args?: Record<string, unknown>;
  result?: string;
}

interface DBSchema {
  sessions: StoredSession;
}

/**
 * Open IndexedDB database
 */
export async function openSessionDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('Failed to open IndexedDB'));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create sessions object store if it doesn't exist
      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        const store = db.createObjectStore(SESSION_STORE, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
        store.createIndex('lastAccessed', 'lastAccessed', { unique: false });
      }
    };
  });
}

/**
 * Save a session to IndexedDB
 */
export async function saveSessionToDB(session: StoredSession): Promise<void> {
  const db = await openSessionDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SESSION_STORE], 'readwrite');
    const store = transaction.objectStore(SESSION_STORE);

    const sessionWithAccess: StoredSession = {
      ...session,
      lastAccessed: Date.now(),
    };

    const request = store.put(sessionWithAccess);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error('Failed to save session'));
  });
}

/**
 * Load a session from IndexedDB
 */
export async function loadSessionFromDB(sessionId: string): Promise<StoredSession | null> {
  const db = await openSessionDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SESSION_STORE], 'readonly');
    const store = transaction.objectStore(SESSION_STORE);
    const request = store.get(sessionId);

    request.onsuccess = () => {
      resolve(request.result || null);
    };

    request.onerror = () => {
      reject(new Error('Failed to load session'));
    };
  });
}

/**
 * Delete a session from IndexedDB
 */
export async function deleteSessionFromDB(sessionId: string): Promise<void> {
  const db = await openSessionDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SESSION_STORE], 'readwrite');
    const store = transaction.objectStore(SESSION_STORE);
    const request = store.delete(sessionId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error('Failed to delete session'));
  });
}

/**
 * Get all sessions from IndexedDB
 */
export async function getAllSessionsFromDB(): Promise<StoredSession[]> {
  const db = await openSessionDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SESSION_STORE], 'readonly');
    const store = transaction.objectStore(SESSION_STORE);
    const request = store.getAll();

    request.onsuccess = () => {
      resolve(request.result || []);
    };

    request.onerror = () => {
      reject(new Error('Failed to get sessions'));
    };
  });
}

/**
 * Get session history (metadata only)
 */
export async function getSessionHistoryFromDB(limit: number = 20): Promise<Array<{
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}>> {
  const sessions = await getAllSessionsFromDB();

  // Sort by lastAccessed or updatedAt
  sessions.sort((a, b) => {
    const aTime = a.lastAccessed || new Date(a.updatedAt).getTime();
    const bTime = b.lastAccessed || new Date(b.updatedAt).getTime();
    return bTime - aTime;
  });

  return sessions.slice(0, limit).map(session => ({
    id: session.id,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    messageCount: session.messages.length,
  }));
}

/**
 * Clear all sessions from IndexedDB
 */
export async function clearAllSessionsFromDB(): Promise<void> {
  const db = await openSessionDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SESSION_STORE], 'readwrite');
    const store = transaction.objectStore(SESSION_STORE);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error('Failed to clear sessions'));
  });
}

/**
 * Add a message to an existing session
 */
export async function addMessageToSessionInDB(
  sessionId: string,
  message: StoredMessage
): Promise<StoredSession | null> {
  const session = await loadSessionFromDB(sessionId);

  if (!session) {
    return null;
  }

  session.messages.push(message);
  session.updatedAt = new Date().toISOString();
  session.lastAccessed = Date.now();

  // Update title if first message
  if (session.messages.length === 1 && message.role === 'user') {
    session.title = message.content.slice(0, 50) + (message.content.length > 50 ? '...' : '');
  }

  await saveSessionToDB(session);
  return session;
}

/**
 * Update a message in a session
 */
export async function updateMessageInDB(
  sessionId: string,
  messageId: string,
  updates: Partial<StoredMessage>
): Promise<StoredSession | null> {
  const session = await loadSessionFromDB(sessionId);

  if (!session) {
    return null;
  }

  const messageIndex = session.messages.findIndex(m => m.id === messageId);
  if (messageIndex === -1) {
    return null;
  }

  session.messages[messageIndex] = {
    ...session.messages[messageIndex],
    ...updates,
  };
  session.updatedAt = new Date().toISOString();

  await saveSessionToDB(session);
  return session;
}

/**
 * Get the most recent session
 */
export async function getMostRecentSession(): Promise<StoredSession | null> {
  const history = await getSessionHistoryFromDB(1);
  if (history.length === 0) {
    return null;
  }
  return loadSessionFromDB(history[0].id);
}

/**
 * Check if IndexedDB is available
 */
export function isIndexedDBAvailable(): boolean {
  try {
    // Check if indexedDB exists and is accessible
    if (typeof indexedDB === 'undefined') {
      return false;
    }
    // Try a simple operation to verify it's working
    indexedDB.open('test-db', 1);
    return true;
  } catch {
    return false;
  }
}