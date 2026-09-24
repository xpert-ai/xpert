import { t } from './i18n'
import type { AppearanceConfig, ColorMode } from './appearance-types'
import { desktopColors } from './theme'
import { ColorField, FontField, ThemeRange, ThemeSection, ThemeSelect, fontSizes } from './ThemeFields'
import { ThemeIconToggle, densities, paletteModes } from './ThemeIconToggle'

export function ChatKitAppearance({
  value,
  mode,
  onMode,
  onChange
}: {
  value: AppearanceConfig
  mode: ColorMode
  onMode: (mode: ColorMode) => void
  onChange: (value: AppearanceConfig) => void
}) {
  const config = value.chatkit
  const colors = desktopColors(value, mode)
  const update = (patch: Partial<AppearanceConfig['chatkit']>) =>
    onChange({ ...value, chatkit: { ...config, ...patch } })
  return (
    <div className="space-y-5">
      <ThemeSection
        title={t('Layout & typography')}
        description={t('Synced through ChatKit theme options. Supported components depend on your ChatKit version.')}
      >
        <div className="grid grid-cols-2 gap-5">
          <ThemeSelect
            label={t('ChatKit corners')}
            value={config.radius}
            options={[
              { value: 'sharp', label: t('Sharp') },
              { value: 'soft', label: t('Soft') },
              { value: 'round', label: t('Round') },
              { value: 'pill', label: t('Pill') }
            ]}
            onChange={(radius) => update({ radius })}
          />
          <ThemeIconToggle
            label={t('ChatKit density')}
            value={config.density}
            options={densities}
            onChange={(density) => update({ density })}
          />
          <ThemeSelect
            label={t('ChatKit font size')}
            value={config.baseSize}
            options={fontSizes}
            onChange={(baseSize) => {
              if (baseSize === 14 || baseSize === 15 || baseSize === 16 || baseSize === 17 || baseSize === 18)
                update({ baseSize })
            }}
          />
        </div>
        <FontField
          label={t('ChatKit font')}
          value={config.fontFamily}
          placeholder={t('Use desktop font')}
          onChange={(fontFamily) => update({ fontFamily })}
        />
        <FontField
          label={t('Code font')}
          value={config.fontFamilyMono}
          placeholder={t('ChatKit default monospace font')}
          onChange={(fontFamilyMono) => update({ fontFamilyMono })}
        />
      </ThemeSection>
      <ThemeSection
        title={t('Accent color')}
        description={t('Leave blank to use the desktop primary color for the current appearance mode.')}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <ColorField
            label={t('ChatKit accent color')}
            value={config.accentPrimary}
            fallback={colors.primary}
            onChange={(color) => update({ accentPrimary: color || '' })}
          />
          <ThemeSelect
            label={t('Accent intensity')}
            value={config.accentLevel}
            options={[
              { value: 0, label: t('0 · Subtle') },
              { value: 1, label: t('1 · Light') },
              { value: 2, label: t('2 · Standard') },
              { value: 3, label: t('3 · Strong') }
            ]}
            onChange={(accentLevel) => update({ accentLevel })}
          />
        </div>
      </ThemeSection>
      <ThemeSection title={t('Grayscale')} description={t('Adjust the hue, tint and shade of neutral colors.')}>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={config.grayscale !== null}
            onChange={(event) => update({ grayscale: event.target.checked ? { hue: 0, tint: 0, shade: 0 } : null })}
          />
          {t('Custom grayscale')}
        </label>
        {config.grayscale && (
          <div className="grid gap-5 sm:grid-cols-3">
            <ThemeRange
              label={t('Hue')}
              value={config.grayscale.hue}
              min={0}
              max={360}
              unit="°"
              onChange={(hue) => update({ grayscale: { ...config.grayscale!, hue } })}
            />
            <ThemeSelect
              label={t('Tint')}
              value={config.grayscale.tint}
              options={([0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map((value) => ({ value, label: String(value) }))}
              onChange={(tint) => update({ grayscale: { ...config.grayscale!, tint } })}
            />
            <ThemeSelect
              label={t('Shade offset')}
              value={config.grayscale.shade ?? 0}
              options={([-4, -3, -2, -1, 0, 1, 2, 3, 4] as const).map((value) => ({ value, label: String(value) }))}
              onChange={(shade) => update({ grayscale: { ...config.grayscale!, shade } })}
            />
          </div>
        )}
      </ThemeSection>
      <ThemeSection
        title={t('Background & text')}
        description={t('Configure light and dark modes separately. Leave blank for ChatKit defaults.')}
      >
        <ThemeIconToggle label={t('Edit ChatKit palette')} value={mode} options={paletteModes} onChange={onMode} />
        <div className="grid gap-4 sm:grid-cols-2">
          {(['background', 'foreground'] as const).map((key) => (
            <ColorField
              key={key}
              label={key === 'background' ? t('ChatKit background') : t('ChatKit text')}
              token={`surface.${key}`}
              value={config[mode][key]}
              fallback={colors[key]}
              onChange={(color) => {
                const next = { ...config[mode] }
                if (color) next[key] = color
                else delete next[key]
                update({ [mode]: next })
              }}
            />
          ))}
        </div>
      </ThemeSection>
    </div>
  )
}
