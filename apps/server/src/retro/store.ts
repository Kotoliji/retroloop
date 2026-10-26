import { createHash, randomBytes } from "node:crypto";
import {
  columnsOf,
  LIMITS,
  type AddActionRequest,
  type AddCardRequest,
  type CreatedRetro,
  type EditActionRequest,
  type EditCardRequest,
  type ReviewActionRequest,
  type RetroSummary,
  type Stage,
  type SurveyAnswer,
  type TeamStats,
  type TemplateId,
} from "@retro/shared";
import type { Prisma } from "../db";
import type { ActionRow, CardRow, RetroRow, VoteRow } from "./views";

const newRetroId = () => randomBytes(8).toString("base64url").slice(0, 10);
const newSecret = () => randomBytes(24).toString("base64url");
const hash = (secret: string) => createHash("sha256").update(secret).digest("hex");

const isUniqueViolation = (err: unknown) =>
  typeof err === "object" && err !== null && "code" in err && err.code === "P2002";

export type StoreFailure =
  | "invalid"
  | "not_found"
  | "forbidden"
  | "wrong_stage"
  | "no_votes_left"
  | "too_many_actions";
export const STORE_FAILURES: ReadonlySet<string> = new Set<StoreFailure>([
  "invalid",
  "not_found",
  "forbidden",
  "wrong_stage",
  "no_votes_left",
  "too_many_actions",
]);

const cardSelect = { id: true, columnId: true, text: true, authorId: true, groupId: true, createdAt: true } as const;
const retroSelect = {
  id: true,
  teamId: true,
  number: true,
  template: true,
  title: true,
  stage: true,
  hasReview: true,
  nextRetroId: true,
  team: { select: { name: true } },
  facilitatorId: true,
  votesPerPerson: true,
  timerEndsAt: true,
  focusCardId: true,
} as const;

const EDITABLE: readonly Stage[] = ["write", "group"];
const ACTION_STAGES: readonly Stage[] = ["discuss", "done"];

/** A due date as stored in a DATE column: that calendar day at midnight UTC. */
const toDate = (day: string) => new Date(`${day}T00:00:00Z`);

