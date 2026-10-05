import { t } from '../i18n'
import { defaultCharacterConfig } from './custom-character'
import { CharacterThumbnail } from './CharacterThumbnail'
import { VisualChoices } from './VisualChoices'
import { browOptions, mouthOptions, motionOptions, type Character, type CharacterConfig } from './character-options'

export function CharacterStyleControls({
  value,
  onChange
}: {
  value: Character
  onChange: (value: Character) => void
}) {
  const config = { ...defaultCharacterConfig, ...value.config }
  const update = (patch: Partial<CharacterConfig>) => onChange({ ...value, config: { ...config, ...patch } })
  return (
    <section aria-label={t('Character details')} className="space-y-4 border-t pt-4">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="min-w-0 space-y-1">
          <h3 className="text-xs text-muted-foreground">{t('Eyebrows')}</h3>
          <VisualChoices
            label="Eyebrows"
            value={config.brows ?? 'none'}
            options={browOptions}
            onChange={(brows) => update({ brows })}
            className="grid grid-cols-5 gap-1"
            showLabels={false}
            render={(brows, animate) => (
              <CharacterThumbnail value={value} patch={{ brows }} animate={animate} size={36} />
            )}
          />
        </div>
        <div className="min-w-0 space-y-1">
          <h3 className="text-xs text-muted-foreground">{t('Mouth')}</h3>
          <VisualChoices
            label="Mouth"
            value={config.mouth}
            options={mouthOptions}
            onChange={(mouth) => update({ mouth })}
            className="grid grid-cols-5 gap-1"
            showLabels={false}
            render={(mouth, animate) => (
              <CharacterThumbnail value={value} patch={{ mouth }} animate={animate} size={36} />
            )}
          />
        </div>
      </div>
      <div className="grid items-center gap-5 sm:grid-cols-[1.2fr_1fr]">
        <div className="min-w-0 space-y-1">
          <h3 className="text-xs text-muted-foreground">{t('Motion')}</h3>
          <VisualChoices
            label="Motion"
            value={config.motion}
            options={motionOptions}
            onChange={(motion) => update({ motion })}
            className="grid grid-cols-4 gap-1"
            render={(motion) => <CharacterThumbnail value={value} patch={{ motion }} animate size={36} />}
          />
        </div>
        <div className="space-y-4">
          <label className="grid grid-cols-[auto_1fr_32px] items-center gap-2 text-xs">
            <span>{t('Speed')}</span>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={config.speed ?? 1}
              className="min-w-0 w-full accent-primary"
              onChange={(event) => update({ speed: Number(event.target.value) })}
            />
            <output className="text-right tabular-nums text-muted-foreground">{(config.speed ?? 1).toFixed(1)}×</output>
          </label>
          <label className="flex items-center justify-between text-xs">
            {t('Blink naturally')}
            <input
              type="checkbox"
              checked={config.blink !== false}
              className="size-4 accent-primary"
              onChange={(event) => update({ blink: event.target.checked })}
            />
          </label>
        </div>
      </div>
    </section>
  )
}
