import { ConnectionStatus } from "@/components/ConnectionStatus";
import { CreateRetroForm } from "@/components/CreateRetroForm";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-8 px-6 py-24">
      <div className="flex flex-col gap-4">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Retroloop</h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          Sprint retrospectives where the action items actually get done. Start a board, share the
          link, and your team joins without signing up.
        </p>
      </div>
      <CreateRetroForm />
      <ConnectionStatus />
    </main>
  );
}