export function createRetroStore(prisma: Prisma) {
  const getRetro = (id: string): Promise<RetroRow | null> =>
    prisma.retro.findUnique({ where: { id }, select: retroSelect });

  const getCard = (retroId: string, id: string): Promise<CardRow | null> =>
    prisma.card.findFirst({ where: { id, retroId }, select: cardSelect });

  async function stageOf(retroId: string) {
    return (await getRetro(retroId))?.stage as Stage | undefined;
  }

  async function ownCardInEditableStage(retroId: string, authorId: string, id: string) {
    const [stage, card] = await Promise.all([stageOf(retroId), getCard(retroId, id)]);
    if (!card) return "not_found" as const;
    if (card.authorId !== authorId) return "forbidden" as const;
    if (!stage || !EDITABLE.includes(stage)) return "wrong_stage" as const;
    return card;
  }

  return {
    getRetro,
    getCard,

    async findRetro(id: string): Promise<RetroSummary | null> {
      return prisma.retro.findUnique({ where: { id }, select: { id: true, title: true } });
    },

    /** Starts a new team with its first retro. */
    async createRetro(teamName: string): Promise<CreatedRetro> {
      const hostKey = newSecret();
      const retro = await prisma.retro.create({
        data: {
          id: newRetroId(),
          title: "Retro 1",
          hostKeyHash: hash(hostKey),
          team: { create: { id: newRetroId(), name: teamName } },
        },
        select: { id: true, title: true },
      });
      return { ...retro, hostKey };
    },

    /**
     * Creates the team's next retro, which opens with a review when earlier
     * action items are still open. Asking again returns the same next retro
     * with a new host key, so the facilitator can always get back in.
     */
    async createNextRetro(retroId: string): Promise<CreatedRetro | StoreFailure> {
      const hostKey = newSecret();
      return prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Retro" WHERE id = ${retroId} FOR UPDATE`;
        const current = await tx.retro.findUnique({ where: { id: retroId } });
        if (!current) return "not_found" as const;

        if (current.nextRetroId) {
          const next = await tx.retro.update({
            where: { id: current.nextRetroId },
            data: { hostKeyHash: hash(hostKey) },
            select: { id: true, title: true },
          });
          return { ...next, hostKey };
        }

        const last = await tx.retro.aggregate({ where: { teamId: current.teamId }, _max: { number: true } });
        const number = (last._max.number ?? 0) + 1;
        const open = await tx.actionItem.count({ where: { teamId: current.teamId, status: "open" } });
        const next = await tx.retro.create({
          data: {
            id: newRetroId(),
            teamId: current.teamId,
            number,
            title: `Retro ${number}`,
            hostKeyHash: hash(hostKey),
            hasReview: open > 0,
            stage: open > 0 ? "review" : "write",
            votesPerPerson: current.votesPerPerson,
            template: current.template,
          },
          select: { id: true, title: true },
        });
        await tx.retro.update({ where: { id: retroId }, data: { nextRetroId: next.id } });
        return { ...next, hostKey };
      });
    },

    /** Returns null when the retro does not exist. */
    async join(retroId: string, name: string, token?: string, hostKey?: string) {
      const retro = await prisma.retro.findUnique({ where: { id: retroId } });
      if (!retro) return null;

      let joined: { token: string; participant: { id: string; name: string }; created: boolean } | undefined;
      if (token) {
        const existing = await prisma.participant.findUnique({ where: { tokenHash: hash(token) } });
        if (existing?.retroId === retroId) {
          const participant =
            existing.name === name
              ? existing
              : await prisma.participant.update({ where: { id: existing.id }, data: { name } });
          joined = { token, participant, created: false };
        }
      }
      if (!joined) {
        const fresh = newSecret();
        const participant = await prisma.participant.create({
          data: { retroId, name, tokenHash: hash(fresh) },
        });
        joined = { token: fresh, participant, created: true };
      }

      if (hostKey && retro.hostKeyHash === hash(hostKey) && retro.facilitatorId !== joined.participant.id) {
        await prisma.retro.update({ where: { id: retroId }, data: { facilitatorId: joined.participant.id } });
      }
      return joined;
    },

    async participants(retroId: string) {
      return prisma.participant.findMany({
        where: { retroId },
        select: { id: true, name: true },
        orderBy: { createdAt: "asc" },
      });
    },

    /** Everything needed to build any participant's view of the board. */
    async board(retroId: string): Promise<{ retro: RetroRow; cards: CardRow[]; votes: VoteRow[] } | null> {
      const [retro, cards, votes] = await Promise.all([
        getRetro(retroId),
        prisma.card.findMany({ where: { retroId }, select: cardSelect, orderBy: { createdAt: "asc" } }),
        prisma.vote.findMany({ where: { retroId }, select: { cardId: true, participantId: true } }),
      ]);
      return retro && { retro, cards, votes };
    },

    async votesOn(cardId: string): Promise<VoteRow[]> {
      return prisma.vote.findMany({ where: { cardId }, select: { cardId: true, participantId: true } });
    },

    /**
     * Idempotent by card id: the same author sending the same card twice (a retry
     * after a dropped connection) gets the stored card back, not a duplicate.
     */
    async addCard(retroId: string, authorId: string, req: AddCardRequest): Promise<CardRow | StoreFailure> {
      const retro = await getRetro(retroId);
      if (retro?.stage !== "write") return "wrong_stage";
      if (!columnsOf(retro.template as TemplateId).includes(req.columnId)) return "invalid";
      try {
        return await prisma.card.create({ data: { ...req, retroId, authorId }, select: cardSelect });
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        const existing = await getCard(retroId, req.id);
        return existing?.authorId === authorId ? existing : "forbidden";
      }
    },

    async editCard(retroId: string, authorId: string, req: EditCardRequest): Promise<CardRow | StoreFailure> {
      const found = await ownCardInEditableStage(retroId, authorId, req.id);
      if (typeof found === "string") return found;
      return prisma.card.update({ where: { id: req.id }, data: { text: req.text }, select: cardSelect });
    },

    /** Deleting a group's top card promotes its first member to lead the group. */
    async deleteCard(retroId: string, authorId: string, id: string): Promise<true | StoreFailure> {
      const found = await ownCardInEditableStage(retroId, authorId, id);
      if (typeof found === "string") return found;
      await prisma.$transaction(async (tx) => {
        const members = await tx.card.findMany({ where: { groupId: id }, orderBy: { createdAt: "asc" } });
        const [lead, ...rest] = members;
        if (lead) {
          await tx.card.update({ where: { id: lead.id }, data: { groupId: null } });
          await tx.card.updateMany({ where: { id: { in: rest.map((c) => c.id) } }, data: { groupId: lead.id } });
        }
        await tx.card.delete({ where: { id } });
      });
      return true;
    },

    /** Puts a card (and anything grouped under it) into the target's group. */
    async groupCard(retroId: string, id: string, targetId: string): Promise<true | StoreFailure> {
      if ((await stageOf(retroId)) !== "group") return "wrong_stage";
      const [card, target] = await Promise.all([getCard(retroId, id), getCard(retroId, targetId)]);
      if (!card || !target) return "not_found";
      const leadId = target.groupId ?? target.id;
      if (leadId === card.id || card.groupId === leadId) return true;
      const lead = leadId === target.id ? target : await getCard(retroId, leadId);
      if (!lead) return "not_found";

      await prisma.card.updateMany({
        where: { retroId, OR: [{ id: card.id }, { groupId: card.id }] },
        data: { groupId: lead.id, columnId: lead.columnId },
      });
      return true;
    },

    async ungroupCard(retroId: string, id: string): Promise<true | StoreFailure> {
      if ((await stageOf(retroId)) !== "group") return "wrong_stage";
      const card = await getCard(retroId, id);
      if (!card) return "not_found";
      if (card.groupId) await prisma.card.update({ where: { id }, data: { groupId: null } });
      return true;
    },

    /**
     * The vote limit is enforced in a transaction that locks the voter's row,
     * so parallel requests from one participant are counted one at a time and
     * cannot slip past the limit together.
     */
    async addVote(retroId: string, participantId: string, cardId: string): Promise<number | StoreFailure> {
      return prisma.$transaction(async (tx) => {
        const retro = await tx.retro.findUnique({ where: { id: retroId } });
        if (retro?.stage !== "vote") return "wrong_stage" as const;
        const card = await tx.card.findFirst({ where: { id: cardId, retroId } });
        if (!card || card.groupId) return "not_found" as const;

        await tx.$queryRaw`SELECT id FROM "Participant" WHERE id = ${participantId} FOR UPDATE`;
        const used = await tx.vote.count({ where: { retroId, participantId } });
        if (used >= retro.votesPerPerson) return "no_votes_left" as const;

        await tx.vote.create({ data: { retroId, participantId, cardId } });
        return tx.vote.count({ where: { participantId, cardId } });
      });
    },

    async removeVote(retroId: string, participantId: string, cardId: string): Promise<number | StoreFailure> {
      if ((await stageOf(retroId)) !== "vote") return "wrong_stage";
      const vote = await prisma.vote.findFirst({ where: { retroId, participantId, cardId } });
      if (vote) await prisma.vote.delete({ where: { id: vote.id } });
      return prisma.vote.count({ where: { participantId, cardId } });
    },

    /**
     * Items this retro shows: the ones agreed in it, plus items from the team's
     * earlier retros that are still open or were reviewed in this one.
     */
    async actions(retro: RetroRow): Promise<ActionRow[]> {
      return prisma.actionItem.findMany({
        where: {
          OR: [
            { retroId: retro.id },
            {
              teamId: retro.teamId,
              retro: { number: { lt: retro.number } },
              OR: [{ status: "open" }, { reviewedInRetroId: retro.id }],
            },
          ],
        },
        orderBy: { createdAt: "asc" },
      });
    },

    /** How many items from the team's earlier retros got done. */
    async stats(retro: RetroRow): Promise<TeamStats> {
      const earlier = { teamId: retro.teamId, retro: { number: { lt: retro.number } } };
      const [total, done] = await Promise.all([
        prisma.actionItem.count({ where: earlier }),
        prisma.actionItem.count({ where: { ...earlier, status: "done" } }),
      ]);
      return { done, total };
    },

    /**
     * At most LIMITS.maxActionsPerRetro items per retro. The retro row is locked
     * while counting, so parallel adds cannot overshoot the limit together.
     */
    async addAction(retroId: string, req: AddActionRequest): Promise<true | StoreFailure> {
      return prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Retro" WHERE id = ${retroId} FOR UPDATE`;
        const retro = await tx.retro.findUnique({ where: { id: retroId } });
        if (!retro) return "not_found" as const;
        if (!ACTION_STAGES.includes(retro.stage as Stage)) return "wrong_stage" as const;

        const existing = await tx.actionItem.findUnique({ where: { id: req.id } });
        if (existing) return existing.retroId === retroId ? (true as const) : ("forbidden" as const);
        if ((await tx.actionItem.count({ where: { retroId } })) >= LIMITS.maxActionsPerRetro) {
          return "too_many_actions" as const;
        }

        const source = req.sourceCardId
          ? await tx.card.findFirst({ where: { id: req.sourceCardId, retroId } })
          : null;
        await tx.actionItem.create({
          data: {
            id: req.id,
            teamId: retro.teamId,
            retroId,
            sourceCardId: source?.id ?? null,
            text: req.text,
            ownerName: req.ownerName,
            dueDate: toDate(req.dueDate),
          },
        });
        return true as const;
      });
    },

    async editAction(retroId: string, req: EditActionRequest): Promise<true | StoreFailure> {
      if (!ACTION_STAGES.includes((await stageOf(retroId)) as Stage)) return "wrong_stage";
      const { count } = await prisma.actionItem.updateMany({
        where: { id: req.id, retroId },
        data: { text: req.text, ownerName: req.ownerName, dueDate: toDate(req.dueDate) },
      });
      return count ? true : "not_found";
    },

    async deleteAction(retroId: string, id: string): Promise<true | StoreFailure> {
      if (!ACTION_STAGES.includes((await stageOf(retroId)) as Stage)) return "wrong_stage";
      const { count } = await prisma.actionItem.deleteMany({ where: { id, retroId } });
      return count ? true : "not_found";
    },

    /** Marks an item from an earlier retro done, still open (maybe with a new date) or dropped. */
    async reviewAction(retroId: string, req: ReviewActionRequest): Promise<true | StoreFailure> {
      const retro = await getRetro(retroId);
      if (!retro) return "not_found";
      if (retro.stage !== "review") return "wrong_stage";
      const { count } = await prisma.actionItem.updateMany({
        where: { id: req.id, teamId: retro.teamId, retro: { number: { lt: retro.number } } },
        data: {
          status: req.status,
          reviewedInRetroId: retroId,
          ...(req.dueDate ? { dueDate: toDate(req.dueDate) } : {}),
        },
      });
      return count ? true : "not_found";
    },

    /** One answer per participant; answering again replaces it. Only once the retro is wrapped up. */
    async answerSurvey(
      retroId: string,
      participantId: string,
      answer: SurveyAnswer & { locale?: string },
    ): Promise<SurveyAnswer | StoreFailure> {
      if ((await stageOf(retroId)) !== "done") return "wrong_stage";
      const data = { ...answer, retroId };
      const saved = await prisma.surveyResponse.upsert({
        where: { participantId },
        create: { ...data, participantId },
        update: data,
      });
      return { rating: saved.rating, comment: saved.comment, quotable: saved.quotable };
    },

    async surveyOf(participantId: string): Promise<SurveyAnswer | null> {
      return prisma.surveyResponse.findUnique({
        where: { participantId },
        select: { rating: true, comment: true, quotable: true },
      });
    },

    /** Deletes a retro and everything in it; a team left without retros goes too. */
    async deleteRetro(retroId: string) {
      const retro = await prisma.retro.findUnique({ where: { id: retroId } });
      if (!retro) return;
      await prisma.$transaction(async (tx) => {
        await tx.retro.delete({ where: { id: retroId } });
        await tx.retro.updateMany({ where: { nextRetroId: retroId }, data: { nextRetroId: null } });
        if ((await tx.retro.count({ where: { teamId: retro.teamId } })) === 0) {
          await tx.team.delete({ where: { id: retro.teamId } });
        }
      });
    },

    /**
     * Data retention: deletes every team whose latest retro was created more
     * than `days` ago, with all of its retros, cards, names and answers.
     */
    async purgeInactiveTeams(days: number, now = new Date()): Promise<number> {
      const cutoff = new Date(now.getTime() - days * 86_400_000);
      const { count } = await prisma.team.deleteMany({
        where: { retros: { none: { createdAt: { gte: cutoff } } } },
      });
      return count;
    },

    async setStage(retroId: string, stage: Stage) {
      await prisma.retro.update({ where: { id: retroId }, data: { stage, timerEndsAt: null, focusCardId: null } });
    },

    /** The format can change only while writing and before the first card. */
    async setTemplate(retroId: string, template: TemplateId): Promise<true | StoreFailure> {
      const retro = await getRetro(retroId);
      if (!retro) return "not_found";
      if (retro.stage !== "write" || (await prisma.card.count({ where: { retroId } })) > 0) return "wrong_stage";
      await prisma.retro.update({ where: { id: retroId }, data: { template } });
      return true;
    },

    async setVotesPerPerson(retroId: string, votesPerPerson: number) {
      await prisma.retro.update({ where: { id: retroId }, data: { votesPerPerson } });
    },

    async setFocus(retroId: string, cardId: string | null): Promise<true | StoreFailure> {
      if (cardId) {
        const card = await getCard(retroId, cardId);
        if (!card || card.groupId) return "not_found";
      }
      await prisma.retro.update({ where: { id: retroId }, data: { focusCardId: cardId } });
      return true;
    },

    async setTimer(retroId: string, endsAt: Date | null) {
      await prisma.retro.update({ where: { id: retroId }, data: { timerEndsAt: endsAt } });
    },

    async handover(retroId: string, participantId: string): Promise<true | StoreFailure> {
      const participant = await prisma.participant.findFirst({ where: { id: participantId, retroId } });
      if (!participant) return "not_found";
      await prisma.retro.update({ where: { id: retroId }, data: { facilitatorId: participantId } });
      return true;
    },
  };
}

export type RetroStore = ReturnType<typeof createRetroStore>;
