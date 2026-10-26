import type { Prisma } from "./db";

export interface EventContext {
  teamId?: string;
  retroId?: string;
}

/**
 * Anonymous product analytics stored next to the app data. An event records
 * what happened and in which retro — never who did it or what they wrote — so
 * there is nothing personal to consent to, leak or delete.
 */
export function createAnalytics(prisma: Prisma, onError: (err: unknown, name: string) => void = () => {}) {
  return {
    /** Fire and forget: a failed insert is reported and never breaks the request. */
    track(name: string, context: EventContext = {}, props?: Record<string, string | number | boolean>) {
      prisma.productEvent
        .create({ data: { name, teamId: context.teamId, retroId: context.retroId, props } })
        .catch((err: unknown) => onError(err, name));
    },
  };
}

export type Analytics = ReturnType<typeof createAnalytics>;
