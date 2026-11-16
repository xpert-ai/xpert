import { useEffect, useRef, useState } from 'react'
import { Button, Input } from '@xpert-ai/shadcn-ui'
import { subscribeAppActivation } from './app-activation'
import { PluginAvatar } from './avatar'
import type { WorkspaceConnectorItem, WorkspaceTarget } from './catalog-types'
import { invoke } from './host'
import { t } from './i18n'
import { platformCommandUrl } from '../electron/workbench-platform.mjs'

const statusLabels = {
  active: 'Connected',
  disconnected: 'Disconnected',
  error: 'Connection failed',
  expired: 'Expired',
  pending: 'Pending'
}

export function WorkspaceConnectors({
  target,
  webUrl,
  search,
  revision
}: {
  target: WorkspaceTarget
  webUrl: string
  search: string
  revision: number
}) {
  const { workspaceId, organizationId } = target
  const [items, setItems] = useState<WorkspaceConnectorItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [selected, setSelected] = useState('')
  const awaitingExternalSetup = useRef(false)
  useEffect(
    () =>
      subscribeAppActivation(() => {
        if (awaitingExternalSetup.current) {
          awaitingExternalSetup.current = false
          setRefresh((value) => value + 1)
        }
      }),
    []
  )
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    void invoke('workspaceConnectors', { organizationId, workspaceId })
      .then((items) => {
        if (active) setItems(items)
      })
      .catch((reason: Error) => {
        if (active) {
          setItems([])
          setError(reason.message)
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [workspaceId, organizationId, revision, refresh])
  const reload = () => setRefresh((value) => value + 1)
  const detail = items.find((item) => item.provider === selected)
  const filtered = items.filter((item) =>
    (item.name + ' ' + item.description + ' ' + item.provider).toLowerCase().includes(search.trim().toLowerCase())
  )
  if (error)
    return (
      <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
        {error}
        <Button variant="ghost" size="sm" onClick={reload}>
          {t('Retry')}
        </Button>
      </p>
    )
  if (detail)
    return (
      <ConnectorSettings
        key={detail.provider}
        item={detail}
        target={target}
        webUrl={webUrl}
        loading={loading}
        onExternalSetup={(pending) => {
          awaitingExternalSetup.current = pending
        }}
        onBack={() => setSelected('')}
        onSaved={() => {
          setSelected('')
          reload()
        }}
      />
    )
  if (loading)
    return (
      <p role="status" className="py-10 text-center text-muted-foreground">
        {t('Loading {{section}}…', { section: t('Connectors') })}
      </p>
    )
  if (!filtered.length)
    return (
      <p role="status" className="py-10 text-center text-muted-foreground">
        {t(items.length ? 'No matching results' : 'No connectors available in this workspace.')}
      </p>
    )
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-4">
      {filtered.map((item) => (
        <article key={item.provider} className="flex flex-col gap-2 rounded-xl border bg-background p-4">
          <div className="flex items-center gap-2">
            <PluginAvatar icon={item.icon} />
            <h3 className="font-semibold">{item.name}</h3>
          </div>
          {item.description && <p className="line-clamp-2 text-sm text-muted-foreground">{item.description}</p>}
          <div className="mt-auto flex items-center justify-between gap-2 pt-2">
            <span className="text-xs text-muted-foreground">
              {t(item.available ? statusLabels[item.status] : 'Unavailable')}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={!item.available || (!item.keyMethods.length && !item.hasWebMethods)}
              onClick={() => setSelected(item.provider)}
            >
              {t('Configure connector')}
            </Button>
          </div>
        </article>
      ))}
    </div>
  )
}

function ConnectorSettings({
  item,
  target,
  webUrl,
  loading,
  onExternalSetup,
  onBack,
  onSaved
}: {
  item: WorkspaceConnectorItem
  target: WorkspaceTarget
  webUrl: string
  loading: boolean
  onExternalSetup: (pending: boolean) => void
  onBack: () => void
  onSaved: () => void
}) {
  const [methodId, setMethodId] = useState(item.keyMethods[0]?.id ?? '')
  const method = item.keyMethods.find((entry) => entry.id === methodId)
  const [busy, setBusy] = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const [error, setError] = useState('')
  const submitting = useRef(false)
  const disabled = busy || loading || !item.available
  const run = async (action: () => Promise<void>) => {
    if (disabled || submitting.current) return
    submitting.current = true
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('The operation failed. Please retry.'))
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }
  return (
    <section className="mx-auto max-w-xl space-y-4 rounded-xl border bg-background p-5">
      <Button variant="ghost" size="sm" onClick={onBack} disabled={busy}>
        {t('Back to catalog')}
      </Button>
      <div className="flex items-center gap-3">
        <PluginAvatar icon={item.icon} />
        <h3 className="flex-1 font-semibold">{item.name}</h3>
        <span className="text-sm text-muted-foreground">{t(statusLabels[item.status])}</span>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {item.keyMethods.length > 1 && (
        <label className="flex items-center gap-2 text-sm">
          {t('Authentication method')}
          <select
            className="rounded-md border bg-background px-2 py-1"
            value={methodId}
            disabled={disabled}
            onChange={(event) => setMethodId(event.target.value)}
          >
            {item.keyMethods.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {method && (
        <form
          key={method.id}
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            const form = event.currentTarget
            const fields = new FormData(form)
            void run(async () => {
              const values = Object.fromEntries(
                method.fields
                  .map((field) => [field.name, String(fields.get(field.name) ?? '')])
                  .filter(([, value]) => value !== '')
              )
              await invoke('connectWorkspaceApiKey', {
                ...target,
                provider: item.provider,
                methodId: method.id,
                values
              })
              form.reset()
              onSaved()
            })
          }}
        >
          {item.keyMethods.length === 1 && <p className="text-sm font-medium">{method.label}</p>}
          {method.fields.map((field) => (
            <label key={field.name} className="block text-sm">
              {field.label}
              <Input
                className="mt-1"
                name={field.name}
                type={field.secret ? 'password' : 'text'}
                autoComplete="off"
                required={field.required}
                disabled={disabled}
                defaultValue={field.initial}
              />
            </label>
          ))}
          <Button size="sm" type="submit" disabled={disabled}>
            {t('Save connection')}
          </Button>
        </form>
      )}
      {item.hasWebMethods && (
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() =>
            void run(async () => {
              const navigation = { target: 'workspace.connectors.manage', ...target, provider: item.provider }
              // Arm before launching: native focus can return before the IPC promise resolves.
              onExternalSetup(true)
              try {
                if (window.xpertDesktop) {
                  if (await window.xpertDesktop.openPlatform(navigation)) return
                } else {
                  const url = platformCommandUrl(webUrl, navigation)
                  const tab = url && window.open('', '_blank')
                  if (tab) {
                    tab.opener = null
                    tab.location.href = url
                    return
                  }
                }
                throw new Error(t('Could not open the connection page.'))
              } catch (error) {
                onExternalSetup(false)
                throw error
              }
            })
          }
        >
          {t('Configure in Xpert')}
        </Button>
      )}
      {item.bindingId && item.status !== 'disconnected' && (
        <div className="border-t pt-3">
          {confirmDisconnect && <p className="mb-2 text-sm">{t('Disconnect this shared workspace connection?')}</p>}
          <Button
            size="sm"
            variant={confirmDisconnect ? 'destructive' : 'ghost'}
            disabled={disabled}
            onClick={() => {
              if (!confirmDisconnect) return setConfirmDisconnect(true)
              const bindingId = item.bindingId
              if (bindingId)
                void run(async () => {
                  await invoke('disconnectWorkspaceConnector', { ...target, bindingId })
                  onSaved()
                })
            }}
          >
            {t('Disconnect')}
          </Button>
          {confirmDisconnect && (
            <Button size="sm" variant="ghost" disabled={disabled} onClick={() => setConfirmDisconnect(false)}>
              {t('Cancel')}
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
