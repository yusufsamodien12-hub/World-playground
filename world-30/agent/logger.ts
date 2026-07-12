/**
 * Agent Logger - Centralized logging for the Architect-OS agent.
 * Framework-agnostic, with optional callback for external log consumers.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  data?: any;
}

export type LogCallback = (entry: LogEntry) => void;

export class AgentLogger {
  private logs: LogEntry[] = [];
  private maxLogs: number;
  private isDev: boolean;
  private callback?: LogCallback;

  constructor(options?: { maxLogs?: number; isDev?: boolean; callback?: LogCallback }) {
    this.maxLogs = options?.maxLogs ?? 100;
    this.isDev = options?.isDev ?? true;
    this.callback = options?.callback;
  }

  setCallback(callback: LogCallback): void {
    this.callback = callback;
  }

  private write(level: LogLevel, category: string, message: string, data?: any): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      data
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Console output
    const prefix = `[${category}]`;
    const logData = data ? [prefix, message, data] : [prefix, message];

    if (level === 'debug' && !this.isDev) return;
    switch (level) {
      case 'debug': console.log(...logData); break;
      case 'info': console.info(...logData); break;
      case 'warn': console.warn(...logData); break;
      case 'error': console.error(...logData); break;
    }

    // Notify callback
    this.callback?.(entry);
  }

  debug(category: string, message: string, data?: any): void {
    this.write('debug', category, message, data);
  }

  info(category: string, message: string, data?: any): void {
    this.write('info', category, message, data);
  }

  warn(category: string, message: string, data?: any): void {
    this.write('warn', category, message, data);
  }

  error(category: string, message: string, data?: any): void {
    this.write('error', category, message, data);
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  clear(): void {
    this.logs = [];
  }
}