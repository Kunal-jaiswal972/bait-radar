import { type ReactNode } from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

// Thin wrapper over the registry Tooltip that:
//  - portals the content, so it isn't clipped by overflow-hidden cards and
//    doesn't inherit the trigger's text styles (uppercase / tracking / size);
//  - constrains it to a small, wrapping box.
// The fix lives here (not in ui/tooltip.tsx) so the registry component can be
// re-added via the neobrutalism CLI without losing it. Relies on the app-root
// TooltipProvider (see main.tsx).
export function HintTooltip({
  children,
  content,
  className,
}: {
  children: ReactNode
  content: ReactNode
  className?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipPrimitive.Portal>
        <TooltipContent
          className={cn(
            "max-w-[12rem] whitespace-normal break-words text-pretty normal-case text-xs leading-snug",
            className,
          )}
        >
          {content}
        </TooltipContent>
      </TooltipPrimitive.Portal>
    </Tooltip>
  )
}
