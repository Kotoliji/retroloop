import { ConnectionStatus } from "@/components/ConnectionStatus";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-24">
      <h1 className="text-4xl font-semibold tracking-tight">Retroloop</h1>
      <p className="text-lg text-zinc-600 dark:text-zinc-400">
        Sprint retrospectives where the action items actually get done.
      </p>
      <ConnectionStatus />
    </main>
  );
}
