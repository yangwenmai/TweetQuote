const isDev = process.env.NODE_ENV !== "production";

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const MIN_LEVEL: LogLevel = isDev ? "debug" : "info";

function shouldLog(level: LogLevel) {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[MIN_LEVEL];
}

function ts() {
  return new Date().toISOString();
}

function fmt(level: LogLevel, tag: string, msg: string, extra?: Record<string, unknown>) {
  const base = `[${ts()}] [${level.toUpperCase()}] [${tag}] ${msg}`;
  if (extra && Object.keys(extra).length > 0) {
    return `${base} ${JSON.stringify(extra)}`;
  }
  return base;
}

export const logger = {
  debug(tag: string, msg: string, extra?: Record<string, unknown>) {
    if (shouldLog("debug")) console.debug(fmt("debug", tag, msg, extra));
  },
  info(tag: string, msg: string, extra?: Record<string, unknown>) {
    if (shouldLog("info")) console.log(fmt("info", tag, msg, extra));
  },
  warn(tag: string, msg: string, extra?: Record<string, unknown>) {
    if (shouldLog("warn")) console.warn(fmt("warn", tag, msg, extra));
  },
  error(tag: string, msg: string, extra?: Record<string, unknown>) {
    if (shouldLog("error")) console.error(fmt("error", tag, msg, extra));
  },
  isDev,
};
