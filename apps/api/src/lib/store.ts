import {
  createDefaultQuota,
  nowIso,
  quoteDocumentSchema,
  randomUUID,
  type QuoteDocument,
  type QuotaSnapshot,
} from "@tweetquote/domain";
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
    return events.map((item: { createdAt: Date }) => Math.floor(item.createdAt.getTime() / 1000));
  }

  async getOrCreate(deviceId?: string): Promise<TrialSessionRecord> {
    const now = Math.floor(Date.now() / 1000);
    const id = (deviceId || "").trim() || `tq_${randomUUID().replace(/-/g, "")}`;
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
    if (apiEnv.disableHostedQuota) {
      const d = apiEnv.dailyTrialLimit;
      const w = apiEnv.weeklyTrialLimit;
      return createDefaultQuota({
        dailyRemaining: d,
        weeklyRemaining: w,
        dailyTotal: d,
        weeklyTotal: w,
        requiresUpgrade: false,
        exhaustedReason: "",
        nextDailyResetAt: 0,
        nextWeeklyResetAt: 0,
        hostedAiAvailable: Boolean(apiEnv.aiApiKey),
        hostedTwitterAvailable: Boolean(apiEnv.twitterApiKey),
      });
    }
    await this.getOrCreate(deviceId);
    const now = Math.floor(Date.now() / 1000);
    const dailyCutoff = new Date((now - DAY_SECONDS) * 1000);
    const weeklyCutoff = new Date((now - WEEK_SECONDS) * 1000);
    const [session, dailyEvents, weeklyEvents] = await Promise.all([
      prisma.anonymousSession.findUnique({
        where: { deviceId },
        select: { dailyLimit: true, weeklyLimit: true, bonusCredits: true },
      }),
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

    const effectiveDailyLimit = session?.dailyLimit ?? apiEnv.dailyTrialLimit;
    const effectiveWeeklyLimit = session?.weeklyLimit ?? apiEnv.weeklyTrialLimit;
    const bonusCredits = session?.bonusCredits ?? 0;

    const dailyUsed = dailyEvents.length;
    const weeklyUsed = weeklyEvents.length;
    const dailyExhausted = dailyUsed >= effectiveDailyLimit;
    const weeklyExhausted = weeklyUsed >= effectiveWeeklyLimit;

    const windowExhausted = dailyExhausted || weeklyExhausted;
    const bonusOverDaily = dailyExhausted ? Math.max(0, dailyUsed - effectiveDailyLimit) : 0;
    const bonusOverWeekly = weeklyExhausted ? Math.max(0, weeklyUsed - effectiveWeeklyLimit) : 0;
    const bonusUsed = Math.max(bonusOverDaily, bonusOverWeekly);
    const bonusRemaining = Math.max(0, bonusCredits - bonusUsed);
    const requiresUpgrade = windowExhausted && bonusRemaining <= 0;

    const exhaustedReason = requiresUpgrade
      ? (dailyExhausted ? "daily" as const : "weekly" as const)
      : "" as const;
    const firstDailyTs = dailyEvents[0] ? Math.floor(dailyEvents[0].createdAt.getTime() / 1000) : 0;
    const firstWeeklyTs = weeklyEvents[0] ? Math.floor(weeklyEvents[0].createdAt.getTime() / 1000) : 0;
    return createDefaultQuota({
      dailyRemaining: windowExhausted
        ? bonusRemaining
        : Math.max(0, effectiveDailyLimit - dailyUsed),
      weeklyRemaining: windowExhausted
        ? bonusRemaining
        : Math.max(0, effectiveWeeklyLimit - weeklyUsed),
      dailyTotal: effectiveDailyLimit,
      weeklyTotal: effectiveWeeklyLimit,
      bonusCreditsRemaining: bonusRemaining,
      requiresUpgrade,
      exhaustedReason,
      nextDailyResetAt: firstDailyTs ? firstDailyTs + DAY_SECONDS : 0,
      nextWeeklyResetAt: firstWeeklyTs ? firstWeeklyTs + WEEK_SECONDS : 0,
      hostedAiAvailable: Boolean(apiEnv.aiApiKey),
      hostedTwitterAvailable: Boolean(apiEnv.twitterApiKey),
    });
  }

  async updateQuotaOverride(deviceId: string, override: {
    dailyLimit?: number | null;
    weeklyLimit?: number | null;
    bonusCredits?: number;
    note?: string;
  }) {
    await this.getOrCreate(deviceId);
    const data: Record<string, unknown> = {};
    if (override.dailyLimit !== undefined) data.dailyLimit = override.dailyLimit;
    if (override.weeklyLimit !== undefined) data.weeklyLimit = override.weeklyLimit;
    if (override.bonusCredits !== undefined) data.bonusCredits = override.bonusCredits;
    if (override.note !== undefined) data.note = override.note;
    return prisma.anonymousSession.update({ where: { deviceId }, data });
  }

  async getSessionDetail(deviceId: string) {
    const session = await prisma.anonymousSession.findUnique({
      where: { deviceId },
      select: {
        deviceId: true,
        dailyLimit: true,
        weeklyLimit: true,
        bonusCredits: true,
        note: true,
        createdAt: true,
        lastSeenAt: true,
      },
    });
    if (!session) return null;
    return {
      ...session,
      effectiveDailyLimit: session.dailyLimit ?? apiEnv.dailyTrialLimit,
      effectiveWeeklyLimit: session.weeklyLimit ?? apiEnv.weeklyTrialLimit,
    };
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
      id: randomUUID(),
      status: "finished",
      downloadUrl: "https://tweetquote.app/export/demo.png",
      createdAt: nowIso(),
    };
    this.jobs.set(job.id, job);
    return job;
  }
}
