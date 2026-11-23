import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea
} from '@xpert-ai/shadcn-ui'
import { OrganizationModelEditor } from './OrganizationModelEditor'
import { ExternalLink, X } from 'lucide-react'
import type { AnalyticsBinding, AnalyticsSourceRef } from '@xpert-ai/contracts'
import type {
  OrganizationSettings,
  OrganizationSettingsForm,
  OrganizationSetupField,
  OrganizationSettingsTarget
} from '../catalog-types'
import { invoke, openAnalyticsDefinitions } from '../host'
import { t } from '../i18n'

function sourceKey(source?: AnalyticsSourceRef) {
  return source?.kind === 'definition' ? JSON.stringify([source.definitionId, source.versionId]) : ''
}

function hasNumericFields(output: AnalyticsBinding['output'], required: string[]) {
  return required.every((id) =>
    output.fields.some((f) => f?.id === id && ['int64', 'float64', 'decimal'].includes(f.logicalType))
  )
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
      !hasNumericFields(parsed.output, field.requiredNumericFields)
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
  webUrl,
  disabled,
  onChange
}: Omit<OrganizationSettingsTarget, 'installationScope'> & {
  fields: OrganizationSetupField[]
  webUrl: string
  disabled: boolean
  onChange: (value: OrganizationSettings | null) => void
}) {
  const [form, setForm] = useState<OrganizationSettingsForm | null>(null)
  const [members, setMembers] = useState<OrganizationSettings['members']>({})
  const [sourceIds, setSourceIds] = useState<Record<string, string>>({})
  const [confirmed, setConfirmed] = useState<OrganizationSettings['queries'] | null>(null)
  const [editingModel, setEditingModel] = useState(false)
  const [texts, setTexts] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setForm(null)
    setConfirmed(null)
    setEditingModel(false)
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

  const sourcesByProvider = useMemo(() => {
    const byProvider = new Map<string, OrganizationSettingsForm['sources']>()
    for (const source of form?.sources ?? []) {
      if (source.source.kind !== 'definition') continue
      for (const provider of source.providers) {
        const sources = byProvider.get(provider.id)
        if (sources) sources.push(source)
        else byProvider.set(provider.id, [source])
      }
    }
    return byProvider
  }, [form])
  const savedQueries = useMemo(() => {
    if (!form?.settings.revision || form.modelSetup?.kind !== 'connection-model') return null
    const analytics = fields.filter((f) => f.kind === 'analytics')
    const valid =
      analytics.length > 0 &&
      analytics.every((f) => {
        const saved = form.settings.queries[f.key]
        return (
          saved?.providerId === f.providerId &&
          hasNumericFields(saved.output, f.requiredNumericFields) &&
          sourcesByProvider.get(f.providerId)?.some((s) => sourceKey(s.source) === sourceKey(saved.source))
        )
      })
    return valid ? form.settings.queries : null
  }, [fields, form, sourcesByProvider])
  const modelQueries = editingModel ? confirmed : (savedQueries ?? confirmed)
  const { settings, invalid } = useMemo(() => {
    const invalid = new Set<string>()
    if (!form) return { settings: null, invalid }
    const result: OrganizationSettings = { revision: form.settings.revision, members: {}, queries: {} }
    let complete = true
    for (const f of fields) {
      if (f.kind === 'members') {
        result.members[f.key] = members[f.key] ?? []
        if (!f.optional && !result.members[f.key].length) complete = false
      } else if (form.modelSetup?.kind === 'connection-model') {
        if (modelQueries?.[f.key]) result.queries[f.key] = modelQueries[f.key]
        else complete = false
      } else {
        const source = sourcesByProvider.get(f.providerId)?.find((s) => sourceKey(s.source) === sourceIds[f.key])
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
  }, [form, fields, sourceIds, texts, members, sourcesByProvider, modelQueries])
  useEffect(() => {
    onChange(settings)
  }, [onChange, settings])
  return (
    <section className="space-y-4 border-t pt-5" aria-label={t('Organization settings')}>
      <h3 className="font-medium">{t('Organization settings')}</h3>
      {savedQueries && (
        <div className="space-y-2">
          {!editingModel && <p className="text-sm">{t('Using saved model queries.')}</p>}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => {
              setConfirmed(null)
              setEditingModel(!editingModel)
            }}
          >
            {editingModel ? t('Keep saved queries') : t('Change model')}
          </Button>
        </div>
      )}
      {form?.modelSetup?.kind === 'connection-model' && (!savedQueries || editingModel) && (
        <OrganizationModelEditor
          target={{ organizationId, pluginName, appName, installationScope: 'organization' }}
          fields={fields}
          bootstrap={form.modelSetup.bootstrap}
          users={form.users}
          revision={form.settings.revision}
          disabled={disabled}
          onConfirmed={setConfirmed}
        />
      )}
      {form &&
        !form.modelSetup &&
        fields.some((field) => field.kind === 'analytics' && !sourcesByProvider.has(field.providerId)) && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {t(
                'This server and application currently offer published definitions only. Connection and model setup is unavailable.'
              )}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => void openAnalyticsDefinitions(webUrl)}>
              <ExternalLink aria-hidden="true" />
              {t('Open analytics definitions')}
            </Button>
          </div>
        )}
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
            const available = form.users.filter((user) => !selected.includes(user.id))
            return (
              <fieldset key={f.key} disabled={disabled} className="space-y-2">
                <Label htmlFor={id}>{f.label}</Label>
                <Select
                  value=""
                  disabled={disabled || !available.length}
                  onValueChange={(userId) => {
                    if (available.some((user) => user.id === userId))
                      setMembers({ ...members, [f.key]: [...selected, userId] })
                  }}
                >
                  <SelectTrigger id={id} className="w-full">
                    <SelectValue placeholder={t('Select organization members')} />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {available.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selected.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {form.users
                      .filter((user) => selected.includes(user.id))
                      .map((user) => (
                        <Button
                          key={user.id}
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={disabled}
                          aria-label={t('Remove {{name}}', { name: user.label })}
                          onClick={() => setMembers({ ...members, [f.key]: selected.filter((id) => id !== user.id) })}
                        >
                          {user.label}
                          <X aria-hidden="true" />
                        </Button>
                      ))}
                  </div>
                )}
                {!form.users.length && (
                  <p className="text-sm text-muted-foreground">{t('No active organization members are available.')}</p>
                )}
              </fieldset>
            )
          }
          if (form.modelSetup?.kind === 'connection-model') return null
          const sources = sourcesByProvider.get(f.providerId) ?? []
          const placeholder = sources.length
            ? t('Select an authorized data source')
            : t('No shared source for {{provider}}', { provider: f.providerId })
          return (
            <fieldset key={f.key} disabled={disabled} className="space-y-2">
              <Label htmlFor={id}>{f.label}</Label>
              <Select
                value={sources.some((s) => sourceKey(s.source) === sourceIds[f.key]) ? sourceIds[f.key] : ''}
                disabled={disabled || !sources.length}
                onValueChange={(value) => setSourceIds({ ...sourceIds, [f.key]: value })}
              >
                <SelectTrigger id={id} className="w-full">
                  <SelectValue placeholder={placeholder} />
                </SelectTrigger>
                <SelectContent position="popper">
                  {sources.map((s) => (
                    <SelectItem key={sourceKey(s.source)} value={sourceKey(s.source)}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {sources.length > 0 && (
                <>
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
                </>
              )}
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
