import { Shuffle, RotateCcw } from 'lucide-react'
import { t } from '../i18n'
import { customCharacterSvg, defaultCharacterConfig } from './custom-character'
import { useReducedMotion } from './AppearancePreview'
import { ActivityPicker } from './ActivityPicker'
import { ShapeOrbit } from './ShapeOrbit'
import { ColorWheel } from './ColorWheel'
import { CharacterStyleControls } from './CharacterStyleControls'
import { VisualChoices } from './VisualChoices'
import {
  expressionOptions,
  shapeOptions,
  studioColors,
  type Character,
  type CharacterConfig
} from './character-options'

export function CharacterEditor({
  value,
  onChange,
  state,
  onStateChange
}: {
  value: Character
  onChange: (value: Character) => void
  state: string
  onStateChange: (value: string) => void
}) {
  const config = { ...defaultCharacterConfig, ...value.config }
  const reduced = useReducedMotion()
  const update = (patch: Partial<CharacterConfig>) => onChange({ ...value, config: { ...config, ...patch } })
  const expression = expressionOptions.find(
    (item) => item.patch.eyes === config.eyes && item.patch.brows === config.brows
  )?.id
  const surprise = () => {
    const pick = <T,>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)]
    onChange({
      ...value,
      color: pick(studioColors),
      config: {
        ...config,
        shape: pick(shapeOptions).id,
        ...pick(expressionOptions).patch
      }
    })
    onStateChange('idle')
  }
  return (
    <div className="space-y-4">
      <div
        className="relative mx-auto aspect-square w-full max-w-[480px] rounded-full"
        style={{
          backgroundImage: 'radial-gradient(color-mix(in srgb, currentColor 12%, transparent) 1px, transparent 1px)',
          backgroundSize: '20px 20px'
        }}
      >
        <div className="absolute inset-[23%] flex flex-col items-center justify-center">
          <img
            alt={t('Character preview')}
            draggable={false}
            className="size-full object-contain"
            src={customCharacterSvg(value, state, !reduced)}
          />
        </div>
        <VisualChoices
          label="Expression"
          value={expression}
          options={expressionOptions}
          className="absolute inset-0"
          itemClassName="absolute size-[13%] -translate-x-1/2 -translate-y-1/2 !rounded-full !p-0"
          showLabels={false}
          itemStyle={(index) => {
            const angle = ((140 + (index * 260) / (expressionOptions.length - 1)) * Math.PI) / 180
            return { left: `${50 + Math.cos(angle) * 41}%`, top: `${50 + Math.sin(angle) * 41}%` }
          }}
          onChange={(id) => {
            const item = expressionOptions.find((item) => item.id === id)
            if (item) update(item.patch)
            onStateChange('idle')
          }}
          render={(id, animate) => (
            <img
              alt=""
              draggable={false}
              className="size-full"
              src={customCharacterSvg(
                {
                  ...value,
                  config: { ...config, ...expressionOptions.find((item) => item.id === id)?.patch }
                },
                'idle',
                animate
              )}
            />
          )}
        />
        <p className="pointer-events-none absolute inset-x-0 bottom-[12%] text-center text-xs text-muted-foreground">
          {t(expressionOptions.find((item) => item.id === expression)?.label ?? 'Custom expression')}
        </p>
      </div>
      <ShapeOrbit value={config.shape} color={value.color} onChange={(shape) => update({ shape })} />
      <ActivityPicker
        appearance={value}
        preview=""
        value={state}
        onChange={onStateChange}
        layout="strip"
        leading={<ColorWheel value={value.color} onChange={(color) => onChange({ ...value, color })} />}
      />
      <CharacterStyleControls
        value={value}
        onChange={(next) => {
          onChange(next)
          onStateChange('idle')
        }}
      />
      <div className="flex justify-center gap-2">
        <button
          type="button"
          onClick={surprise}
          className="inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm text-background hover:opacity-90"
        >
          <Shuffle className="size-4" />
          {t('Surprise me')}
        </button>
        <button
          type="button"
          onClick={() => {
            onChange({ ...value, config: { ...defaultCharacterConfig } })
            onStateChange('idle')
          }}
          className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm hover:bg-muted"
        >
          <RotateCcw className="size-4" />
          {t('Reset design')}
        </button>
      </div>
    </div>
  )
}
