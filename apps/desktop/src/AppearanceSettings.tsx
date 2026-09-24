import { t } from './i18n'
import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@xpert-ai/shadcn-ui'
import { Bot, Check } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { AppearanceConfig, ColorMode, ColorToken } from './appearance-types'
import { desktopColors } from './theme'
import { ColorField, FontField, ThemeRange, ThemeSection, ThemeSelect, fontSizes } from './ThemeFields'
import { ThemeIconToggle, densities, paletteModes } from './ThemeIconToggle'
import { ChatKitAppearance } from './ChatKitAppearance'

const basicColors: { key: ColorToken; label: string; number?: number }[] = [
  { key: 'primary', label: 'Primary color' },
  { key: 'primary-foreground', label: 'Primary button text' },
  { key: 'background', label: 'Page background' },
  { key: 'foreground', label: 'Primary text' },
  { key: 'muted', label: 'Muted background' },
  { key: 'muted-foreground', label: 'Secondary text' },
  { key: 'border', label: 'Border' },
  { key: 'ring', label: 'Focus ring' }
]
const componentColors: { key: ColorToken; label: string; number?: number }[] = [
  { key: 'card', label: 'Card background' },
  { key: 'card-foreground', label: 'Card text' },
  { key: 'popover', label: 'Popover background' },
  { key: 'popover-foreground', label: 'Popover text' },
  { key: 'secondary', label: 'Secondary button' },
  { key: 'secondary-foreground', label: 'Secondary button text' },
  { key: 'accent', label: 'Hover background' },
  { key: 'accent-foreground', label: 'Hover text' },
  { key: 'input', label: 'Input border' },
  { key: 'destructive', label: 'Destructive action' },
  { key: 'destructive-foreground', label: 'Destructive action text' },
  { key: 'success', label: 'Success' },
  { key: 'warning', label: 'Warning' },
  { key: 'info', label: 'Information' },
  ...(['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5'] as const).map((key, index) => ({
    key,
    label: 'Chart color {{number}}',
    number: index + 1
  }))
]

export function AppearanceSettings({
  value,
  dark,
  onChange
}: {
  value: AppearanceConfig
  dark: boolean
  onChange: (value: AppearanceConfig) => void
}) {
  const [mode, setMode] = useState<ColorMode>(dark ? 'dark' : 'light')
  const desktop = value.desktop
  const colors = desktopColors(value, mode)
  const update = (patch: Partial<AppearanceConfig['desktop']>) =>
    onChange({ ...value, desktop: { ...desktop, ...patch } })
  const colorField = ({ key, label, number }: { key: ColorToken; label: string; number?: number }) => (
    <ColorField
      key={key}
      label={t(label, number ? { number } : {})}
      token={key}
      value={desktop[mode][key]}
      fallback={colors[key]}
      onChange={(color) => {
        const next = { ...desktop[mode] }
        if (color) next[key] = color
        else delete next[key]
        update({ [mode]: next })
      }}
    />
  )
  const sampleStyle: CSSProperties = {
    background: colors.background,
    color: colors.foreground,
    borderColor: colors.border,
    borderRadius: desktop.radius,
    fontFamily: desktop.fontFamily,
    fontSize: desktop.baseSize
  }
  return (
    <Tabs defaultValue="desktop" className="gap-5">
      <TabsList aria-label={t('Theme sections')}>
        <TabsTrigger value="desktop">{t('Desktop')}</TabsTrigger>
        <TabsTrigger value="chatkit">ChatKit</TabsTrigger>
      </TabsList>
      <TabsContent value="desktop" className="space-y-5">
        <ThemeSection title={t('Layout & typography')}>
          <div className="grid grid-cols-2 gap-5">
            <ThemeSelect
              label={t('Desktop font size')}
              value={desktop.baseSize}
              options={fontSizes}
              onChange={(baseSize) => update({ baseSize })}
            />
            <ThemeIconToggle
              label={t('Assistant list density')}
              value={desktop.density}
              options={densities}
              onChange={(density) => update({ density })}
            />
            <ThemeRange
              label={t('Desktop corner radius')}
              value={desktop.radius}
              min={0}
              max={24}
              unit=" px"
              onChange={(radius) => update({ radius })}
            />
          </div>
          <FontField
            label={t('Desktop font')}
            value={desktop.fontFamily}
            placeholder={t('System default font')}
            onChange={(fontFamily) => update({ fontFamily })}
          />
          <p className="text-xs text-muted-foreground">
            {t('Use locally installed fonts. Separate multiple font names with commas.')}
          </p>
        </ThemeSection>
        <ThemeSection
          title={t('Colors')}
          description={t('Light and dark palettes are saved separately. Leave blank for default or automatic colors.')}
        >
          <ThemeIconToggle label={t('Edit palette')} value={mode} options={paletteModes} onChange={setMode} />
          <div
            aria-label={t('Desktop theme preview')}
            className="flex flex-wrap items-center gap-3 border p-4"
            style={sampleStyle}
          >
            <span
              className="flex size-9 items-center justify-center rounded-full"
              style={{ background: colors.accent, color: colors['accent-foreground'] }}
            >
              <Bot className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{t('Your work assistant')}</p>
              <p style={{ color: colors['muted-foreground'], fontSize: '0.8em' }}>
                {t('Turn ideas into action together')}
              </p>
            </div>
            <span
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs"
              style={{
                background: colors.primary,
                color: colors['primary-foreground'],
                borderRadius: Math.max(0, desktop.radius - 2)
              }}
            >
              <Check className="size-3" />
              {t('Preview')}
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">{basicColors.map(colorField)}</div>
          <details className="border-t pt-4">
            <summary className="cursor-pointer text-sm font-medium">{t('More component and status colors')}</summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">{componentColors.map(colorField)}</div>
          </details>
        </ThemeSection>
      </TabsContent>
      <TabsContent value="chatkit">
        <ChatKitAppearance value={value} mode={mode} onMode={setMode} onChange={onChange} />
      </TabsContent>
    </Tabs>
  )
}
