import { useEffect, useState } from 'react'
import { Button, Input, Label } from '@xpert-ai/shadcn-ui'
import { invoke, openWorkspace } from '../host'
import { t } from '../i18n'
import type {
  ApplicationInput,
  ApplicationToolsetRequirement,
  ApplicationToolsetSetup,
  ApplicationToolsetSelection,
  ApplicationCredentialValue
} from '../catalog-types'

export function ApplicationToolsetEditor({
  application,
  requirement,
  webUrl,
  onSaved,
  onClose,
  onBusy
}: {
  application: ApplicationInput
  requirement: ApplicationToolsetRequirement
  webUrl: string
  onSaved: (selection: ApplicationToolsetSelection) => void
  onClose: () => void
  onBusy: (busy: boolean) => void
}) {
  const [setup, setSetup] = useState<ApplicationToolsetSetup | null>(null)
  const [name, setName] = useState('')
  const [credentials, setCredentials] = useState<Record<string, ApplicationCredentialValue>>({})
  const [tools, setTools] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const { pluginName, appName, installationScope } = application
  useEffect(() => {
    let active = true
    void invoke('applicationToolsetSetup', { pluginName, appName, installationScope, key: requirement.key })
      .then((result) => {
        if (!active) return
        setSetup(result)
        setName(result.name)
        setCredentials(
          Object.fromEntries(
            result.fields.flatMap((field) => (field.value === undefined ? [] : [[field.name, field.value]]))
          )
        )
        setTools(result.tools.filter((tool) => tool.enabled).map((tool) => tool.name))
      })
      .catch((error) => {
        if (active) setError(error instanceof Error ? error.message : t('Could not load installation settings.'))
      })
    return () => {
      active = false
    }
  }, [pluginName, appName, installationScope, requirement.key])
  const complete =
    setup?.supported &&
    name.trim() &&
    tools.length > 0 &&
    setup.fields.every(
      (field) =>
        !field.required ||
        (credentials[field.name] !== undefined && credentials[field.name] !== '') ||
        (field.hasValue && !Object.hasOwn(credentials, field.name))
    )
  async function save() {
    if (!complete || saving) return
    setSaving(true)
    onBusy(true)
    setError('')
    try {
      const selection = await invoke('saveApplicationToolset', {
        pluginName,
        appName,
        installationScope,
        key: requirement.key,
        name: name.trim(),
        credentials,
        tools
      })
      setCredentials({})
      onSaved(selection)
    } catch (error) {
      setError(error instanceof Error ? error.message : t('The operation failed. Please retry.'))
    } finally {
      setSaving(false)
      onBusy(false)
    }
  }
  return (
    <section aria-label={t('Configure tools')} className="space-y-4 rounded-lg border p-4">
      <h4 className="font-medium">{requirement.label}</h4>
      {!setup && !error && (
        <p role="status" className="text-sm text-muted-foreground">
          {t('Checking installation settings…')}
        </p>
      )}
      {setup && !setup.supported && (
        <>
          <p className="text-sm text-muted-foreground">
            {t('This provider requires advanced configuration in Xpert. Configure it there, then refresh settings.')}
          </p>
          <Button type="button" variant="outline" onClick={() => openWorkspace(webUrl)}>
            {t('Open Xpert workspace')}
          </Button>
        </>
      )}
      {setup?.supported && (
        <>
          <div className="space-y-2">
            <Label htmlFor="app-toolset-name">{t('Configuration name')}</Label>
            <Input
              id="app-toolset-name"
              maxLength={100}
              value={name}
              disabled={saving}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          {setup.fields.map((field) => (
            <div key={field.name} className="space-y-2">
              <Label htmlFor={`app-credential-${field.name}`}>
                {field.label}
                {field.required ? ' *' : ''}
              </Label>
              {field.type === 'boolean' ? (
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  id={`app-credential-${field.name}`}
                  checked={credentials[field.name] === true}
                  disabled={saving}
                  onChange={(event) =>
                    setCredentials((current) => ({ ...current, [field.name]: event.target.checked }))
                  }
                />
              ) : field.type === 'select' ? (
                <select
                  id={`app-credential-${field.name}`}
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  disabled={saving}
                  value={String(credentials[field.name] ?? '')}
                  onChange={(event) => setCredentials((current) => ({ ...current, [field.name]: event.target.value }))}
                >
                  <option value="">{t('Select an option')}</option>
                  {field.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id={`app-credential-${field.name}`}
                  autoComplete="off"
                  disabled={saving}
                  type={
                    field.type === 'secret-input'
                      ? 'password'
                      : ['int', 'number'].includes(field.type)
                        ? 'number'
                        : 'text'
                  }
                  step={field.type === 'int' ? 1 : 'any'}
                  value={String(credentials[field.name] ?? '')}
                  placeholder={
                    field.type === 'secret-input' && field.hasValue
                      ? t('Leave blank to keep the saved credential')
                      : field.placeholder
                  }
                  onChange={(event) =>
                    setCredentials((current) => {
                      const value = event.target.value
                      const next = { ...current }
                      if (!value && field.type === 'secret-input' && field.hasValue) delete next[field.name]
                      else next[field.name] = value && ['int', 'number'].includes(field.type) ? Number(value) : value
                      return next
                    })
                  }
                />
              )}
              {field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
            </div>
          ))}
          <div className="space-y-3">
            <h5 className="text-sm font-medium">{t('Enabled tools')}</h5>
            {setup.tools.map((tool) => (
              <div key={tool.name} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  id={`app-tool-${tool.name}`}
                  checked={tools.includes(tool.name)}
                  disabled={saving}
                  onChange={(event) =>
                    setTools((current) =>
                      event.target.checked ? [...current, tool.name] : current.filter((name) => name !== tool.name)
                    )
                  }
                />
                <Label htmlFor={`app-tool-${tool.name}`}>{tool.label}</Label>
              </div>
            ))}
            {!tools.length && <p className="text-xs text-muted-foreground">{t('Enable at least one tool.')}</p>}
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
          {t('Cancel')}
        </Button>
        {setup?.supported && (
          <Button type="button" disabled={!complete || saving} onClick={() => void save()}>
            {saving ? t('Saving…') : t('Save configuration')}
          </Button>
        )}
      </div>
    </section>
  )
}
