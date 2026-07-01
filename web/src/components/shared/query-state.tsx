import { AlertTriangle } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"

// Shared loading / error / empty fallbacks so every data view degrades
// gracefully and consistently.

function StateCard({ children }: { children: React.ReactNode }) {
  return (
    <Card className="bg-secondary-background text-center font-heading">
      <CardContent className="py-8">{children}</CardContent>
    </Card>
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
      <p className="flex items-center justify-center gap-2 text-bait-red">
        <AlertTriangle className="size-4" /> {message}
      </p>
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
