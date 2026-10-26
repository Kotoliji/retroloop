import { Suspense } from "react";
import { RetroRoom, RoomLoading } from "@/components/room/RetroRoom";

export default function RetroPage() {
  return (
    // The retro id is only known at request time; the shell renders right away
    // and the room streams in.
    <Suspense fallback={<RoomLoading />}>
      <RetroRoom />
    </Suspense>
  );
}
