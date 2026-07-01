import { Info } from "lucide-react"

import { HintTooltip } from "@/components/shared/hint-tooltip"

// A small "what does this mean?" info icon with an explanatory tooltip. Used to
// surface metrics like mismatch/betrayal without dumping raw model internals.
export function InfoTip({ label, text }: { label: string; text: string }) {
  return (
    <HintTooltip content={text}>
      <button
        type="button"
        aria-label={`What is ${label}?`}
        className="inline-flex items-center text-foreground/50 transition-colors hover:text-foreground"
      >
        <Info className="size-3.5" />
      </button>
    </HintTooltip>
  )
}
