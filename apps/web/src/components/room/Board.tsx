"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { columnsOf, type CardView } from "@retro/shared";
import { useState } from "react";
import { useRetroStore } from "@/lib/retro-store";
import type { RoomActions } from "@/lib/use-retro-room";
import { ActionPanel } from "./ActionPanel";
import { Column } from "./Column";
import { DiscussList } from "./DiscussList";
import { ReviewList } from "./ReviewList";
import { Summary } from "./Summary";

export function Board({ actions }: { actions: RoomActions }) {
  const stage = useRetroStore((s) => s.retro?.stage);
  const template = useRetroStore((s) => s.retro?.template ?? "classic");
  // The discussed topic an action item is being written for.
  const [source, setSource] = useState<CardView | null>(null);
  const sensors = useSensors(
    // A small threshold keeps clicks on Edit / Ungroup from starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  if (stage === "review") return <ReviewList actions={actions} />;
  if (stage === "done") return <Summary actions={actions} />;
  if (stage === "discuss") {
    return (
      <main className="grid flex-1 items-start gap-4 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <DiscussList actions={actions} onMakeAction={setSource} />
        <ActionPanel actions={actions} source={source} onClearSource={() => setSource(null)} />
      </main>
    );
  }

  const columnIds = columnsOf(template);
  const columns = (
    <main
      className={`grid flex-1 grid-cols-1 gap-4 p-4 sm:p-6 ${
        columnIds.length === 4 ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-3"
      }`}
    >
      {columnIds.map((columnId) => (
        <Column key={columnId} columnId={columnId} actions={actions} />
      ))}
    </main>
  );

  if (stage !== "group") return columns;

  function onDragEnd({ active, over }: DragEndEvent) {
    if (over && over.id !== active.id) void actions.groupCard(String(active.id), String(over.id));
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      {columns}
    </DndContext>
  );
}
