import { Info } from "lucide-react"

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

// A small "what does this mean?" info icon with an explanatory tooltip. Used to
// surface metrics like mismatch/betrayal without dumping raw model internals.
export function InfoTip({ label, text }: { label: string; text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          type="button"
          aria-label={`What is ${label}?`}
          className="inline-flex items-center text-foreground/50 transition-colors hover:text-foreground"
        >
          <Info className="size-3.5" />
        </TooltipTrigger>
        <TooltipContent>{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
