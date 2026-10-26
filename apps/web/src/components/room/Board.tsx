"use client";

import { COLUMNS } from "@retro/shared";
import { Column } from "./Column";
import type { RoomActions } from "@/lib/use-retro-room";

export function Board({ actions }: { actions: RoomActions }) {
  return (
    <main className="grid flex-1 grid-cols-1 gap-4 p-4 sm:p-6 md:grid-cols-3">
      {COLUMNS.map((column) => (
        <Column key={column.id} column={column} actions={actions} />
      ))}
    </main>
  );
}
