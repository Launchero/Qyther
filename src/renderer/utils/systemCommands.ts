import type { SearchResult } from '@/components/ResultsList';

/**
 * System commands available in the palette.
 * Each command maps to a shell command executed via `command:execute`.
 */
interface SystemCommandDef {
  id: string;
  title: string;
  subtitle: string;
  shellCommand: string;
  keywords: string[];
}

const SYSTEM_COMMANDS: SystemCommandDef[] = [
  {
    id: 'sys-lock',
    title: 'Lock Computer',
    subtitle: 'Lock the screen',
    shellCommand: 'rundll32.exe user32.dll,LockWorkStation',
    keywords: ['lock', 'screen', 'computer', ' workstation'],
  },
  {
    id: 'sys-sleep',
    title: 'Sleep',
    subtitle: 'Put computer to sleep',
    shellCommand: 'rundll32.exe powrprof.dll,SetSuspendState 0,1,0',
    keywords: ['sleep', 'suspend', 'hibernate'],
  },
  {
    id: 'sys-recycle-empty',
    title: 'Empty Recycle Bin',
    subtitle: 'Permanently delete all items in the Recycle Bin',
    shellCommand: 'PowerShell -Command "Clear-RecycleBin -Force -ErrorAction SilentlyContinue"',
    keywords: ['empty', 'recycle', 'bin', 'trash', 'delete', 'clear'],
  },
  {
    id: 'sys-recycle-open',
    title: 'Open Recycle Bin',
    subtitle: 'Open the Recycle Bin folder',
    shellCommand: 'explorer.exe shell:RecycleBinFolder',
    keywords: ['recycle', 'bin', 'trash', 'open'],
  },
  {
    id: 'sys-taskmgr',
    title: 'Task Manager',
    subtitle: 'Open Windows Task Manager',
    shellCommand: 'taskmgr.exe',
    keywords: ['task', 'manager', 'process', 'performance'],
  },
  {
    id: 'sys-control',
    title: 'Control Panel',
    subtitle: 'Open Windows Control Panel',
    shellCommand: 'control.exe',
    keywords: ['control', 'panel', 'settings', 'configuration'],
  },
  {
    id: 'sys-settings',
    title: 'Windows Settings',
    subtitle: 'Open Windows Settings app',
    shellCommand: 'start ms-settings:',
    keywords: ['settings', 'windows', 'preferences', 'configuration'],
  },
  {
    id: 'sys-downloads',
    title: 'Downloads Folder',
    subtitle: 'Open the Downloads folder',
    shellCommand: 'explorer.exe shell:Downloads',
    keywords: ['downloads', 'folder', 'open'],
  },
  {
    id: 'sys-documents',
    title: 'Documents Folder',
    subtitle: 'Open the Documents folder',
    shellCommand: 'explorer.exe shell:Personal',
    keywords: ['documents', 'folder', 'open'],
  },
  {
    id: 'sys-snipping',
    title: 'Snipping Tool',
    subtitle: 'Take a screenshot',
    shellCommand: 'snippingtool.exe /clip',
    keywords: ['snip', 'screenshot', 'screen', 'capture', 'clip'],
  },
];

/** Convert a system command definition into a SearchResult. */
function commandToResult(cmd: SystemCommandDef): SearchResult {
  return {
    id: cmd.id,
    title: cmd.title,
    subtitle: cmd.subtitle,
    type: 'command',
    icon: '⚙',
    action: cmd.shellCommand || `sys-info:${cmd.id}`,
    metadata: {
      section: 'System Commands',
      kind: 'System Command',
      shortcut: '↵',
    },
  };
}

/**
 * Filter system commands by query using simple keyword matching.
 * Returns matching commands as SearchResult objects.
 */
export function filterSystemCommands(query: string): SearchResult[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    // When no query, return a curated subset (most common commands)
    return SYSTEM_COMMANDS.slice(0, 6).map(commandToResult);
  }

  return SYSTEM_COMMANDS
    .filter((cmd) => {
      // Match against title, subtitle, and keywords
      if (cmd.title.toLowerCase().includes(trimmed)) return true;
      if (cmd.subtitle.toLowerCase().includes(trimmed)) return true;
      return cmd.keywords.some((kw) => kw.includes(trimmed) || trimmed.includes(kw));
    })
    .map(commandToResult);
}

/**
 * Get all system commands (for empty-state or full listing).
 */
