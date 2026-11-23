import { useEffect, useMemo, useState } from 'react'
import { Label, Textarea } from '@xpert-ai/shadcn-ui'
import type { AnalyticsBinding, AnalyticsSourceRef } from '@xpert-ai/contracts'
import type {
  OrganizationSettings,
  OrganizationSettingsForm,
  OrganizationSetupField,
  OrganizationSettingsTarget
} from '../catalog-types'
import { invoke } from '../host'
import { t } from '../i18n'

function sourceKey(source?: AnalyticsSourceRef) {
  return source?.kind === 'definition' ? JSON.stringify([source.definitionId, source.versionId]) : ''
}

function parseQuery(
  text: string,
  field: Extract<OrganizationSetupField, { kind: 'analytics' }>,
  source: AnalyticsSourceRef
): AnalyticsBinding | null {
  try {
    const parsed: Partial<AnalyticsBinding> | null = JSON.parse(text)
    if (
      !parsed ||
      typeof parsed.id !== 'string' ||
      !parsed.id ||
      typeof parsed.operation !== 'string' ||
      !parsed.operation ||
      typeof parsed.contractVersion !== 'number' ||
      !Number.isInteger(parsed.contractVersion) ||
      parsed.contractVersion < 1 ||
      parsed.payload === undefined ||
      !Array.isArray(parsed.parameters) ||
      !Array.isArray(parsed.output?.fields) ||
      !parsed.output.fields.length ||
      !field.requiredNumericFields.every((id) =>
        parsed.output!.fields.some((f) => f?.id === id && ['int64', 'float64', 'decimal'].includes(f.logicalType))
      )
    )
      return null
    return {
      id: parsed.id,
      operation: parsed.operation,
      contractVersion: parsed.contractVersion,
      parameters: parsed.parameters,
      payload: parsed.payload,
      output: parsed.output,
      providerId: field.providerId,
      source
    }
  } catch {
    return null
  }
}

