import { createDefaultQuota, nowIso, quoteDocumentSchema, type QuoteDocument, type QuotaSnapshot } from "@tweetquote/domain";
import { apiEnv } from "./env";
import { prisma } from "./prisma";

type TrialSessionRecord = {
  device_id: string;
  usage_events: number[];
  created_at: number;
  last_seen_at?: number;
};

const DAY_SECONDS = 24 * 60 * 60;
const WEEK_SECONDS = 7 * DAY_SECONDS;

export class TrialSessionStore {
  private async normalizeUsageEvents(deviceId: string, now = Math.floor(Date.now() / 1000)) {
    const minDate = new Date((now - WEEK_SECONDS) * 1000);
    await prisma.usageEvent.deleteMany({
      where: {
        deviceId,
        createdAt: {
          lt: minDate,
        },
      },
    });
    const events = await prisma.usageEvent.findMany({
      where: { deviceId },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    return events.map((item) => Math.floor(item.createdAt.getTime() / 1000));
  }

  async getOrCreate(deviceId?: string): Promise<TrialSessionRecord> {
    const now = Math.floor(Date.now() / 1000);
    const id = (deviceId || "").trim() || `tq_${crypto.randomUUID().replace(/-/g, "")}`;
    const session = await prisma.anonymousSession.upsert({
      where: { deviceId: id },
      create: {
        deviceId: id,
        createdAt: new Date(now * 1000),
        lastSeenAt: new Date(now * 1000),
      },
      update: {
        lastSeenAt: new Date(now * 1000),
      },
      select: {
        deviceId: true,
        createdAt: true,
        lastSeenAt: true,
      },
    });
    const usageEvents = await this.normalizeUsageEvents(id, now);
    return {
      device_id: session.deviceId,
      usage_events: usageEvents,
      created_at: Math.floor(session.createdAt.getTime() / 1000),
      last_seen_at: Math.floor(session.lastSeenAt.getTime() / 1000),
    };
  }

  async increment(deviceId: string): Promise<TrialSessionRecord> {
    const now = Math.floor(Date.now() / 1000);
    await this.getOrCreate(deviceId);
    await prisma.usageEvent.create({
      data: {
        deviceId,
        createdAt: new Date(now * 1000),
      },
    });
    return this.getOrCreate(deviceId);
  }

  async getQuotaSnapshot(deviceId: string): Promise<QuotaSnapshot> {
    await this.getOrCreate(deviceId);
    const now = Math.floor(Date.now() / 1000);
    const dailyCutoff = new Date((now - DAY_SECONDS) * 1000);
    const weeklyCutoff = new Date((now - WEEK_SECONDS) * 1000);
    const [dailyEvents, weeklyEvents] = await Promise.all([
      prisma.usageEvent.findMany({
        where: { deviceId, createdAt: { gte: dailyCutoff } },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
      prisma.usageEvent.findMany({
        where: { deviceId, createdAt: { gte: weeklyCutoff } },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
    ]);
    const dailyUsed = dailyEvents.length;
    const weeklyUsed = weeklyEvents.length;
    const dailyExhausted = dailyUsed >= apiEnv.dailyTrialLimit;
    const weeklyExhausted = weeklyUsed >= apiEnv.weeklyTrialLimit;
    const exhaustedReason = dailyExhausted ? "daily" as const : weeklyExhausted ? "weekly" as const : "" as const;
    const firstDailyTs = dailyEvents[0] ? Math.floor(dailyEvents[0].createdAt.getTime() / 1000) : 0;
    const firstWeeklyTs = weeklyEvents[0] ? Math.floor(weeklyEvents[0].createdAt.getTime() / 1000) : 0;
    return createDefaultQuota({
      dailyRemaining: Math.max(0, apiEnv.dailyTrialLimit - dailyUsed),
      weeklyRemaining: Math.max(0, apiEnv.weeklyTrialLimit - weeklyUsed),
      dailyTotal: apiEnv.dailyTrialLimit,
      weeklyTotal: apiEnv.weeklyTrialLimit,
      requiresUpgrade: dailyExhausted || weeklyExhausted,
      exhaustedReason,
      nextDailyResetAt: firstDailyTs ? firstDailyTs + DAY_SECONDS : 0,
      nextWeeklyResetAt: firstWeeklyTs ? firstWeeklyTs + WEEK_SECONDS : 0,
      hostedAiAvailable: Boolean(apiEnv.aiApiKey),
      hostedTwitterAvailable: Boolean(apiEnv.twitterApiKey),
    });
  }
}

export class DocumentStore {
  async save(document: QuoteDocument) {
    const normalized = quoteDocumentSchema.parse({ ...document, updatedAt: nowIso() });
    await prisma.document.upsert({
      where: { id: normalized.id },
      create: {
        id: normalized.id,
        title: normalized.title,
        status: normalized.status,
        payload: JSON.stringify(normalized),
      },
      update: {
        title: normalized.title,
        status: normalized.status,
        payload: JSON.stringify(normalized),
      },
    });
    return normalized;
  }

  async get(id: string) {
    const document = await prisma.document.findUnique({
      where: { id },
      select: { payload: true },
    });
    if (!document) {
      return null;
    }
    return quoteDocumentSchema.parse(JSON.parse(document.payload));
  }
}

type ExportJob = {
  id: string;
  status: "queued" | "running" | "finished";
  downloadUrl?: string;
  createdAt: string;
};

export class ExportJobStore {
  private readonly jobs = new Map<string, ExportJob>();

  create() {
    const job: ExportJob = {
      id: crypto.randomUUID(),
      status: "finished",
      downloadUrl: "https://tweetquote.app/export/demo.png",
      createdAt: nowIso(),
    };
    this.jobs.set(job.id, job);
    return job;
  }
}
