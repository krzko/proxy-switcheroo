class Logger {
    constructor() {
        this.config = {
            level: 'warn',
            maxEntries: 50,
            enableConsole: true,
            enableStorage: false,
            maxAge: 1 * 60 * 60 * 1000,
            maxSizeBytes: 100 * 1024
        };
        this.logEntries = [];
        this.LOG_STORAGE_KEY = 'logs';
        this.saveTimer = null;
        this.BATCH_SAVE_DELAY = 2000;
        this.pendingSave = false;
        this.logLevels = {
            debug: 0,
            info: 1,
            warn: 2,
            error: 3
        };
    }
    configure(config) {
        this.config = { ...this.config, ...config };
    }
    debug(component, message, data) {
        this.log('debug', component, message, data);
    }
    info(component, message, data) {
        this.log('info', component, message, data);
    }
    warn(component, message, data) {
        this.log('warn', component, message, data);
    }
    error(component, message, data) {
        this.log('error', component, message, data);
    }
    async getLogs(level, component, limit = 100) {
        if (this.pendingSave) {
            await this.saveLogsToStorage();
        }
        if (this.logEntries.length === 0) {
            await this.loadLogsFromStorage();
        }
        this.cleanExpiredLogs();
        let filteredLogs = this.logEntries;
        if (level) {
            const minLevel = this.logLevels[level];
            filteredLogs = filteredLogs.filter(entry => this.logLevels[entry.level] >= minLevel);
        }
        if (component) {
            filteredLogs = filteredLogs.filter(entry => entry.component === component);
        }
        return filteredLogs
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit);
    }
    async clearLogs() {
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
    async exportLogs() {
        const logs = await this.getLogs();
        return JSON.stringify(logs, null, 2);
    }
    log(level, component, message, data) {
        const shouldLog = this.logLevels[level] >= this.logLevels[this.config.level];
        if (!shouldLog) {
            return;
        }
        const entry = {
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
    logToConsole(entry) {
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
    addToStorage(entry) {
        this.logEntries.push(entry);
        this.cleanExpiredLogs();
        this.enforceStorageSize();
        this.scheduleBatchedSave();
    }
    cleanExpiredLogs() {
        const cutoffTime = Date.now() - this.config.maxAge;
        const originalLength = this.logEntries.length;
        this.logEntries = this.logEntries.filter(entry => entry.timestamp > cutoffTime);
        if (this.logEntries.length !== originalLength) {
            this.pendingSave = true;
        }
    }
    enforceStorageSize() {
        const estimatedSize = this.logEntries.length * 200;
        if (estimatedSize > this.config.maxSizeBytes || this.logEntries.length > this.config.maxEntries) {
            const targetSize = Math.min(this.config.maxEntries, Math.floor(this.config.maxSizeBytes / 200));
            this.logEntries = this.logEntries.slice(-targetSize);
            this.pendingSave = true;
        }
    }
    scheduleBatchedSave() {
        if (!this.config.enableStorage) {
            return;
        }
        this.pendingSave = true;
        if (this.saveTimer) {
            return;
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
    async saveLogsToStorage() {
        try {
            await browser.storage.local.set({
                [this.LOG_STORAGE_KEY]: this.logEntries
            });
        }
        catch (error) {
            console.error('Error saving logs to storage:', error);
        }
    }
    async loadLogsFromStorage() {
        try {
            const result = await browser.storage.local.get(this.LOG_STORAGE_KEY);
            if (result[this.LOG_STORAGE_KEY]) {
                this.logEntries = result[this.LOG_STORAGE_KEY];
            }
        }
        catch (error) {
            console.error('Error loading logs from storage:', error);
        }
    }
    async initialise() {
        if (this.config.enableStorage) {
            await this.loadLogsFromStorage();
            this.cleanExpiredLogs();
        }
        this.info('Logger', 'Logger initialised', {
            config: this.config,
            existingLogs: this.logEntries.length
        });
    }
    async flush() {
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }
        if (this.pendingSave && this.config.enableStorage) {
            await this.saveLogsToStorage();
            this.pendingSave = false;
        }
    }
    createComponentLogger(component) {
        return {
            debug: (message, data) => this.debug(component, message, data),
            info: (message, data) => this.info(component, message, data),
            warn: (message, data) => this.warn(component, message, data),
            error: (message, data) => this.error(component, message, data)
        };
    }
}
export const logger = new Logger();
export function createLogger(component) {
    return logger.createComponentLogger(component);
}
//# sourceMappingURL=log.js.map