export function OrganizationSettingsEditor({
  organizationId,
  pluginName,
  appName,
  fields,
  disabled,
  onChange
}: Omit<OrganizationSettingsTarget, 'installationScope'> & {
  fields: OrganizationSetupField[]
  disabled: boolean
  onChange: (value: OrganizationSettings | null) => void
}) {
  const [form, setForm] = useState<OrganizationSettingsForm | null>(null)
  const [members, setMembers] = useState<OrganizationSettings['members']>({})
  const [sourceIds, setSourceIds] = useState<Record<string, string>>({})
  const [texts, setTexts] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setForm(null)
    setError('')
    invoke('applicationOrganizationSettings', {
      organizationId,
      pluginName,
      appName,
      installationScope: 'organization'
    })
      .then((result) => {
        if (!active) return
        const known = new Set(result.users.map((u) => u.id))
        setMembers(
          Object.fromEntries(
            Object.entries(result.settings.members).map(([k, ids]) => [k, ids.filter((id) => known.has(id))])
          )
        )
        const queries = Object.entries(result.settings.queries)
        setSourceIds(Object.fromEntries(queries.map(([k, b]) => [k, sourceKey(b.source)])))
        setTexts(Object.fromEntries(queries.map(([k, b]) => [k, JSON.stringify(b, null, 2)])))
        setForm(result)
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : t('Could not load installation settings.'))
      })
    return () => {
      active = false
    }
  }, [organizationId, pluginName, appName])

  const { settings, invalid } = useMemo(() => {
    const invalid = new Set<string>()
    if (!form) return { settings: null, invalid }
    const result: OrganizationSettings = { revision: form.settings.revision, members: {}, queries: {} }
    let complete = true
    for (const f of fields) {
      if (f.kind === 'members') {
        result.members[f.key] = members[f.key] ?? []
        if (!f.optional && !result.members[f.key].length) complete = false
      } else {
        const source = form.sources.find(
          (s) =>
            s.source.kind === 'definition' &&
            sourceKey(s.source) === sourceIds[f.key] &&
            s.providers.some((p) => p.id === f.providerId)
        )
        const text = texts[f.key]?.trim()
        const binding = source && text ? parseQuery(text, f, source.source) : null
        if (binding) result.queries[f.key] = binding
        else {
          complete = false
          if (source && text) invalid.add(f.key)
        }
      }
    }
    return { settings: complete ? result : null, invalid }
  }, [form, fields, sourceIds, texts, members])
  useEffect(() => {
    onChange(settings)
  }, [onChange, settings])
  return (
    <section className="space-y-4 border-t pt-5" aria-label={t('Organization settings')}>
      <h3 className="font-medium">{t('Organization settings')}</h3>
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : !form ? (
        <p role="status">{t('Checking installation settings…')}</p>
      ) : (
        fields.map((f) => {
          const id = 'organization-field-' + f.key
          if (f.kind === 'members') {
            const selected = members[f.key] ?? []
            const names = form.users.filter((u) => selected.includes(u.id)).map((u) => u.label)
            return (
              <fieldset key={f.key} disabled={disabled} className="space-y-2">
                <legend className="text-sm font-medium">{f.label}</legend>
                {form.users.length ? (
                  <details className="rounded-md border">
                    <summary className="min-h-10 cursor-pointer px-3 py-2 text-sm">
                      {names.join(', ') || t('Select organization members')}
                    </summary>
                    <div className="max-h-48 space-y-1 overflow-y-auto border-t px-3 py-2">
                      {form.users.map((u) => (
                        <label key={u.id} className="flex cursor-pointer items-center gap-2 py-1 text-sm">
                          <input
                            type="checkbox"
                            checked={selected.includes(u.id)}
                            disabled={disabled}
                            onChange={(event) => {
                              const checked = event.currentTarget.checked
                              setMembers((prev) => ({
                                ...prev,
                                [f.key]: checked ? [...selected, u.id] : selected.filter((id) => id !== u.id)
                              }))
                            }}
                          />
                          <span>{u.label}</span>
                        </label>
                      ))}
                    </div>
                  </details>
                ) : (
                  <p className="text-sm text-muted-foreground">{t('No active organization members are available.')}</p>
                )}
              </fieldset>
            )
          }
          const sources = form.sources.filter(
            (s) => s.source.kind === 'definition' && s.providers.some((p) => p.id === f.providerId)
          )
          return (
            <fieldset key={f.key} disabled={disabled} className="space-y-2">
              <Label htmlFor={id}>{f.label}</Label>
              <select
                id={id}
                value={sources.some((s) => sourceKey(s.source) === sourceIds[f.key]) ? sourceIds[f.key] : ''}
                onChange={(e) => setSourceIds({ ...sourceIds, [f.key]: e.target.value })}
                className="min-h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">{t('Select an authorized data source')}</option>
                {sources.map((s) => (
                  <option key={sourceKey(s.source)} value={sourceKey(s.source)}>
                    {s.name}
                  </option>
                ))}
              </select>
              {!sources.length && (
                <p className="text-sm text-muted-foreground">
                  {t('Publish an analytics definition shared with this organization, then refresh settings.')}
                </p>
              )}
              <Label htmlFor={id + '-query'}>{t('Read-only query (AnalyticsBinding JSON)')}</Label>
              {!!f.requiredNumericFields.length && (
                <p className="text-sm text-muted-foreground">
                  {t('Required numeric fields: {{fields}}', { fields: f.requiredNumericFields.join(', ') })}
                </p>
              )}
              <Textarea
                id={id + '-query'}
                value={texts[f.key] ?? ''}
                onChange={(e) => setTexts({ ...texts, [f.key]: e.target.value })}
                rows={4}
                spellCheck={false}
                aria-invalid={invalid.has(f.key)}
                className="font-mono"
              />
              {invalid.has(f.key) && (
                <p role="alert" className="text-sm text-destructive">
                  {t('Check the query JSON and its output fields.')}
                </p>
              )}
            </fieldset>
          )
        })
      )}
    </section>
  )
}
