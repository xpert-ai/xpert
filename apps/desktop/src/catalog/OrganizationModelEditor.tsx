import { useCallback, useEffect, useRef, useState } from 'react'
import { Choice } from './OrganizationModelChoice'
import { OrganizationModelBootstrap } from './OrganizationModelBootstrap'
import { Button } from '@xpert-ai/shadcn-ui'
import type {
  OrganizationModelChoice,
  OrganizationModelPreview,
  OrganizationModelStep,
  OrganizationSettings,
  OrganizationSettingsTarget,
  OrganizationSetupField
} from '../catalog-types'
import { invoke } from '../host'
import { t } from '../i18n'

export function OrganizationModelEditor({
  target,
  fields,
  bootstrap,
  users,
  revision,
  disabled,
  onConfirmed
}: {
  target: OrganizationSettingsTarget
  bootstrap?: { version: string; modes: OrganizationModelChoice[] }
  users: OrganizationModelChoice[]
  fields: OrganizationSetupField[]
  revision: number
  disabled: boolean
  onConfirmed: (queries: OrganizationSettings['queries'] | null) => void
}) {
  const { organizationId, pluginName, appName } = target
  const run = useCallback(
    (operation: OrganizationModelStep) =>
      invoke('applicationOrganizationModelSetup', {
        organizationId,
        pluginName,
        appName,
        installationScope: 'organization',
        operation
      }),
    [organizationId, pluginName, appName]
  )
  const generation = useRef(0)
  const [connections, setConnections] = useState<OrganizationModelChoice[]>([])
  const [models, setModels] = useState<OrganizationModelChoice[]>([])
  const [connection, setConnection] = useState('')
  const [model, setModel] = useState('')
  const [preview, setPreview] = useState<OrganizationModelPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const request = useCallback(
    async (operation: OrganizationModelStep, receive: (value: Awaited<ReturnType<typeof run>>) => void) => {
      const token = ++generation.current
      setBusy(true)
      setError('')
      try {
        const result = await run(operation)
        if (generation.current === token) receive(result)
      } catch (err) {
        if (generation.current === token)
          setError(err instanceof Error ? err.message : t('Could not load installation settings.'))
      } finally {
        if (generation.current === token) setBusy(false)
      }
    },
    [run]
  )
  useEffect(() => {
    onConfirmed(null)
    setConnection('')
    setModel('')
    setModels([])
    setConnections([])
    setPreview(null)
    setConfirmed(false)
    void request({ step: 'connections' }, (result) => {
      if (!('choices' in result)) throw Error(t('Could not load installation settings.'))
      setConnections(result.choices)
    })
    return () => {
      generation.current++
    }
  }, [request, revision, onConfirmed])

  function invalidate() {
    generation.current++
    setBusy(false)
    setPreview(null)
    setError('')
    setConfirmed(false)
    onConfirmed(null)
  }
  function selectConnection(integrationId: string) {
    invalidate()
    setConnection(integrationId)
    setModel('')
    setModels([])
    void request({ step: 'models', integrationId }, (result) => {
      if (!('choices' in result)) throw Error(t('Could not load installation settings.'))
      setModels(result.choices)
    })
  }
  const selection = { integrationId: connection, modelId: model, revision }
  return (
    <div className="space-y-4">
      <Choice
        id="application-connection"
        label={t('Authorized connection')}
        options={connections}
        value={connection}
        disabled={disabled || busy}
        onChange={selectConnection}
      />
      {!busy && !error && !connections.length && (
        <p role="status">{t('No connection is authorized for this organization.')}</p>
      )}
      {connection && (
        <Choice
          id="application-model"
          label={t('Business model')}
          options={models}
          value={model}
          disabled={disabled || busy}
          onChange={(id) => {
            invalidate()
            setModel(id)
          }}
        />
      )}
      {connection && !busy && !error && !models.length && (
        <p role="status">{t('No readable business model is available on this connection.')}</p>
      )}
      {connection && bootstrap && (
        <OrganizationModelBootstrap
          key={JSON.stringify([organizationId, pluginName, appName, connection, revision, bootstrap.version])}
          integrationId={connection}
          revision={revision}
          options={bootstrap}
          users={users}
          run={run}
          disabled={disabled || busy}
          onStart={invalidate}
          onReady={(item) => {
            invalidate()
            setModels((previous) => [...previous.filter((m) => m.id !== item.id), item])
            setModel(item.id)
            void request({ step: 'preview', integrationId: connection, modelId: item.id, revision }, (result) => {
              if (!('receipt' in result)) throw Error(t('Could not load installation settings.'))
              setPreview(result)
            })
          }}
        />
      )}
      {model && (
        <Button
          type="button"
          variant="outline"
          disabled={disabled || busy}
          onClick={() => {
            invalidate()
            void request({ step: 'preview', ...selection }, (result) => {
              if (!('receipt' in result)) throw Error(t('Could not load installation settings.'))
              setPreview(result)
            })
          }}
        >
          {t('Preview queries')}
        </Button>
      )}
      {busy && <p role="status">{t('Checking installation settings…')}</p>}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {preview && (
        <div className="space-y-3">
          {preview.queries.map((q) => (
            <div key={q.key} className="space-y-1">
              <p className="font-medium">
                {fields.find((f) => f.key === q.key)?.label ?? q.key} · {t('{{count}} rows', { count: q.rowCount })}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      {q.fields.map((f) => (
                        <th key={f.id} className="px-2">
                          {f.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {q.sample.map((row, i) => (
                      <tr key={i}>
                        {q.fields.map((f) => (
                          <td key={f.id} className="px-2">
                            {String(row[f.id] ?? '—')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={disabled || busy || confirmed}
            onClick={() => {
              void request({ step: 'confirm', ...selection, receipt: preview.receipt }, (result) => {
                if (!('queries' in result) || 'receipt' in result)
                  throw Error(t('Could not load installation settings.'))
                onConfirmed(result.queries)
                setConfirmed(true)
              })
            }}
          >
            {confirmed ? t('Model confirmed') : t('Confirm shared analysis definition')}
          </Button>
        </div>
      )}
    </div>
  )
}
