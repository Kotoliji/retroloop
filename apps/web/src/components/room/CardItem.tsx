"use client";

import { LIMITS, type CardView } from "@retro/shared";
import { useTranslations } from "next-intl";
import { memo, useState } from "react";
import { useRetroStore } from "@/lib/retro-store";
import type { RoomActions } from "@/lib/use-retro-room";

interface Props {
  card: CardView;
  actions: RoomActions;
  /** Rendered inside a group, under its lead card. */
  nested?: boolean;
}

export const CardItem = memo(function CardItem({ card, actions, nested = false }: Props) {
  const t = useTranslations("Board");
  const tc = useTranslations("Common");
  const stage = useRetroStore((s) => s.retro?.stage);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card.text ?? "");
  const editable = card.mine && (stage === "write" || stage === "group");

  function startEditing() {
    setDraft(card.text ?? "");
    setEditing(true);
  }

  function save() {
    const text = draft.trim();
    setEditing(false);
    if (text && text !== card.text) void actions.editCard(card, text);
  }

  if (card.text === null) {
    return (
      <div className="p-3" aria-label={t("hiddenCard")}>
        <div className="h-4 w-3/4 rounded bg-zinc-200 dark:bg-zinc-800" aria-hidden />
        <div className="mt-2 h-4 w-1/2 rounded bg-zinc-200 dark:bg-zinc-800" aria-hidden />
      </div>
    );
  }

  if (editing) {
    return (
      <div className="p-2">
        <label htmlFor={`edit-${card.id}`} className="sr-only">
          {t("editCard")}
        </label>
        <textarea
          id={`edit-${card.id}`}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation(); // keep the drag-and-drop keyboard handler out of typing
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              save();
            }
            if (e.key === "Escape") setEditing(false);
          }}
          onBlur={save}
          maxLength={LIMITS.cardLength}
          rows={3}
          className="w-full resize-none rounded border border-zinc-900 bg-transparent p-1 text-sm outline-none dark:border-zinc-300"
        />
      </div>
    );
  }

  const showUngroup = nested && stage === "group";
  return (
    <div className={nested ? "px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300" : "p-3 text-sm"}>
      <p className="break-words whitespace-pre-wrap">{card.text}</p>
      {(editable || showUngroup) && (
        <div className="mt-2 flex items-center gap-3 text-xs text-zinc-500">
          {card.mine && <span>{t("yourCard")}</span>}
          {editable && (
            <button onClick={startEditing} className="font-medium hover:text-zinc-900 dark:hover:text-zinc-100">
              {tc("edit")}
            </button>
          )}
          {editable && (
            <button onClick={() => void actions.deleteCard(card)} className="font-medium hover:text-red-600">
              {tc("delete")}
            </button>
          )}
          {showUngroup && (
            <button
              onClick={() => void actions.ungroupCard(card.id)}
              className="font-medium hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              {t("ungroup")}
            </button>
          )}
        </div>
      )}
    </div>
  );
});
