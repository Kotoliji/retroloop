"use client";

import { LIMITS, type CardView } from "@retro/shared";
import { memo, useState } from "react";
import type { RoomActions } from "@/lib/use-retro-room";

interface Props {
  card: CardView;
  mine: boolean;
  actions: RoomActions;
}

export const CardItem = memo(function CardItem({ card, mine, actions }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card.text);

  function startEditing() {
    setDraft(card.text);
    setEditing(true);
  }

  function save() {
    const text = draft.trim();
    setEditing(false);
    if (text && text !== card.text) void actions.editCard(card, text);
  }

  if (editing) {
    return (
      <li className="rounded-lg border border-zinc-900 bg-white p-2 shadow-sm dark:border-zinc-300 dark:bg-zinc-900">
        <label htmlFor={`edit-${card.id}`} className="sr-only">
          Edit card
        </label>
        <textarea
          id={`edit-${card.id}`}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              save();
            }
            if (e.key === "Escape") setEditing(false);
          }}
          onBlur={save}
          maxLength={LIMITS.cardLength}
          rows={3}
          className="w-full resize-none bg-transparent text-sm outline-none"
        />
      </li>
    );
  }

  return (
    <li className="group rounded-lg border border-zinc-200 bg-white p-3 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <p className="break-words whitespace-pre-wrap">{card.text}</p>
      {mine && (
        <div className="mt-2 flex items-center gap-3 text-xs text-zinc-500">
          <span>Your card</span>
          <button onClick={startEditing} className="font-medium hover:text-zinc-900 dark:hover:text-zinc-100">
            Edit
          </button>
          <button
            onClick={() => void actions.deleteCard(card)}
            className="font-medium hover:text-red-600"
          >
            Delete
          </button>
        </div>
      )}
    </li>
  );
});
