import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

// Neobrutalist code/formula block: a titled window (traffic-light dots) with a
// monospace body that scrolls horizontally on overflow instead of wrapping. Used
// across the algorithm page to render formulas, constants and worked calculations.
export function CodeBlock({
  title,
  children,
  className,
}: {
  title?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("overflow-hidden rounded-base border-2 border-border shadow-shadow", className)}>
      {title && (
        <div className="flex items-center gap-2 border-b-2 border-border bg-main px-3 py-1.5">
          <span className="flex gap-1">
            <span className="size-2.5 rounded-full border border-border bg-bait-red" />
            <span className="size-2.5 rounded-full border border-border bg-bait-yellow" />
            <span className="size-2.5 rounded-full border border-border bg-bait-green" />
          </span>
          <span className="font-heading text-xs uppercase tracking-wide text-main-foreground">{title}</span>
        </div>
      )}
      <pre className="overflow-x-auto bg-secondary-background p-4 text-xs leading-relaxed sm:text-sm">
        <code className="font-mono whitespace-pre text-foreground">{children}</code>
      </pre>
    </div>
  )
}
