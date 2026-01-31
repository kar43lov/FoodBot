import { PrismaClient } from '@prisma/client';

// Re-export Prisma types for use in the application
export type { Project, User, Membership, MealEntry, Prisma } from '@prisma/client';

// Type-safe enum-like constants for fields that are strings in SQLite
// but enums in PostgreSQL
export const ProjectType = {
  GROUP: 'group',
  PERSONAL: 'personal',
} as const;
export type ProjectType = (typeof ProjectType)[keyof typeof ProjectType];

export const MembershipRole = {
  MEMBER: 'member',
  ADMIN: 'admin',
} as const;
export type MembershipRole = (typeof MembershipRole)[keyof typeof MembershipRole];

export const MealEntrySource = {
  PHOTO: 'photo',
  MANUAL: 'manual',
  WEB: 'web',
} as const;
export type MealEntrySource = (typeof MealEntrySource)[keyof typeof MealEntrySource];

// Singleton Prisma client instance
let prisma: PrismaClient;

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// Prevent multiple instances during development with hot reloading
if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient();
} else {
  if (!global.__prisma) {
    global.__prisma = new PrismaClient();
  }
  prisma = global.__prisma;
}

export { prisma };
export default prisma;
