import { PrismaClient } from "@prisma/client";
import { apiEnv } from "./env";

process.env.DATABASE_URL ||= `file:${apiEnv.sqliteDbPath}`;

const globalForPrisma = globalThis as typeof globalThis & {
  __tweetquotePrisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.__tweetquotePrisma ??
  new PrismaClient({
    log: ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__tweetquotePrisma = prisma;
}
