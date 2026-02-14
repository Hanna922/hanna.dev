type LogLevel = "info" | "warn" | "error";

function write(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>
) {
  const payload = {
    scope: "rag",
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(context ? { context } : {}),
  };

  console[level](JSON.stringify(payload));
}

export const ragLogger = {
  info: (message: string, context?: Record<string, unknown>) =>
    write("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) =>
    write("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) =>
    write("error", message, context),
};

export async function measure<T>(
  label: string,
  fn: () => Promise<T>
): Promise<T> {
  const startedAt = performance.now();
  try {
    const result = await fn();
    ragLogger.info(`${label} completed`, {
      durationMs: Math.round(performance.now() - startedAt),
    });
    return result;
  } catch (error) {
    ragLogger.error(`${label} failed`, {
      durationMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