export function getAllSystemCommands(): SearchResult[] {
  return SYSTEM_COMMANDS.map(commandToResult);
}

// ─── Calculator ──────────────────────────────────────────────────────────────

/**
 * Detect if a query looks like a math expression and evaluate it.
 * Returns a SearchResult with the answer, or null if the query is not a math expression.
 */
export function tryCalculator(query: string): SearchResult | null {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length > 100) return null;

  // Must contain at least one digit
  if (!/\d/.test(trimmed)) return null;

  // Must contain at least one operator or function
  const hasOperator = /[+\-*/^%()]/.test(trimmed) || /\b(sqrt|abs|round|floor|ceil|sin|cos|tan|log|ln|pi|e)\b/i.test(trimmed);
  if (!hasOperator) return null;

  // Must NOT look like a file path (contains backslash or starts with a drive letter)
  if (/\\/.test(trimmed)) return null;
  if (/^[a-zA-Z]:/.test(trimmed)) return null;

  // Must NOT look like a shell command (starts with >)
  if (trimmed.startsWith('>')) return null;

  try {
    const result = safeEvaluate(trimmed);
    if (result === null || result === undefined || Number.isNaN(result)) return null;
    if (!Number.isFinite(result)) return null;

    // Format the result
    const formatted = formatNumber(result);
    const expression = trimmed.replace(/=/g, '').trim();

    return {
      id: 'calc-result',
      title: `= ${formatted}`,
      subtitle: expression,
      type: 'command',
      icon: '🔢',
      action: 'clipboard-copy',
      metadata: {
        section: 'Calculator',
        kind: 'Result',
        shortcut: '↵ Copy',
      },
    };
  } catch {
    return null;
  }
}

/**
 * Safely evaluate a math expression.
 * Supports: +, -, *, /, **, %, (), and common math functions.
 */
function safeEvaluate(expr: string): number | null {
  // Normalize the expression
  let normalized = expr
    .replace(/=/g, '') // Remove trailing =
    .replace(/\s+/g, '') // Remove whitespace
    .replace(/\^/g, '**') // ^ → ** for exponentiation
    .replace(/×/g, '*') // × → *
    .replace(/÷/g, '/') // ÷ → /
    .replace(/π/gi, 'Math.PI') // π → Math.PI
    .replace(/\bpi\b/gi, 'Math.PI')
    .replace(/\be\b/gi, 'Math.E')
    .replace(/\bsqrt\(/gi, 'Math.sqrt(')
    .replace(/\babs\(/gi, 'Math.abs(')
    .replace(/\bround\(/gi, 'Math.round(')
    .replace(/\bfloor\(/gi, 'Math.floor(')
    .replace(/\bceil\(/gi, 'Math.ceil(')
    .replace(/\bsin\(/gi, 'Math.sin(')
    .replace(/\bcos\(/gi, 'Math.cos(')
    .replace(/\btan\(/gi, 'Math.tan(')
    .replace(/\blog\(/gi, 'Math.log10(') // log → log10
    .replace(/\bln\(/gi, 'Math.log('); // ln → natural log

  // Security: only allow digits, operators, parentheses, dots, and Math.* functions
  // Strip out everything that is allowed and see if anything dangerous remains
  const stripped = normalized.replace(/[0-9+\-*/().,%\s]|Math\.(sqrt|abs|round|floor|ceil|sin|cos|tan|log10|log|PI|E)/g, '');
  if (stripped.length > 0) {
    // Contains characters that are not part of safe math
    return null;
  }

  try {
    // Use Function constructor for evaluation — safer than eval() because it runs in
    // its own scope, but still not truly sandboxed. The regex check above is the real guard.
    const fn = new Function(`"use strict"; return (${normalized});`);
    const result = fn();
    return typeof result === 'number' ? result : null;
  } catch {
    return null;
  }
}

/** Format a number for display — avoid floating point ugliness. */
function formatNumber(n: number): string {
  if (Number.isInteger(n)) return n.toString();
  // Round to 10 significant digits to avoid floating point noise
  const rounded = parseFloat(n.toPrecision(10));
  return rounded.toString();
}

/**
 * Execute a system command by ID.
 * Returns the shell command string, or null for info-only commands.
 */
export function getSystemCommandShell(id: string): string | null {
  const cmd = SYSTEM_COMMANDS.find((c) => c.id === id);
  return cmd?.shellCommand || null;
}
