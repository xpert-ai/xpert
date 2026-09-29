import { useEffect, useId, useState } from 'react'
import type { AssistantTriggerConfig, AssistantTriggerProvider, TriggerField } from './model'
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
  Button
} from '../../ui'
import { localizedText } from '../../../electron/i18n/index.mjs'
import { invoke } from '../../host'
import { t, useLocale } from '../../i18n'

export function TriggerFields({
  botId,
  provider,
  fields,
  config,
  onChange,
  disabled
}: {
  botId: string
  provider: AssistantTriggerProvider
  fields: [string, TriggerField][]
  config: AssistantTriggerConfig
  onChange: (config: AssistantTriggerConfig) => void
  disabled: boolean
}) {
  return (
    <div className="space-y-5">
      {fields.map(([key, field]) => (
        <Field
          key={key}
          botId={botId}
          provider={provider}
          name={key}
          field={field}
          value={config[key]}
          disabled={disabled}
          onChange={(value) => onChange({ ...config, [key]: value })}
        />
      ))}
    </div>
  )
}

function Field({
  botId,
  provider,
  name,
  field,
  value,
  disabled,
  onChange
}: {
  botId: string
  provider: AssistantTriggerProvider
  name: string
  field: TriggerField
  value: AssistantTriggerConfig[string] | undefined
  disabled: boolean
  onChange: (value: AssistantTriggerConfig[string]) => void
}) {
  const id = useId()
  const locale = useLocale()
  const label = localizedText(field.title, locale) || name
  const description = localizedText(field.description, locale)
  const required = provider.schema.required?.includes(name)
  const remote = !!field['x-ui']?.selectUrl
  const fieldType = 'type' in field ? field.type : undefined
  const [options, setOptions] = useState<{ value: string; label: string; disabled?: boolean }[]>([])
  const [loading, setLoading] = useState(remote)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    if (!remote) return
    let current = true
    setLoading(true)
    setError('')
    invoke('assistantTriggerOptions', { botId, provider: provider.name, field: name })
      .then((items) => {
        if (current) setOptions(items)
      })
      .catch((error: Error) => {
        if (current) setError(error.message)
      })
      .finally(() => {
        if (current) setLoading(false)
      })
    return () => {
      current = false
    }
  }, [botId, provider.name, name, remote, reload, locale])
  const choices = remote
    ? options
    : 'enum' in field && Array.isArray(field.enum)
      ? field.enum.map((entry) => ({
          value: String(entry),
          label: localizedText(field['x-ui']?.enumLabels?.[String(entry)], locale) || String(entry),
          disabled: false
        }))
      : null
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>
          {label}
          {required && (
            <span aria-hidden="true" className="ml-1 text-muted-foreground">
              *
            </span>
          )}
        </Label>
        {fieldType === 'boolean' && (
          <Switch id={id} checked={value === true} disabled={disabled} onCheckedChange={onChange} />
        )}
      </div>
      {fieldType !== 'boolean' &&
        (choices ? (
          <>
            <Select
              value={typeof value === 'string' || typeof value === 'number' ? String(value) : ''}
              onValueChange={(value) =>
                onChange(!remote && (fieldType === 'number' || fieldType === 'integer') ? Number(value) : value)
              }
              disabled={disabled || loading}
              required={required}
            >
              <SelectTrigger id={id} className="w-full">
                <SelectValue placeholder={t(loading ? 'Loading…' : 'Select an account or option')} />
              </SelectTrigger>
              <SelectContent>
                {choices
                  .filter((option) => option.value)
                  .map((option) => (
                    <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
                      {option.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {remote && (
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {!loading && !options.length
                    ? t('No connected accounts. Connect an account in Xpert, then refresh.')
                    : ''}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  disabled={loading || disabled}
                  onClick={() => setReload((n) => n + 1)}
                >
                  {t('Refresh')}
                </Button>
              </div>
            )}
          </>
        ) : field['x-ui']?.component === 'textarea' ? (
          <Textarea
            id={id}
            value={typeof value === 'string' ? value : ''}
            required={required}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
          />
        ) : (
          <Input
            id={id}
            type={fieldType === 'number' || fieldType === 'integer' ? 'number' : 'text'}
            step={fieldType === 'integer' ? 1 : 'any'}
            value={typeof value === 'string' || typeof value === 'number' ? value : ''}
            required={required}
            disabled={disabled}
            maxLength={4000}
            onChange={(event) =>
              onChange(
                fieldType === 'number' || fieldType === 'integer'
                  ? event.target.value === ''
                    ? null
                    : Number(event.target.value)
                  : event.target.value
              )
            }
          />
        ))}
      {description && <p className="text-xs leading-5 text-muted-foreground">{description}</p>}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
