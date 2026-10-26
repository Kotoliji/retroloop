"use client";

import { LIMITS, type ActionItemView } from "@retro/shared";
import { useId, useState } from "react";
import { addDays, today } from "@/lib/dates";
import { useRetroStore } from "@/lib/retro-store";

export interface ActionDraft {
  text: string;
  ownerName: string;
  dueDate: string;
}

interface Props {
  initial?: ActionItemView;
  /** Shown above the form when the item comes from a discussed topic. */
  source?: { text: string; onClear(): void };
  submitLabel: string;
  onSubmit(draft: ActionDraft): Promise<boolean>;
  onCancel?(): void;
}

const input =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-300";

/** Every item needs an owner and a due date — the form will not submit without them. */
export function ActionForm({ initial, source, submitLabel, onSubmit, onCancel }: Props) {
  const participants = useRetroStore((s) => s.participants);
  const [text, setText] = useState(initial?.text ?? "");
  const [ownerName, setOwnerName] = useState(initial?.ownerName ?? "");
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? addDays(today(), 14));
  const [busy, setBusy] = useState(false);
  const id = useId();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const draft = { text: text.trim(), ownerName: ownerName.trim(), dueDate };
    // Clear right away rather than after the reply: the new item reaches the
    // list before the acknowledgement does, and someone may already be typing
    // the next one by then.
    if (!initial) {
      setText("");
      setOwnerName("");
    }
    setBusy(true);
    const saved = await onSubmit(draft);
    setBusy(false);
    if (!saved && !initial) {
      setText(draft.text);
      setOwnerName(draft.ownerName);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      {source && (
        <p className="flex items-start justify-between gap-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:bg-sky-950 dark:text-sky-200">
          <span>
            From topic: <span className="font-medium">{source.text}</span>
          </span>
          <button type="button" onClick={source.onClear} aria-label="Unlink the topic" className="font-semibold">
            ×
          </button>
        </p>
      )}
      <label className="sr-only" htmlFor={`${id}-text`}>
        What will be done
      </label>
      <textarea
        id={`${id}-text`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What exactly will be done?"
        maxLength={LIMITS.actionLength}
        rows={2}
        required
        className={`${input} resize-none`}
      />
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
          Owner
          <input
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            list={`${id}-people`}
            maxLength={LIMITS.nameLength}
            required
            placeholder="Who does it"
            className={input}
          />
          <datalist id={`${id}-people`}>
            {participants.map((p) => (
              <option key={p.id} value={p.name} />
            ))}
          </datalist>
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
          Due
          <input
            type="date"
            value={dueDate}
            min={today()}
            onChange={(e) => setDueDate(e.target.value)}
            required
            className={input}
          />
        </label>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy || !text.trim() || !ownerName.trim() || !dueDate}
          className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-3 py-2 text-sm font-medium text-zinc-600">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
