import { useId, type ReactNode } from 'react'
import { Button } from '@xpert-ai/shadcn-ui'
import { ChevronRight } from 'lucide-react'
import { t, languages } from '../i18n'
import { ThemeSelect, fontSizes } from '../ThemeFields'
import { defaultAppearance } from '../appearance-types'
import type { ConnectionConfig } from '../types'

function SettingsRow({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-4 border-t p-5 first:border-0 xl:flex-row xl:items-center xl:justify-between xl:gap-8">
      <div className="min-w-0">
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="mt-1 text-[0.8125rem] leading-5 text-muted-foreground">{description}</p>
      </div>
      <div className="w-fit max-w-full shrink-0">{children}</div>
    </div>
  )
}

function SettingsChoice<T extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  const name = useId()
  return (
    <fieldset className="flex h-10 max-w-full rounded-lg border p-1">
      <legend className="sr-only">{label}</legend>
      {options.map((option) => (
        <label key={option.value} className="relative min-w-0 flex-1 cursor-pointer">
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="peer sr-only"
          />
          <span className="flex h-full items-center justify-center whitespace-nowrap rounded-md px-3 text-sm peer-checked:bg-accent peer-checked:font-medium peer-checked:text-accent-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-disabled:cursor-not-allowed peer-disabled:opacity-50">
            {option.label}
          </span>
        </label>
      ))}
    </fieldset>
  )
}

export function GeneralSettings({
  draft,
  onChange,
  onAppearance
}: {
  draft: ConnectionConfig
  onChange: (config: ConnectionConfig) => void
  onAppearance: () => void
}) {
  const appearance = draft.appearance ?? defaultAppearance()
  return (
    <div className="space-y-8">
      <section aria-labelledby="settings-language-heading">
        <h2 id="settings-language-heading" className="mb-4 text-base font-semibold">
          {t('Language')}
        </h2>
        <div className="overflow-hidden rounded-xl border">
          <SettingsRow
            title={t('Interface language')}
            description={t('After sign-in, your account language takes priority.')}
          >
            <div className="w-48">
              <ThemeSelect
                hideLabel
                label={t('Interface language')}
                value={draft.locale}
                options={languages}
                onChange={(locale) => onChange({ ...draft, locale })}
              />
            </div>
          </SettingsRow>
          <p className="mx-5 border-t py-4 text-[0.8125rem] leading-5 text-muted-foreground">
            {t('On first launch, the language follows your system preferences.')}
          </p>
        </div>
      </section>
      <section aria-labelledby="settings-display-heading">
        <h2 id="settings-display-heading" className="mb-4 text-base font-semibold">
          {t('Everyday display')}
        </h2>
        <div className="overflow-hidden rounded-xl border">
          <SettingsRow title={t('Desktop font size')} description={t('Adjust the size of desktop text.')}>
            <div className="w-48">
              <ThemeSelect
                hideLabel
                label={t('Desktop font size')}
                value={appearance.desktop.baseSize}
                options={fontSizes}
                onChange={(baseSize) =>
                  onChange({ ...draft, appearance: { ...appearance, desktop: { ...appearance.desktop, baseSize } } })
                }
              />
            </div>
          </SettingsRow>
          <SettingsRow
            title={t('Assistant list density')}
            description={t('Set the spacing between assistants in the sidebar.')}
          >
            <SettingsChoice
              label={t('Assistant list density')}
              value={appearance.desktop.density}
              options={[
                { value: 'normal', label: t('Comfortable') },
                { value: 'compact', label: t('Compact') },
                { value: 'spacious', label: t('Spacious') }
              ]}
              onChange={(density) =>
                onChange({ ...draft, appearance: { ...appearance, desktop: { ...appearance.desktop, density } } })
              }
            />
          </SettingsRow>
          <div className="border-t p-2">
            <Button
              type="button"
              variant="ghost"
              className="h-10 w-full justify-start gap-3 px-3 text-sm"
              onClick={onAppearance}
            >
              <ChevronRight className="size-4" />
              {t('More appearance settings')}
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
