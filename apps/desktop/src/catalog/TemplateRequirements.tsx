import { Label, Switch } from '@xpert-ai/shadcn-ui'
import type { TemplatePreflight, VoiceSelection } from '../catalog-types'
import { t } from '../i18n'
import { ModelSelect } from './ModelSelect'

export function TemplateRequirements({
  preflight,
  capabilities,
  onCapabilities,
  model,
  onModel,
  realtimeVoice,
  onRealtimeVoice,
  disabled
}: {
  preflight: TemplatePreflight | null
  capabilities: string[]
  onCapabilities: (capabilities: string[]) => void
  model: string
  onModel: (model: string) => void
  realtimeVoice?: VoiceSelection
  onRealtimeVoice?: (selection: VoiceSelection) => void
  disabled: boolean
}) {
  if (!preflight) return null
  return (
    <div className="space-y-5">
      {preflight.optionalCapabilities.map((option) => (
        <div key={option.key} className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <Label htmlFor={`template-${option.key}`}>{option.label}</Label>
            <p className="text-sm leading-6 text-muted-foreground">{option.description}</p>
          </div>
          <Switch
            id={`template-${option.key}`}
            disabled={disabled}
            checked={capabilities.includes(option.key)}
            onCheckedChange={(enabled) =>
              onCapabilities(enabled ? [...capabilities, option.key] : capabilities.filter((key) => key !== option.key))
            }
          />
        </div>
      ))}
      {preflight.requiresModel && preflight.models.length > 0 && (
        <ModelSelect
          id="template-model"
          label={t('Assistant model')}
          options={preflight.models}
          value={model}
          onChange={onModel}
          disabled={disabled}
        />
      )}
      {capabilities.includes('realtime-voice') && preflight.realtimeModels && onRealtimeVoice && (
        <div className="space-y-4 border-t pt-4">
          <ModelSelect
            id="realtime-model"
            label={t('Voice model')}
            options={preflight.realtimeModels}
            value={realtimeVoice?.modelId ?? ''}
            disabled={disabled}
            onChange={(id) =>
              onRealtimeVoice({
                modelId: id,
                voice: preflight.realtimeModels?.find((entry) => entry.id === id)?.defaultVoice ?? ''
              })
            }
          />
          {!!realtimeVoice?.modelId && (
            <ModelSelect
              id="realtime-voice"
              label={t('Voice')}
              options={preflight.realtimeModels.find((entry) => entry.id === realtimeVoice.modelId)?.voices ?? []}
              value={realtimeVoice.voice}
              disabled={disabled}
              onChange={(voice) => onRealtimeVoice({ ...realtimeVoice, voice })}
            />
          )}
        </div>
      )}
      {!preflight.canInstall && (
        <p role="status" className="rounded-lg bg-muted p-4 text-sm">
          {preflight.reason}
        </p>
      )}
    </div>
  )
}
