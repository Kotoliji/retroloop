import { Suspense } from "react";
import { RetroRoom } from "@/components/room/RetroRoom";

export default function RetroPage() {
  return (
    // The retro id is only known at request time; the shell renders right away
    // and the room streams in.
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center text-zinc-500" role="status">
          Loading the retro…
        </main>
      }
    >
      <RetroRoom />
    </Suspense>
  );
}
