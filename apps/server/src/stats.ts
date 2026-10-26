import type { AdminStats } from "@retro/shared";
import type { Prisma } from "./db";

const WEEKS = 12;
const WEEKLY_EVENTS = ["team_created", "next_retro_started", "participant_joined"] as const;

/**
 * Product numbers for the operator: how far teams get, whether they come back,
 * what people say, and whether action items get done. Counts come from the
 * anonymous events, which outlive deleted retros; survey answers and the
 * follow-through rate come from the data that still exists.
 */
export async function collectStats(prisma: Prisma, now = new Date()): Promise<AdminStats> {
  const [byName, stages, ratings, quotes, reviewed, weekly] = await Promise.all([
    prisma.productEvent.groupBy({ by: ["name"], _count: { _all: true } }),
    prisma.$queryRaw<{ stage: string; retros: bigint }[]>`
      SELECT props->>'stage' AS stage, count(DISTINCT "retroId") AS retros
      FROM "ProductEvent" WHERE name = 'stage_entered' GROUP BY 1`,
    prisma.surveyResponse.groupBy({ by: ["rating"], _count: { _all: true } }),
    prisma.surveyResponse.findMany({
      where: { quotable: true, comment: { not: null } },
      select: { rating: true, comment: true, locale: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.actionItem.groupBy({
      by: ["status"],
      where: { reviewedInRetroId: { not: null } },
      _count: { _all: true },
    }),
    prisma.$queryRaw<{ week: Date; name: string; count: bigint }[]>`
      SELECT date_trunc('week', "createdAt") AS week, name, count(*) AS count
      FROM "ProductEvent"
      WHERE name IN ('team_created', 'next_retro_started', 'participant_joined')
        AND "createdAt" > ${new Date(now.getTime() - WEEKS * 7 * 86_400_000)}
      GROUP BY 1, 2 ORDER BY 1`,
  ]);

  const events = Object.fromEntries(byName.map((e) => [e.name, e._count._all]));
  const reachedStage = Object.fromEntries(stages.map((s) => [s.stage, Number(s.retros)]));
  const distribution = [1, 2, 3, 4, 5].map((rating) => ratings.find((r) => r.rating === rating)?._count._all ?? 0);
  const answers = distribution.reduce((a, b) => a + b, 0);
  const outcome = (status: string) => reviewed.find((r) => r.status === status)?._count._all ?? 0;

  // Every one of the last 12 weeks (Monday-based, like date_trunc), including empty ones.
  const weeks = new Map<string, Record<(typeof WEEKLY_EVENTS)[number], number>>();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const monday = today - ((now.getUTCDay() + 6) % 7) * 86_400_000;
  for (let i = WEEKS - 1; i >= 0; i--) {
    const key = new Date(monday - i * 7 * 86_400_000).toISOString().slice(0, 10);
    weeks.set(key, { team_created: 0, next_retro_started: 0, participant_joined: 0 });
  }
  for (const row of weekly) {
    const key = row.week.toISOString().slice(0, 10);
    const week = weeks.get(key);
    if (week) week[row.name as (typeof WEEKLY_EVENTS)[number]] = Number(row.count);
  }

  return {
    funnel: {
      teams: events.team_created ?? 0,
      reachedDiscussion: reachedStage.discuss ?? 0,
      completed: reachedStage.done ?? 0,
      nextRetros: events.next_retro_started ?? 0,
    },
    activity: {
      participants: events.participant_joined ?? 0,
      cards: events.card_added ?? 0,
      actionItems: events.action_add ?? 0,
      exports: (["export_markdown", "export_csv", "export_ics", "export_github"] as const).reduce(
        (sum, name) => sum + (events[name] ?? 0),
        0,
      ),
    },
    survey: {
      answers,
      average: answers ? distribution.reduce((sum, n, i) => sum + n * (i + 1), 0) / answers : null,
      distribution,
      quotes: quotes.map((q) => ({
        rating: q.rating,
        comment: q.comment!,
        locale: q.locale,
        date: q.createdAt.toISOString().slice(0, 10),
      })),
    },
    followThrough: { done: outcome("done"), notYet: outcome("open"), dropped: outcome("dropped") },
    weekly: [...weeks].map(([week, counts]) => ({
      week,
      teams: counts.team_created,
      nextRetros: counts.next_retro_started,
      participants: counts.participant_joined,
    })),
  };
}
