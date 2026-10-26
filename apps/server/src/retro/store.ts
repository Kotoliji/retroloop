import { createHash, randomBytes } from "node:crypto";
import type { AddCardRequest, CreatedRetro, EditCardRequest, RetroSummary, Stage } from "@retro/shared";
import type { Prisma } from "../db";
import type { CardRow, RetroRow, VoteRow } from "./views";

const newRetroId = () => randomBytes(8).toString("base64url").slice(0, 10);
const newSecret = () => randomBytes(24).toString("base64url");
const hash = (secret: string) => createHash("sha256").update(secret).digest("hex");

const isUniqueViolation = (err: unknown) =>
  typeof err === "object" && err !== null && "code" in err && err.code === "P2002";

export type StoreFailure = "not_found" | "forbidden" | "wrong_stage" | "no_votes_left";
export const STORE_FAILURES: ReadonlySet<string> = new Set<StoreFailure>([
  "not_found",
  "forbidden",
  "wrong_stage",
  "no_votes_left",
]);

const cardSelect = { id: true, columnId: true, text: true, authorId: true, groupId: true, createdAt: true } as const;
const retroSelect = {
  id: true,
  title: true,
  stage: true,
  facilitatorId: true,
  votesPerPerson: true,
  timerEndsAt: true,
  focusCardId: true,
} as const;

const EDITABLE: readonly Stage[] = ["write", "group"];

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

    async createRetro(title: string): Promise<CreatedRetro> {
      const hostKey = newSecret();
      const retro = await prisma.retro.create({
        data: { id: newRetroId(), title, hostKeyHash: hash(hostKey) },
        select: { id: true, title: true },
      });
      return { ...retro, hostKey };
    },

    /** Returns null when the retro does not exist. */
    async join(retroId: string, name: string, token?: string, hostKey?: string) {
      const retro = await prisma.retro.findUnique({ where: { id: retroId } });
      if (!retro) return null;

      let joined: { token: string; participant: { id: string; name: string } } | undefined;
      if (token) {
        const existing = await prisma.participant.findUnique({ where: { tokenHash: hash(token) } });
        if (existing?.retroId === retroId) {
          const participant =
            existing.name === name
              ? existing
              : await prisma.participant.update({ where: { id: existing.id }, data: { name } });
          joined = { token, participant };
        }
      }
      if (!joined) {
        const fresh = newSecret();
        const participant = await prisma.participant.create({
          data: { retroId, name, tokenHash: hash(fresh) },
        });
        joined = { token: fresh, participant };
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
      if ((await stageOf(retroId)) !== "write") return "wrong_stage";
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

    async setStage(retroId: string, stage: Stage) {
      await prisma.retro.update({ where: { id: retroId }, data: { stage, timerEndsAt: null, focusCardId: null } });
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
