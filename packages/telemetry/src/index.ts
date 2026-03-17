export type TelemetryLevel = "debug" | "info" | "warn" | "error";

export type TelemetryEvent = {
  name: string;
  level?: TelemetryLevel;
  payload?: Record<string, unknown>;
};

export function trackEvent(event: TelemetryEvent) {
  const level = event.level ?? "info";
  const prefix = `[tweetquote:${level}]`;
  if (level === "error") {
    console.error(prefix, event.name, event.payload ?? {});
    return;
  }
  if (level === "warn") {
    console.warn(prefix, event.name, event.payload ?? {});
    return;
  }
  console.log(prefix, event.name, event.payload ?? {});
}

export function measureAsync<T>(name: string, task: () => Promise<T>) {
  const start = performance.now();
  return task().finally(() => {
    trackEvent({
      name,
      level: "debug",
      payload: { durationMs: Math.round(performance.now() - start) },
    });
  });
}
