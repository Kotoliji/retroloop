"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useTranslations } from "next-intl";
import type { CardGroup } from "@/lib/board-state";
import { useRetroStore } from "@/lib/retro-store";
import type { RoomActions } from "@/lib/use-retro-room";
import { CardItem } from "./CardItem";
import { VoteControls } from "./VoteControls";

/** A top-level card with the cards grouped under it. */
export function CardGroupView({ group, actions }: { group: CardGroup; actions: RoomActions }) {
  const t = useTranslations("Board");
  const stage = useRetroStore((s) => s.retro?.stage);
  const grouping = stage === "group";
  const { lead, members } = group;

  const body = (
    <div className="rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <CardItem card={lead} actions={actions} />
      {members.length > 0 && (
        <ul aria-label={t("groupedCards")} className="flex flex-col border-t border-dashed border-zinc-200 dark:border-zinc-800">
          {members.map((member) => (
            <li key={member.id} className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-800/60">
              {grouping ? (
                <Draggable id={member.id}>
                  <CardItem card={member} actions={actions} nested />
                </Draggable>
              ) : (
                <CardItem card={member} actions={actions} nested />
              )}
            </li>
          ))}
        </ul>
      )}
      {stage === "vote" && <VoteControls card={lead} actions={actions} />}
    </div>
  );

  return <li>{grouping ? <Draggable id={lead.id}>{body}</Draggable> : body}</li>;
}

/** Can be dragged onto another card, and other cards can be dropped onto it. */
function Draggable({ id, children }: { id: string; children: React.ReactNode }) {
  const t = useTranslations("Board");
  const drag = useDraggable({ id });
  const drop = useDroppable({ id });
  const highlighted = drop.isOver && !drag.isDragging;

  return (
    <div
      ref={(node) => {
        drag.setNodeRef(node);
        drop.setNodeRef(node);
      }}
      style={drag.transform ? { transform: CSS.Translate.toString(drag.transform) } : undefined}
      {...drag.listeners}
      {...drag.attributes}
      aria-roledescription={t("draggable")}
      className={`cursor-grab touch-none rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
        drag.isDragging ? "relative z-20 cursor-grabbing opacity-80 shadow-lg" : ""
      } ${highlighted ? "ring-2 ring-sky-500" : ""}`}
    >
      {children}
    </div>
  );
}
