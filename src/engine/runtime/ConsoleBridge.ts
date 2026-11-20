import type { ConsoleLogLevel, EditorEventMap, TypedEventBus } from '../../types';

export interface ScopedConsole {
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

function generateLogId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatArg(arg: unknown): string {
  if (arg instanceof Error) {
    return arg.stack || `${arg.name}: ${arg.message}`;
  }
  if (typeof arg === 'string') {
    return arg;
  }
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

export function formatConsoleArgs(args: unknown[]): string {
  if (args.length === 0) return '';
  return args.map(formatArg).join(' ');
}

export class ConsoleBridge {
  private readonly eventBus: TypedEventBus<EditorEventMap>;

  constructor(eventBus: TypedEventBus<EditorEventMap>) {
    this.eventBus = eventBus;
  }

  emit(level: ConsoleLogLevel, source: string | undefined, ...args: unknown[]): void {
    const message = formatConsoleArgs(args);
    this.eventBus.emit('console:message', {
      id: generateLogId(),
      level,
      message,
      source,
      timestamp: Date.now(),
    });
  }

  log(...args: unknown[]): void {
    this.emit('log', 'Runtime', ...args);
  }

  warn(...args: unknown[]): void {
    this.emit('warn', 'Runtime', ...args);
  }

  error(...args: unknown[]): void {
    this.emit('error', 'Runtime', ...args);
  }

  logFrom(source: string, ...args: unknown[]): void {
    this.emit('log', source, ...args);
  }

  warnFrom(source: string, ...args: unknown[]): void {
    this.emit('warn', source, ...args);
  }

  errorFrom(source: string, ...args: unknown[]): void {
    this.emit('error', source, ...args);
  }

  createScopedConsole(source: string): ScopedConsole {
    return {
      log: (...args: unknown[]) => this.emit('log', source, ...args),
      warn: (...args: unknown[]) => this.emit('warn', source, ...args),
      error: (...args: unknown[]) => this.emit('error', source, ...args),
    };
  }
}
