// Shared loading / error / empty fallbacks so every data view degrades
// gracefully and consistently.

function StateCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-base border-2 border-border bg-secondary-background p-8 text-center font-heading shadow-shadow">
      {children}
    </div>
  )
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <StateCard>
      <span className="animate-pulse uppercase tracking-widest text-foreground/60">{label}</span>
    </StateCard>
  )
}

export function ErrorState({ message }: { message: string }) {
  return (
    <StateCard>
      <p className="text-bait-red">⚠ {message}</p>
    </StateCard>
  )
}

export function EmptyState({ message }: { message: string }) {
  return (
    <StateCard>
      <p className="uppercase tracking-wide text-foreground/55">{message}</p>
    </StateCard>
  )
}
