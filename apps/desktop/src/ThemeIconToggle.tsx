import { t } from './i18n'
import { useId } from 'react'
import { ToggleGroup, ToggleGroupItem } from '@xpert-ai/shadcn-ui'
import { Monitor, Moon, Rows2, Rows3, Rows4, Sun, type LucideIcon } from 'lucide-react'

export const appearanceModes = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon }
] as const

export const paletteModes = [
  { value: 'light', label: 'Light palette', icon: Sun },
  { value: 'dark', label: 'Dark palette', icon: Moon }
] as const

export const densities = [
  { value: 'compact', label: 'Compact', icon: Rows4 },
  { value: 'normal', label: 'Standard', icon: Rows3 },
  { value: 'spacious', label: 'Spacious', icon: Rows2 }
] as const

export function ThemeIconToggle<T extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: T
  options: readonly { value: T; label: string; icon: LucideIcon }[]
  onChange: (value: T) => void
}) {
  const labelId = useId()
  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-3">
        <span id={labelId} className="text-sm leading-none font-medium">
          {label}
        </span>
        <span className="text-xs text-muted-foreground">
          {t(options.find((item) => item.value === value)?.label || '')}
        </span>
      </div>
      <ToggleGroup
        type="single"
        value={value}
        aria-labelledby={labelId}
        spacing={1}
        className="rounded-lg border bg-muted/40 p-1"
        onValueChange={(next) => {
          const option = options.find((item) => item.value === next)
          if (option) onChange(option.value)
        }}
      >
        {options.map(({ value: itemValue, label: itemLabel, icon: Icon }) => (
          <ToggleGroupItem
            key={itemValue}
            value={itemValue}
            aria-label={t(itemLabel)}
            title={t(itemLabel)}
            className="size-8 p-0 text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-accent-foreground data-[state=on]:shadow-sm"
          >
            <Icon className="size-4" aria-hidden="true" />
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}
