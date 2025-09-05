import { ToolExecutionMetric, ConversationMetric, AppEvents } from "./types";

export const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
} as const;

export type LogLevel = typeof LOG_LEVELS[keyof typeof LOG_LEVELS];

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
  context?: Record<string, any>;
  error?: Error;
}

export interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: number;
  tags?: Record<string, string>;
}

export class Logger {
  private static instance: Logger;
  private logs: LogEntry[] = [];
  private maxLogs = 1000; // Keep last 1000 logs in memory

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private addLog(level: LogLevel, message: string, context?: Record<string, any>, error?: Error): void {
    const logEntry: LogEntry = {
      level,
      message,
      timestamp: Date.now(),
      context,
      error,
    };

    this.logs.push(logEntry);

    // Keep only recent logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Also log to console for development
    const consoleMethod = console[level] || console.log;
    const formattedMessage = `[${new Date().toISOString()}] ${level.toUpperCase()}: ${message}`;
    
    if (error) {
      consoleMethod(formattedMessage, context, error);
    } else if (context) {
      consoleMethod(formattedMessage, context);
    } else {
      consoleMethod(formattedMessage);
    }
  }

  error(message: string, context?: Record<string, any>, error?: Error): void {
    this.addLog('error', message, context, error);
  }

  warn(message: string, context?: Record<string, any>): void {
    this.addLog('warn', message, context);
  }

  info(message: string, context?: Record<string, any>): void {
    this.addLog('info', message, context);
  }

  debug(message: string, context?: Record<string, any>): void {
    this.addLog('debug', message, context);
  }

  getLogs(level?: LogLevel): LogEntry[] {
    if (!level) return this.logs;
    return this.logs.filter(log => log.level === level);
  }

  clearLogs(): void {
    this.logs = [];
  }

  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }
}

export class MetricsCollector {
  private static instance: MetricsCollector;
  private toolMetrics: ToolExecutionMetric[] = [];
  private conversationMetrics: ConversationMetric[] = [];
  private performanceMetrics: PerformanceMetric[] = [];
  private maxMetrics = 500; // Keep last 500 metrics

  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  trackToolExecution(metric: ToolExecutionMetric): void {
    this.toolMetrics.push(metric);
    this.pruneMetrics();
    
    Logger.getInstance().info('Tool executed', {
      toolName: metric.toolName,
      duration: metric.duration,
      serverId: metric.serverId,
      success: metric.success,
    });
  }

  trackConversation(metric: ConversationMetric): void {
    this.conversationMetrics.push(metric);
    this.pruneMetrics();
    
    Logger.getInstance().info('Conversation completed', {
      conversationId: metric.conversationId,
      messageCount: metric.messageCount,
      tokenUsage: metric.tokenUsage,
      duration: metric.duration,
      providerId: metric.providerId,
    });
  }

  trackPerformance(metric: PerformanceMetric): void {
    this.performanceMetrics.push(metric);
    this.pruneMetrics();
    
    Logger.getInstance().debug('Performance metric', {
      name: metric.name,
      duration: metric.duration,
      tags: metric.tags,
    });
  }

  private pruneMetrics(): void {
    if (this.toolMetrics.length > this.maxMetrics) {
      this.toolMetrics = this.toolMetrics.slice(-this.maxMetrics);
    }
    
    if (this.conversationMetrics.length > this.maxMetrics) {
      this.conversationMetrics = this.conversationMetrics.slice(-this.maxMetrics);
    }
    
    if (this.performanceMetrics.length > this.maxMetrics) {
      this.performanceMetrics = this.performanceMetrics.slice(-this.maxMetrics);
    }
  }

  getMetricsSummary() {
    return {
      toolExecutions: this.toolMetrics.length,
      conversations: this.conversationMetrics.length,
      performanceMetrics: this.performanceMetrics.length,
      averageToolExecutionTime: this.getAverageToolExecutionTime(),
      successRate: this.getToolSuccessRate(),
      mostUsedTool: this.getMostUsedTool(),
    };
  }

  private getAverageToolExecutionTime(): number {
    if (this.toolMetrics.length === 0) return 0;
    const total = this.toolMetrics.reduce((sum, metric) => sum + metric.duration, 0);
    return total / this.toolMetrics.length;
  }

  private getToolSuccessRate(): number {
    if (this.toolMetrics.length === 0) return 0;
    const successCount = this.toolMetrics.filter(metric => metric.success).length;
    return (successCount / this.toolMetrics.length) * 100;
  }

  private getMostUsedTool(): string | null {
    if (this.toolMetrics.length === 0) return null;
    
    const toolCounts = this.toolMetrics.reduce((counts, metric) => {
      counts[metric.toolName] = (counts[metric.toolName] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);

    return Object.entries(toolCounts)
      .sort(([, a], [, b]) => b - a)[0]?.[0] || null;
  }

  exportMetrics() {
    return {
      toolMetrics: this.toolMetrics,
      conversationMetrics: this.conversationMetrics,
      performanceMetrics: this.performanceMetrics,
      summary: this.getMetricsSummary(),
    };
  }
}

// Performance timing utilities
export class PerformanceTimer {
  private startTime: number;
  private name: string;
  private tags?: Record<string, string>;

  constructor(name: string, tags?: Record<string, string>) {
    this.name = name;
    this.tags = tags;
    this.startTime = performance.now();
  }

  end(): number {
    const duration = performance.now() - this.startTime;
    
    MetricsCollector.getInstance().trackPerformance({
      name: this.name,
      duration,
      timestamp: Date.now(),
      tags: this.tags,
    });

    return duration;
  }
}

// Helper function to time async operations
export async function timeAsync<T>(
  name: string,
  operation: () => Promise<T>,
  tags?: Record<string, string>
): Promise<T> {
  const timer = new PerformanceTimer(name, tags);
  try {
    const result = await operation();
    timer.end();
    return result;
  } catch (error) {
    timer.end();
    throw error;
  }
}

// Event emitter for application events
class EventBus {
  private static instance: EventBus;
  private listeners: Map<keyof AppEvents, Array<(data: any) => void>> = new Map();

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  emit<K extends keyof AppEvents>(event: K, data: AppEvents[K]): void {
    const eventListeners = this.listeners.get(event) || [];
    eventListeners.forEach(listener => {
      try {
        listener(data);
      } catch (error) {
        Logger.getInstance().error(`Error in event listener for ${event}`, { event }, error as Error);
      }
    });

    // Log important events
    Logger.getInstance().info(`Event emitted: ${event}`, data as any);
  }

  on<K extends keyof AppEvents>(event: K, listener: (data: AppEvents[K]) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
  }

  off<K extends keyof AppEvents>(event: K, listener: (data: AppEvents[K]) => void): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      const index = eventListeners.indexOf(listener);
      if (index > -1) {
        eventListeners.splice(index, 1);
      }
    }
  }
}

// Global instances
export const logger = Logger.getInstance();
export const metricsCollector = MetricsCollector.getInstance();
export const eventBus = EventBus.getInstance();