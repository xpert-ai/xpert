import { t } from '../i18n'
import { defaultCharacterConfig } from './custom-character'
import { CharacterThumbnail } from './CharacterThumbnail'
import { VisualChoices } from './VisualChoices'
import { studioPresets, type Character, type CharacterConfig } from './character-options'

export function CharacterSettings({ value, onChange }: { value: Character; onChange: (value: Character) => void }) {
  const config = { ...defaultCharacterConfig, ...value.config }
  const update = (patch: Partial<CharacterConfig>) => onChange({ ...value, config: { ...config, ...patch } })
  return (
    <div className="space-y-5">
      <section className="space-y-4">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('Face')}</h3>
        {(
          [
            ['Eye size', 'eyeSize', 0.6, 1.5, 0.05, '%'],
            ['Eye spacing', 'eyeSpacing', 0.55, 1.6, 0.05, '%'],
            ['Tilt', 'tilt', -15, 15, 1, '°']
          ] as const
        ).map(([label, key, min, max, step, unit]) => (
          <label key={key} className="grid grid-cols-[80px_1fr_44px] items-center gap-2 text-xs">
            <span>{t(label)}</span>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={config[key] ?? 0}
              className="w-full accent-primary"
              onChange={(event) => update({ [key]: Number(event.target.value) })}
            />
            <output className="text-right tabular-nums text-muted-foreground">
              {Math.round((config[key] ?? 0) * (unit === '%' ? 100 : 1))}
              {unit}
            </output>
          </label>
        ))}
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs">{t('Face ink')}</span>
          <VisualChoices
            label="Face ink"
            value={config.ink ?? 'auto'}
            options={
              [
                { id: 'auto', label: 'Auto' },
                { id: 'dark', label: 'Dark' },
                { id: 'light', label: 'Light' }
              ] as const
            }
            onChange={(ink) => update({ ink })}
            showLabels={false}
            className="flex rounded-full bg-muted p-1"
            itemClassName="!rounded-full px-3 py-1.5"
            render={(ink) => (
              <span className="text-xs">{t(ink === 'auto' ? 'Auto' : ink === 'dark' ? 'Dark' : 'Light')}</span>
            )}
          />
        </div>
      </section>
      <section className="space-y-2 border-t pt-4">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('Actual sizes')}</h3>
        <div className="flex items-end gap-6">
          {[40, 24, 16].map((size) => (
            <div key={size} className="flex flex-col items-center gap-1">
              <CharacterThumbnail value={value} size={size} />
              <span className="text-[10px] tabular-nums text-muted-foreground">{size} px</span>
            </div>
          ))}
        </div>
      </section>
      <section className="space-y-2 border-t pt-4">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t('Start from a preset')}
        </h3>
        <div className="grid grid-cols-6 gap-1">
          {studioPresets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              title={preset.label}
              aria-label={t('Apply preset {{name}}', { name: preset.label })}
              className="rounded-lg hover:bg-muted focus-visible:outline-primary"
              onClick={() =>
                onChange({ ...value, color: preset.color, config: { ...defaultCharacterConfig, ...preset.patch } })
              }
            >
              <CharacterThumbnail
                value={{ ...value, color: preset.color, config: { ...defaultCharacterConfig, ...preset.patch } }}
                size={40}
              />
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
