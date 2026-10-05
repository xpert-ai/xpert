import type { ReactNode } from 'react'
import type { TAssistantAppearance } from '@xpert-ai/contracts'
import { t } from '../i18n'
import { AppearancePreview } from './AppearancePreview'
import { activityOptions } from './character-options'
import { VisualChoices } from './VisualChoices'

export function ActivityPicker({
  appearance,
  preview,
  petSource,
  value,
  onChange,
  layout = 'grid',
  leading
}: {
  appearance?: TAssistantAppearance
  preview: string
  petSource?: string
  value: string
  onChange: (state: string) => void
  layout?: 'grid' | 'strip'
  leading?: ReactNode
}) {
  const options =
    appearance?.kind === 'character' && appearance.config
      ? activityOptions
      : activityOptions.filter((item) => !['listening', 'sleeping'].includes(item.id))
  return (
    <div className="space-y-2">
      <p className={layout === 'strip' ? 'sr-only' : 'text-xs text-muted-foreground'}>{t('Preview activity')}</p>
      <div
        className={
          layout === 'strip' ? 'flex items-center gap-2 rounded-[28px] border bg-background p-2 shadow-sm' : ''
        }
      >
        {leading}
        <div className="min-w-0 flex-1 overflow-x-auto p-0.5 [scrollbar-width:thin]">
          <VisualChoices
            label="Preview activity"
            value={value}
            options={options}
            onChange={onChange}
            className={
              layout === 'strip'
                ? 'flex min-w-max gap-0.5 rounded-[22px] bg-muted/70 p-1'
                : 'grid grid-cols-4 gap-1 rounded-2xl bg-muted/60 p-1'
            }
            itemClassName={
              layout === 'strip'
                ? 'min-w-[54px] flex-1 !rounded-[18px] !border-0 px-1 py-1.5 aria-checked:!ring-0 aria-checked:shadow-md'
                : ''
            }
            render={(state, animate) => (
              <div className="size-10">
                <AppearancePreview
                  appearance={appearance}
                  preview={preview}
                  petSource={petSource}
                  state={state}
                  name=""
                  size={40}
                  animate={animate}
                />
              </div>
            )}
          />
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {t('In conversations, expressions follow the actual activity.')}
      </p>
    </div>
  )
}
