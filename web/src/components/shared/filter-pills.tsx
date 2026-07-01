import { Button } from "@/components/ui/button"
import { InfoTip } from "@/components/shared/info-tip"
import type { FilterOption } from "@/constants/filters"

// A small neobrutalist toggle-pill group used for sort + filter controls. Single
// active value; generic over the value type so it works for sort keys,
// sentiment filters, likelihood filters, etc. Built on the registry Button —
// active uses the filled `default` variant, inactive the `neutral` one. An
// optional `hint` adds an info tooltip next to the label to explain the filter.

export function FilterPills<T extends string>({
  options,
  value,
  onChange,
  label,
  hint,
}: {
  options: ReadonlyArray<FilterOption<T>>
  value: T
  onChange: (value: T) => void
  label?: string
  hint?: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {label && (
        <span className="flex items-center gap-1 text-xs font-heading uppercase tracking-wide text-foreground/55">
          {label}
          {hint && <InfoTip label={label} text={hint} />}
        </span>
      )}
      {options.map((o) => (
        <Button
          key={o.value}
          type="button"
          size="sm"
          variant={value === o.value ? "default" : "neutral"}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className="h-auto px-3 py-1 text-xs font-heading uppercase tracking-wide"
        >
          {o.label}
        </Button>
      ))}
    </div>
  )
}
