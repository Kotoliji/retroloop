"use client";

import { estimateClockOffset } from "@retro/shared";
import { useEffect, useState } from "react";
import { createSocket } from "@/lib/socket";

type Status =
  | { state: "connecting" }
  | { state: "offline" }
  | { state: "online"; roundTrip: number; offset: number };

export function ConnectionStatus() {
  const [status, setStatus] = useState<Status>({ state: "connecting" });

  useEffect(() => {
    const socket = createSocket();

    async function measure() {
      const sentAt = Date.now();
      try {
        const { serverTime } = await socket.timeout(3000).emitWithAck("client:ping");
        setStatus({ state: "online", ...estimateClockOffset(sentAt, Date.now(), serverTime) });
      } catch {
        // a lost ack is reported by the disconnect handler
      }
    }

    socket.on("server:hello", measure);
    socket.on("disconnect", () => setStatus({ state: "offline" }));
    socket.on("connect_error", () => setStatus({ state: "offline" }));
    const timer = setInterval(() => socket.connected && measure(), 5000);

    return () => {
      clearInterval(timer);
      socket.disconnect();
    };
  }, []);

  const dot = {
    connecting: "bg-amber-400",
    offline: "bg-red-500",
    online: "bg-emerald-500",
  }[status.state];

  return (
    <p role="status" className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
      <span className={`size-2.5 rounded-full ${dot}`} aria-hidden />
      {status.state === "online"
        ? `Realtime server online · ${status.roundTrip} ms round trip · clock offset ${Math.round(status.offset)} ms`
        : status.state === "offline"
          ? "Realtime server unreachable — retrying…"
          : "Connecting to realtime server…"}
    </p>
  );
}
