import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { sendDueReminders, type Mail } from "../src/reminders";
import { client, join, next, ok, prisma, startServer, store } from "./helpers";

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

async function setup() {
  const address = await startServer();
  const retro = await store.createRetro("Reminder team");
  const alice = await client(address);
  await join(alice, retro.id, "Alice", { hostKey: retro.hostKey });
  ok(await alice.emitWithAck("retro:stage", { stage: "discuss" }));
  const add = async (text: string, dueDate: string) => {
    const id = randomUUID();
    ok(await alice.emitWithAck("action:add", { id, text, ownerName: "Bob", dueDate }));
    return id;
  };
  return { retro, alice, add };
}

function fakeMailer() {
  const sent: Mail[] = [];
  return { sent, mailer: { send: async (mail: Mail) => void sent.push(mail) } };
}

describe("e-mail reminders", () => {
  // sendDueReminders looks at the whole database, which outlives a test run.
  beforeEach(() => prisma.actionItem.updateMany({ data: { reminderEmail: null } }));

  it("are set per item, and the address never reaches browsers", async () => {
    const { alice, add } = await setup();
    const id = await add("Fix flaky tests", day(3));
    const update = next(alice, "actions:changed");
    ok(await alice.emitWithAck("action:remind", { id, email: "bob@example.com", locale: "uk" }));
    const { actions } = await update;
    expect(actions[0]).toMatchObject({ reminder: true, reminderSent: false });
    expect(JSON.stringify(actions)).not.toContain("bob@example.com");

    expect(await alice.emitWithAck("action:remind", { id, email: "not an email" })).toEqual({
      ok: false,
      error: "invalid",
    });
  });

  it("send one e-mail for items due by tomorrow, then delete the address", async () => {
    const { retro, alice, add } = await setup();
    const soon = await add("Write the runbook", day(1));
    const later = await add("Migrate CI", day(5));
    const finished = await add("Already done", day(0));
    for (const id of [soon, later, finished]) {
      ok(await alice.emitWithAck("action:remind", { id, email: `${id}@example.com`, locale: "uk" }));
    }
    await prisma.actionItem.update({ where: { id: finished }, data: { status: "done" } });

    const { sent, mailer } = fakeMailer();
    expect(await sendDueReminders(prisma, mailer, "https://retro.example")).toBe(1);
    expect(sent[0].to).toBe(`${soon}@example.com`);
    expect(sent[0].subject).toContain("Нагадування");
    expect(sent[0].text).toContain(`https://retro.example/uk/r/${retro.id}`);

    const stored = await prisma.actionItem.findUnique({ where: { id: soon } });
    expect(stored).toMatchObject({ reminderEmail: null, reminderLocale: null });
    expect(stored?.reminderSentAt).not.toBeNull();

    expect(await sendDueReminders(prisma, mailer, "https://retro.example")).toBe(0);
    expect(await alice.emitWithAck("action:remind", { id: soon, email: "again@example.com" })).toEqual({
      ok: false,
      error: "not_found",
    });
  });

  it("keep the address for the next run when sending fails", async () => {
    const { add, alice } = await setup();
    const id = await add("Due today", day(0));
    ok(await alice.emitWithAck("action:remind", { id, email: "owner@example.com" }));
    const failing = { send: async () => Promise.reject(new Error("SMTP down")) };
    expect(await sendDueReminders(prisma, failing, "https://retro.example")).toBe(0);
    expect((await prisma.actionItem.findUnique({ where: { id } }))?.reminderEmail).toBe("owner@example.com");
  });
});
