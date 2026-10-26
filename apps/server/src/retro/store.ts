import { createHash, randomBytes } from "node:crypto";
import type {
  AddCardRequest,
  CardView,
  ColumnId,
  EditCardRequest,
  RetroSnapshot,
  RetroSummary,
} from "@retro/shared";
import type { Prisma } from "../db";

const newRetroId = () => randomBytes(8).toString("base64url").slice(0, 10);
const newToken = () => randomBytes(24).toString("base64url");
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

type CardRow = {
  id: string;
  columnId: string;
  text: string;
  authorId: string;
  createdAt: Date;
};

const toCardView = (card: CardRow): CardView => ({
  id: card.id,
  columnId: card.columnId as ColumnId,
  text: card.text,
  authorId: card.authorId,
  createdAt: card.createdAt.toISOString(),
});

const isUniqueViolation = (err: unknown) =>
  typeof err === "object" && err !== null && "code" in err && err.code === "P2002";

export type CardFailure = "not_found" | "forbidden";

export function createRetroStore(prisma: Prisma) {
  async function findRetro(id: string): Promise<RetroSummary | null> {
    return prisma.retro.findUnique({ where: { id }, select: { id: true, title: true } });
  }

  async function cards(retroId: string): Promise<CardView[]> {
    const rows = await prisma.card.findMany({ where: { retroId }, orderBy: { createdAt: "asc" } });
    return rows.map(toCardView);
  }

  async function findOwnCard(retroId: string, authorId: string, id: string) {
    const card = await prisma.card.findUnique({ where: { id } });
    if (!card || card.retroId !== retroId) return "not_found" as const;
    if (card.authorId !== authorId) return "forbidden" as const;
    return card;
  }

  return {
    findRetro,

    async createRetro(title: string): Promise<RetroSummary> {
      return prisma.retro.create({ data: { id: newRetroId(), title }, select: { id: true, title: true } });
    },

    /** Returns null when the retro does not exist. */
    async join(retroId: string, name: string, token?: string) {
      if (!(await findRetro(retroId))) return null;

      if (token) {
        const existing = await prisma.participant.findUnique({ where: { tokenHash: hashToken(token) } });
        if (existing?.retroId === retroId) {
          const participant =
            existing.name === name
              ? existing
              : await prisma.participant.update({ where: { id: existing.id }, data: { name } });
          return { token, participant };
        }
      }

      const fresh = newToken();
      const participant = await prisma.participant.create({
        data: { retroId, name, tokenHash: hashToken(fresh) },
      });
      return { token: fresh, participant };
    },

    async participants(retroId: string) {
      return prisma.participant.findMany({
        where: { retroId },
        select: { id: true, name: true },
        orderBy: { createdAt: "asc" },
      });
    },

    async snapshot(retroId: string): Promise<Omit<RetroSnapshot, "participants"> | null> {
      const retro = await findRetro(retroId);
      return retro && { retro, cards: await cards(retroId) };
    },

    /**
     * Idempotent by card id: the same author sending the same card twice (a retry
     * after a dropped connection) gets the stored card back, not a duplicate.
     */
    async addCard(retroId: string, authorId: string, req: AddCardRequest): Promise<CardView | CardFailure> {
      try {
        return toCardView(await prisma.card.create({ data: { ...req, retroId, authorId } }));
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        const existing = await findOwnCard(retroId, authorId, req.id);
        return typeof existing === "string" ? "forbidden" : toCardView(existing);
      }
    },

    async editCard(retroId: string, authorId: string, req: EditCardRequest): Promise<CardView | CardFailure> {
      const found = await findOwnCard(retroId, authorId, req.id);
      if (typeof found === "string") return found;
      return toCardView(await prisma.card.update({ where: { id: req.id }, data: { text: req.text } }));
    },

    async deleteCard(retroId: string, authorId: string, id: string): Promise<true | CardFailure> {
      const found = await findOwnCard(retroId, authorId, id);
      if (typeof found === "string") return found;
      await prisma.card.delete({ where: { id } });
      return true;
    },
  };
}

export type RetroStore = ReturnType<typeof createRetroStore>;
