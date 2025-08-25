import type { LogEntry } from '../types/models.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LoggerConfig {
  level: LogLevel;
  maxEntries: number;
  enableConsole: boolean;
  enableStorage: boolean;
  maxAge: number; // TTL in milliseconds (default: 24 hours)
  maxSizeBytes: number; // Maximum storage size for logs
}

class Logger {
  private config: LoggerConfig = {
    level: 'warn', // Only log warnings and errors to drastically reduce log volume
    maxEntries: 50, // Drastically reduced to prevent memory issues
    enableConsole: true,
    enableStorage: false, // DISABLE storage logging entirely for now
    maxAge: 1 * 60 * 60 * 1000, // 1 hour TTL instead of 24 hours
    maxSizeBytes: 100 * 1024 // 100KB max storage instead of 1MB
  };

  private logEntries: LogEntry[] = [];
  private readonly LOG_STORAGE_KEY = 'logs';
  private saveTimer: NodeJS.Timeout | null = null;
  private readonly BATCH_SAVE_DELAY = 2000; // Save logs every 2 seconds instead of immediately
  private pendingSave = false;
  
  private readonly logLevels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  };

  public configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  public debug(component: string, message: string, data?: unknown): void {
    this.log('debug', component, message, data);
  }

  public info(component: string, message: string, data?: unknown): void {
    this.log('info', component, message, data);
  }

  public warn(component: string, message: string, data?: unknown): void {
    this.log('warn', component, message, data);
  }

  public error(component: string, message: string, data?: unknown): void {
    this.log('error', component, message, data);
  }

  public async getLogs(level?: LogLevel, component?: string, limit: number = 100): Promise<LogEntry[]> {
    // Force save any pending logs before reading
    if (this.pendingSave) {
      await this.saveLogsToStorage();
    }
    
    // Only load from storage if we don't have entries in memory
    if (this.logEntries.length === 0) {
      await this.loadLogsFromStorage();
    }
    
    // Clean expired logs first
    this.cleanExpiredLogs();
    
    let filteredLogs = this.logEntries;
    
    if (level) {
      const minLevel = this.logLevels[level];
      filteredLogs = filteredLogs.filter(entry => 
        this.logLevels[entry.level] >= minLevel
      );
    }
    
    if (component) {
      filteredLogs = filteredLogs.filter(entry => 
        entry.component === component
      );
    }
    
    // Sort by timestamp (newest first) and limit results for performance
    return filteredLogs
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  public async clearLogs(): Promise<void> {
    this.logEntries = [];
    this.pendingSave = false;
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.config.enableStorage) {
      await browser.storage.local.remove(this.LOG_STORAGE_KEY);
    }
  }

  public async exportLogs(): Promise<string> {
    const logs = await this.getLogs();
    return JSON.stringify(logs, null, 2);
  }

  private log(level: LogLevel, component: string, message: string, data?: unknown): void {
    const shouldLog = this.logLevels[level] >= this.logLevels[this.config.level];
    
    if (!shouldLog) {
      return;
    }

    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      component,
      message,
      data
    };

    if (this.config.enableConsole) {
      this.logToConsole(entry);
    }

    if (this.config.enableStorage) {
      this.addToStorage(entry);
    }
  }

  private logToConsole(entry: LogEntry): void {
    const timestamp = new Date(entry.timestamp).toISOString();
    const prefix = `[${timestamp}] [${entry.level.toUpperCase()}] [${entry.component}]`;
    const message = `${prefix} ${entry.message}`;

    const args = entry.data !== undefined ? [message, entry.data] : [message];

    switch (entry.level) {
      case 'debug':
        console.debug(...args);
        break;
      case 'info':
        console.info(...args);
        break;
      case 'warn':
        console.warn(...args);
        break;
      case 'error':
        console.error(...args);
        break;
    }
  }

  private addToStorage(entry: LogEntry): void {
    this.logEntries.push(entry);
    
    // Clean expired and oversized logs
    this.cleanExpiredLogs();
    this.enforceStorageSize();
    
    // Schedule a batched save instead of saving immediately
    this.scheduleBatchedSave();
  }

  private cleanExpiredLogs(): void {
    const cutoffTime = Date.now() - this.config.maxAge;
    const originalLength = this.logEntries.length;
    
    this.logEntries = this.logEntries.filter(entry => entry.timestamp > cutoffTime);
    
    if (this.logEntries.length !== originalLength) {
      this.pendingSave = true;
    }
  }

  private enforceStorageSize(): void {
    // Rough estimate of storage size (JSON.stringify would be too expensive)
    const estimatedSize = this.logEntries.length * 200; // ~200 bytes per log entry estimate
    
    if (estimatedSize > this.config.maxSizeBytes || this.logEntries.length > this.config.maxEntries) {
      // Remove oldest logs first
      const targetSize = Math.min(this.config.maxEntries, Math.floor(this.config.maxSizeBytes / 200));
      this.logEntries = this.logEntries.slice(-targetSize);
      this.pendingSave = true;
    }
  }

  private scheduleBatchedSave(): void {
    if (!this.config.enableStorage) {
      return;
    }

    this.pendingSave = true;
    
    if (this.saveTimer) {
      return; // Save already scheduled
    }

    this.saveTimer = setTimeout(() => {
      this.saveLogsToStorage().catch(error => {
        console.error('Failed to save logs to storage:', error);
      }).finally(() => {
        this.saveTimer = null;
        this.pendingSave = false;
      });
    }, this.BATCH_SAVE_DELAY);
  }

  private async saveLogsToStorage(): Promise<void> {
    try {
      await browser.storage.local.set({
        [this.LOG_STORAGE_KEY]: this.logEntries
      });
    } catch (error) {
      console.error('Error saving logs to storage:', error);
    }
  }

  private async loadLogsFromStorage(): Promise<void> {
    try {
      const result = await browser.storage.local.get(this.LOG_STORAGE_KEY);
      if (result[this.LOG_STORAGE_KEY]) {
        this.logEntries = result[this.LOG_STORAGE_KEY];
      }
    } catch (error) {
      console.error('Error loading logs from storage:', error);
    }
  }

  public async initialise(): Promise<void> {
    // Only load logs from storage if storage logging is enabled
    if (this.config.enableStorage) {
      await this.loadLogsFromStorage();
      // Clean expired logs on startup
      this.cleanExpiredLogs();
    }
    
    // DISABLED: Don't set up periodic cleanup to prevent memory issues
    // The logs will be cleaned when accessed instead
    
    this.info('Logger', 'Logger initialised', { 
      config: this.config,
      existingLogs: this.logEntries.length 
    });
  }

  public async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.pendingSave && this.config.enableStorage) {
      await this.saveLogsToStorage();
      this.pendingSave = false;
    }
  }

  public createComponentLogger(component: string) {
    return {
      debug: (message: string, data?: unknown) => this.debug(component, message, data),
      info: (message: string, data?: unknown) => this.info(component, message, data),
      warn: (message: string, data?: unknown) => this.warn(component, message, data),
      error: (message: string, data?: unknown) => this.error(component, message, data)
    };
  }
}

export const logger = new Logger();

export function createLogger(component: string) {
  return logger.createComponentLogger(component);
}