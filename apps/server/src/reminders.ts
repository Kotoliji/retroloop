import nodemailer from "nodemailer";
import type { Prisma } from "./db";

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

export function createSmtpMailer(url: string, from: string): Mailer {
  const transport = nodemailer.createTransport(url);
  return {
    async send(mail) {
      await transport.sendMail({ from, ...mail });
    },
  };
}

interface Wording {
  subject(text: string, date: string): string;
  body(p: { owner: string; text: string; date: string; retro: string; link: string }): string;
}

/** Plain-text e-mails in the language the reminder was asked for in. */
const WORDING: Record<string, Wording> = {
  en: {
    subject: (text, date) => `Reminder: "${text}" is due ${date}`,
    body: ({ owner, text, date, retro, link }) =>
      `Hi ${owner},\n\nThis is the reminder you asked for in ${retro}:\n\n  ${text}\n  Due: ${date}\n\nOpen the retro: ${link}\n\nThis was the only reminder, and the e-mail address has now been deleted from Retroloop.\n`,
  },
  uk: {
    subject: (text, date) => `Нагадування: «${text}» — дедлайн ${date}`,
    body: ({ owner, text, date, retro, link }) =>
      `Привіт, ${owner}!\n\nЦе нагадування, про яке ви просили в ${retro}:\n\n  ${text}\n  Дедлайн: ${date}\n\nВідкрити ретро: ${link}\n\nЦе було єдине нагадування, і адресу вже видалено з Retroloop.\n`,
  },
  ru: {
    subject: (text, date) => `Напоминание: «${text}» — срок ${date}`,
    body: ({ owner, text, date, retro, link }) =>
      `Привет, ${owner}!\n\nЭто напоминание, о котором вы просили в ${retro}:\n\n  ${text}\n  Срок: ${date}\n\nОткрыть ретро: ${link}\n\nЭто было единственное напоминание, и адрес уже удалён из Retroloop.\n`,
  },
  pt: {
    subject: (text, date) => `Lembrete: "${text}" termina a ${date}`,
    body: ({ owner, text, date, retro, link }) =>
      `Olá ${owner},\n\nEste é o lembrete que pediu em ${retro}:\n\n  ${text}\n  Prazo: ${date}\n\nAbrir a retro: ${link}\n\nFoi o único lembrete, e o endereço de e-mail já foi apagado do Retroloop.\n`,
  },
};

const RETRO_WORD: Record<string, string> = { en: "Retro", uk: "Ретро", ru: "Ретро", pt: "Retro" };
const DAY_MS = 86_400_000;

/**
 * Sends the one reminder for every open item due by tomorrow, then deletes the
 * address. A failed send keeps the item for the next run.
 */
export async function sendDueReminders(
  prisma: Prisma,
  mailer: Mailer,
  webOrigin: string,
  now = new Date(),
  onError: (err: unknown) => void = () => {},
) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const due = await prisma.actionItem.findMany({
    where: {
      status: "open",
      reminderEmail: { not: null },
      reminderSentAt: null,
      dueDate: { lte: new Date(today + DAY_MS) },
    },
    include: { retro: { include: { team: true } } },
  });

  let sent = 0;
  for (const item of due) {
    const locale = item.reminderLocale && WORDING[item.reminderLocale] ? item.reminderLocale : "en";
    const wording = WORDING[locale];
    const date = item.dueDate.toISOString().slice(0, 10);
    try {
      await mailer.send({
        to: item.reminderEmail!,
        subject: wording.subject(item.text, date),
        text: wording.body({
          owner: item.ownerName,
          text: item.text,
          date,
          retro: `${item.retro.team.name} · ${RETRO_WORD[locale]} ${item.retro.number}`,
          link: `${webOrigin}/${locale}/r/${item.retroId}`,
        }),
      });
    } catch (err) {
      onError(err);
      continue;
    }
    await prisma.actionItem.update({
      where: { id: item.id },
      data: { reminderEmail: null, reminderLocale: null, reminderSentAt: now },
    });
    sent++;
  }
  return sent;
}
