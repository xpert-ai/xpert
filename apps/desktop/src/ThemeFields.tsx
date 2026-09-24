import { t } from './i18n'
import { useEffect, useId, useState, type ReactNode } from 'react'
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@xpert-ai/shadcn-ui'
import { RotateCcw } from 'lucide-react'
export const fontSizes = [14, 15, 16, 17, 18].map((value) => ({ value, label: `${value} px` }))

export function ThemeSection({
  title,
  description,
  children
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="space-y-4 border-t pt-5 first:border-0 first:pt-0">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  )
}

export function ThemeSelect<T extends string | number>({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  const id = useId()
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={String(value)}
        onValueChange={(next) => {
          const option = options.find((item) => String(item.value) === next)
          if (option) onChange(option.value)
        }}
      >
        <SelectTrigger id={id} className="w-full bg-background">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          {options.map((item) => (
            <SelectItem key={item.value} value={String(item.value)}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function ThemeRange({
  label,
  value,
  min,
  max,
  unit = '',
  onChange
}: {
  label: string
  value: number
  min: number
  max: number
  unit?: string
  onChange: (value: number) => void
}) {
  const id = useId()
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        <output htmlFor={id} className="text-xs tabular-nums text-muted-foreground">
          {value}
          {unit}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        className="h-5 w-full cursor-pointer accent-primary"
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  )
}

export function ColorField({
  label,
  token,
  value,
  fallback,
  onChange
}: {
  label: string
  token?: string
  value?: string
  fallback: string
  onChange: (value: string | undefined) => void
}) {
  const id = useId()
  const [text, setText] = useState(value || '')
  useEffect(() => setText(value || ''), [value])
  const valid = !text || /^#[\da-f]{6}$/i.test(text)
  const swatch = value || (/^#[\da-f]{6}$/i.test(fallback) ? fallback : '#f59e0b')
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {token && <span className="truncate text-[11px] text-muted-foreground">{token}</span>}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={t('{{label}} color picker', { label })}
          value={swatch}
          className="size-9 shrink-0 cursor-pointer rounded-md border bg-background p-1"
          onChange={(event) => {
            setText(event.target.value)
            onChange(event.target.value)
          }}
        />
        <Input
          id={id}
          value={text}
          placeholder={/^#/.test(fallback) ? fallback : t('Automatic')}
          pattern="#[0-9a-fA-F]{6}"
          maxLength={7}
          spellCheck={false}
          aria-invalid={!valid}
          title={t('Enter a six-digit HEX color, e.g. #f59e0b. Leave blank to use the default.')}
          className="min-w-0 font-mono text-xs"
          onChange={(event) => {
            const next = event.target.value
            setText(next)
            if (!next || /^#[\da-f]{6}$/i.test(next)) onChange(next || undefined)
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          aria-label={t('Reset {{label}}', { label })}
          title={t('Reset {{label}}', { label })}
          disabled={!text}
          onClick={() => {
            setText('')
            onChange(undefined)
          }}
        >
          <RotateCcw className="size-3.5" />
        </Button>
      </div>
      {!valid && <p className="text-xs text-destructive">{t('Enter a six-digit HEX color.')}</p>}
    </div>
  )
}

export function FontField({
  label,
  value,
  placeholder,
  onChange
}: {
  label: string
  value: string
  placeholder: string
  onChange: (value: string) => void
}) {
  const id = useId()
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        maxLength={200}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}
