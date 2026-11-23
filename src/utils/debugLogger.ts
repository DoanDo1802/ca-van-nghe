import type { ConsoleLogLevel, ConsoleLogPayload } from '../types';

type LogListener = (entry: ConsoleLogPayload) => void;

const MAX_BUFFER = 500;
const buffer: ConsoleLogPayload[] = [];
const listeners = new Set<LogListener>();

let seq = 0;
let hooksInstalled = false;
let isCapturingConsole = false;

const nativeConsole = {
  log: typeof console !== 'undefined' ? console.log.bind(console) : () => {},
  warn: typeof console !== 'undefined' ? console.warn.bind(console) : () => {},
  error: typeof console !== 'undefined' ? console.error.bind(console) : () => {},
};

function nextId(): string {
  seq += 1;
  return `dbg_${Date.now().toString(36)}_${seq}`;
}

function formatValue(arg: unknown): string {
  if (arg instanceof Error) {
    return `${arg.name}: ${arg.message}`;
  }
  if (typeof arg === 'string') return arg;
  if (
    arg === null ||
    arg === undefined ||
    typeof arg === 'number' ||
    typeof arg === 'boolean' ||
    typeof arg === 'bigint' ||
    typeof arg === 'symbol'
  ) {
    return String(arg);
  }
  if (typeof arg === 'function') {
    return `[Function ${arg.name || 'anonymous'}]`;
  }
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function extractStack(args: unknown[]): string | undefined {
  for (const arg of args) {
    if (arg instanceof Error && arg.stack) {
      return arg.stack;
    }
  }
  return undefined;
}

function pushEntry(
  level: ConsoleLogLevel,
  source: string,
  message: string,
  stack?: string,
  mirrorToBrowser = true
): void {
  const entry: ConsoleLogPayload = {
    id: nextId(),
    level,
    source,
    message,
    ...(stack ? { stack } : {}),
    timestamp: Date.now(),
  };

  buffer.push(entry);
  if (buffer.length > MAX_BUFFER) {
    buffer.splice(0, buffer.length - MAX_BUFFER);
  }

  if (mirrorToBrowser) {
    const prefix = `[${source}]`;
    if (level === 'error') {
      nativeConsole.error(prefix, message, ...(stack ? ['\n', stack] : []));
    } else if (level === 'warn') {
      nativeConsole.warn(prefix, message);
    } else {
      nativeConsole.log(prefix, message);
    }
  }

  for (const listener of listeners) {
    try {
      listener(entry);
    } catch {
      // avoid listener failures breaking logging
    }
  }
}

export const DebugLogger = {
  log(source: string, ...args: unknown[]): void {
    const message = args.map(formatValue).join(' ');
    pushEntry('log', source, message, extractStack(args), true);
  },

  warn(source: string, ...args: unknown[]): void {
    const message = args.map(formatValue).join(' ');
    pushEntry('warn', source, message, extractStack(args), true);
  },

  error(source: string, ...args: unknown[]): void {
    const message = args.map(formatValue).join(' ');
    const stack = extractStack(args) ?? new Error(message).stack;
    pushEntry('error', source, message, stack, true);
  },

  subscribe(listener: LogListener, replayBuffered = true): () => void {
    listeners.add(listener);
    if (replayBuffered) {
      for (const entry of buffer) {
        listener(entry);
      }
    }
    return () => {
      listeners.delete(listener);
    };
  },

  getBufferedEntries(): readonly ConsoleLogPayload[] {
    return buffer;
  },

  clearBuffer(): void {
    buffer.length = 0;
  },

  /**
   * Captures uncaught runtime errors, unhandled promise rejections,
   * and browser `console.warn` / `console.error` calls into the Editor Debug Console.
   */
  installGlobalHooks(): () => void {
    if (hooksInstalled || typeof window === 'undefined') {
      return () => {};
    }
    hooksInstalled = true;

    const origWarn = console.warn.bind(console);
    const origError = console.error.bind(console);

    console.warn = (...args: unknown[]) => {
      origWarn(...args);
      if (isCapturingConsole) return;
      isCapturingConsole = true;
      try {
        const message = args.map(formatValue).join(' ');
        pushEntry('warn', 'Browser', message, extractStack(args), false);
      } finally {
        isCapturingConsole = false;
      }
    };

    console.error = (...args: unknown[]) => {
      origError(...args);
      if (isCapturingConsole) return;
      isCapturingConsole = true;
      try {
        const message = args.map(formatValue).join(' ');
        const stack = extractStack(args) ?? new Error(message).stack;
        pushEntry('error', 'Browser', message, stack, false);
      } finally {
        isCapturingConsole = false;
      }
    };

    const onWindowError = (ev: ErrorEvent) => {
      const location = ev.filename ? ` (${ev.filename}:${ev.lineno}:${ev.colno})` : '';
      const msg = `${ev.message || 'Uncaught Error'}${location}`;
      const stack = ev.error instanceof Error ? ev.error.stack : undefined;
      pushEntry('error', 'Uncaught', msg, stack, false);
    };

    const onUnhandledRejection = (ev: PromiseRejectionEvent) => {
      const reason = ev.reason;
      const msg = reason instanceof Error ? reason.message : formatValue(reason);
      const stack = reason instanceof Error ? reason.stack : undefined;
      pushEntry('error', 'Promise', `Unhandled rejection: ${msg}`, stack, false);
    };

    window.addEventListener('error', onWindowError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    return () => {
      hooksInstalled = false;
      console.warn = origWarn;
      console.error = origError;
      window.removeEventListener('error', onWindowError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  },
};
