"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { COLUMNS } from "@retro/shared";
import { useRetroStore } from "@/lib/retro-store";
import type { RoomActions } from "@/lib/use-retro-room";
import { Column } from "./Column";
import { DiscussList } from "./DiscussList";

export function Board({ actions }: { actions: RoomActions }) {
  const stage = useRetroStore((s) => s.retro?.stage);
  const sensors = useSensors(
    // A small threshold keeps clicks on Edit / Ungroup from starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  if (stage === "discuss") return <DiscussList actions={actions} />;

  const columns = (
    <main className="grid flex-1 grid-cols-1 gap-4 p-4 sm:p-6 md:grid-cols-3">
      {COLUMNS.map((column) => (
        <Column key={column.id} column={column} actions={actions} />
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
