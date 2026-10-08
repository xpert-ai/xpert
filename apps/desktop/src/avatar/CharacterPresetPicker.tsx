import type { TAssistantAppearance } from '@xpert-ai/contracts'
import { t } from '../i18n'
import { characterSvg } from './character-presets'
import { defaultCharacterConfig } from './custom-character'
import { studioPresets, type Character, type CharacterConfig } from './character-options'
import { CharacterThumbnail } from './CharacterThumbnail'

export function CharacterPresetPicker({
  value,
  color,
  onSelect
}: {
  value: TAssistantAppearance | undefined
  color: string
  onSelect: (value: Character) => void
}) {
  const bosi: Character = { version: 1, kind: 'character', id: 'bosi', color }
  const choices = [
    { label: 'Bosi', appearance: bosi },
    ...studioPresets.map((preset) => ({
      label: preset.label,
      appearance: {
        version: 1,
        kind: 'character',
        id: 'custom',
        color: preset.color,
        config: { ...defaultCharacterConfig, ...preset.patch }
      } satisfies Character
    }))
  ]
  return (
    <section aria-label={t('Characters')}>
      <h3 className="mb-3 text-sm text-muted-foreground">{t('Characters')}</h3>
      <div className="grid grid-cols-4 gap-2">
        {choices.map(({ label, appearance }) => {
          const selected =
            value?.kind === 'character' &&
            (appearance.config
              ? !!value.config &&
                value.color === appearance.color &&
                Object.entries(appearance.config).every(
                  ([key, expected]) =>
                    ({ ...defaultCharacterConfig, ...value.config })[key as keyof CharacterConfig] === expected
                )
              : !value.config && value.id === appearance.id)
          return (
            <button
              key={label}
              type="button"
              aria-label={label}
              aria-pressed={selected}
              className="flex min-w-0 flex-col items-center rounded-2xl p-1 outline-offset-2 transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring aria-pressed:ring-2 aria-pressed:ring-primary disabled:opacity-50"
              onClick={() => onSelect(appearance)}
            >
              {appearance.config ? (
                <CharacterThumbnail value={appearance} size={64} animate={selected} />
              ) : (
                <img alt="" src={characterSvg(appearance)} className="size-16" />
              )}
              <span className="text-[11px]">{label}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
