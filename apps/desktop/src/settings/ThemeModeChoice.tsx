import { useId, type CSSProperties } from 'react'
import { Bot } from 'lucide-react'
import type { AppearanceConfig, ColorMode } from '../appearance-types'
import type { ConnectionConfig } from '../types'
import { desktopColors } from '../theme'
import { t } from '../i18n'

const modes: { value: ConnectionConfig['theme']; label: string }[] = [
  { value: 'system', label: 'Follow system' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' }
]

function ThemeSkeleton({ appearance, mode }: { appearance: AppearanceConfig; mode: ColorMode }) {
  const colors = desktopColors(appearance, mode)
  const style: CSSProperties & { [key: `--preview-${string}`]: string } = {
    '--preview-background': colors.background,
    '--preview-muted': colors.muted,
    '--preview-border': colors.border,
    '--preview-text': colors['muted-foreground'],
    '--preview-primary': colors.primary
  }
  return (
    <span className="absolute inset-0 block bg-[var(--preview-muted)] p-1.5" style={style}>
      <span className="flex h-full overflow-hidden rounded-md border border-[var(--preview-border)] bg-[var(--preview-background)] shadow-sm">
        <span className="flex w-4 shrink-0 justify-center border-r border-[var(--preview-border)] bg-[var(--preview-muted)] pt-1">
          <Bot className="size-2 text-[var(--preview-text)]" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5 px-1 py-1">
          <span className="ml-auto h-0.5 w-3/4 rounded-full bg-[var(--preview-primary)]" />
          <span className="mt-0.5 h-0.5 w-3/4 rounded-full bg-[var(--preview-text)]/30" />
          <span className="h-0.5 w-1/2 rounded-full bg-[var(--preview-text)]/30" />
          <span className="h-0.5 w-full rounded-full bg-[var(--preview-text)]/30" />
          <span className="ml-auto h-0.5 w-2/3 rounded-full bg-[var(--preview-primary)]" />
          <span className="ml-auto h-0.5 w-1/2 rounded-full bg-[var(--preview-primary)]" />
          <span className="mt-auto flex h-2 shrink-0 items-center justify-end rounded-full border border-[var(--preview-border)] px-0.5">
            <span className="size-1 rounded-full bg-[var(--preview-primary)]" />
          </span>
        </span>
      </span>
    </span>
  )
}

export function ThemeModeChoice({
  value,
  appearance,
  onChange
}: {
  value: ConnectionConfig['theme']
  appearance: AppearanceConfig
  onChange: (theme: ConnectionConfig['theme']) => void
}) {
  const name = useId()
  return (
    <section aria-labelledby={`${name}-heading`}>
      <h3 id={`${name}-heading`} className="mb-4 text-base font-semibold">
        {t('Visual style')}
      </h3>
      <fieldset className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-4">
        <legend className="sr-only">{t('Appearance mode')}</legend>
        <span className="text-sm font-medium" aria-hidden="true">
          {t('Mode')}
        </span>
        <div className="grid max-w-full grid-cols-3 gap-3">
          {modes.map((mode) => (
            <label key={mode.value} className="min-w-0 cursor-pointer" title={t(mode.label)}>
              <input
                type="radio"
                name={name}
                value={mode.value}
                checked={value === mode.value}
                onChange={() => onChange(mode.value)}
                className="peer sr-only"
              />
              <span className="sr-only">{t(mode.label)}</span>
              <span
                aria-hidden="true"
                className="relative block aspect-4/3 w-24 max-w-full overflow-hidden rounded-xl border-2 border-border transition-shadow hover:ring-2 hover:ring-border peer-checked:border-primary peer-checked:ring-1 peer-checked:ring-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ring peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
              >
                <ThemeSkeleton appearance={appearance} mode={mode.value === 'system' ? 'light' : mode.value} />
                {mode.value === 'system' && (
                  <span className="absolute inset-0 [clip-path:inset(0_0_0_50%)]">
                    <ThemeSkeleton appearance={appearance} mode="dark" />
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </section>
  )
}
