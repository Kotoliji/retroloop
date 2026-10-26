"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { useRetroStore } from "@/lib/retro-store";
import { savedName } from "@/lib/storage";
import { useRetroRoom } from "@/lib/use-retro-room";
import { Board } from "./Board";
import { NameForm } from "./NameForm";
import { RoomHeader } from "./RoomHeader";

const noSubscribe = () => () => {};

export function RetroRoom() {
  const { retroId } = useParams<{ retroId: string }>();
  // The saved name lives in localStorage, which only exists in the browser.
  const stored = useSyncExternalStore(noSubscribe, savedName, () => null);
  const [chosen, setChosen] = useState<string | null>(null);
  const name = chosen ?? stored;

  if (!name) return <NameForm onSubmit={setChosen} />;
  return <JoinedRoom retroId={retroId} name={name} />;
}

function JoinedRoom({ retroId, name }: { retroId: string; name: string }) {
  const actions = useRetroRoom(retroId, name);
  const status = useRetroStore((s) => s.status);
  const retro = useRetroStore((s) => s.retro);

  if (status === "not_found") {
    return (
      <main className="mx-auto flex max-w-md flex-1 flex-col justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-semibold">This retro does not exist</h1>
        <p className="text-zinc-600 dark:text-zinc-400">Check the link, or start a new one.</p>
        <Link href="/" className="font-medium underline underline-offset-4">
          Start a retro
        </Link>
      </main>
    );
  }

  if (!retro) {
    return (
      <main className="flex flex-1 items-center justify-center text-zinc-500" role="status">
        {status === "offline" ? "Can't reach the server — retrying…" : "Joining the retro…"}
      </main>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <RoomHeader />
      <Board actions={actions} />
    </div>
  );
}
