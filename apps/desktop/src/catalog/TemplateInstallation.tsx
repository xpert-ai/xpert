import { useEffect, useState } from 'react'
import { Button } from '@xpert-ai/shadcn-ui'
import {
  createInstallationClient,
  installationStageLabels,
  installationStatusLabel,
  type InstallationSnapshot
} from '@xpert-ai/template-installation-client'
import { invoke } from '../host'
import { t } from '../i18n'
import { platformCommandUrl } from '../../electron/workbench-platform.mjs'

const empty: InstallationSnapshot = {
  operation: null,
  history: [],
  hasMore: false,
  busy: false,
  uncertain: false,
  error: ''
}
export function useTemplateInstallation(scope: string, workspaceId: string, templateId: string) {
  const [state, setState] = useState(empty)
  const [client, setClient] = useState<ReturnType<typeof createInstallationClient> | null>(null)
  useEffect(() => {
    setState(empty)
    if (!workspaceId || !templateId) {
      setClient(null)
      return
    }
    const next = createInstallationClient({
      scope,
      workspaceId,
      templateId,
      storage: window.localStorage,
      transport: {
        create: (input) => invoke('createTemplateInstallation', input),
        get: (id) => invoke('getTemplateInstallation', id),
        retry: (id) => invoke('retryTemplateInstallation', id),
        list: (workspaceId, skip) => invoke('listTemplateInstallations', { workspaceId, skip })
      },
      changed: setState,
      errorMessage: (error) => (error instanceof Error ? error.message : t('Could not read installation status.'))
    })
    setClient(next)
    void next.restore().then(() => next.history())
    return () => next.dispose()
  }, [scope, workspaceId, templateId])
  return { state, client }
}

export function TemplateInstallationProgress({
  state,
  client,
  webUrl,
  onUse,
  organizationId
}: {
  organizationId: string
  state: InstallationSnapshot
  client: ReturnType<typeof createInstallationClient> | null
  webUrl: string
  onUse: (id: string) => Promise<void>
}) {
  const operation = state.operation
  const [openingError, setOpeningError] = useState('')
  const configure = async () => {
    if (!operation) return
    const target = { target: 'workspace.connectors.manage', workspaceId: operation.workspaceId, organizationId }
    try {
      setOpeningError('')
      if (window.xpertDesktop) {
        if (!(await window.xpertDesktop.openPlatform(target))) throw new Error(t('The operation failed. Please retry.'))
      } else {
        const url = platformCommandUrl(webUrl, target)
        if (url) window.open(url, '_blank', 'noopener,noreferrer')
      }
    } catch (error) {
      setOpeningError(error instanceof Error ? error.message : t('The operation failed. Please retry.'))
    }
  }
  return (
    <section className="space-y-4 border-t pt-5" aria-label={t('Template installations')}>
      <h3 className="font-medium">{t('Template installations')}</h3>
      {operation && (
        <div className="space-y-3" aria-live="polite">
          <p role="status" className="font-medium">
            {t(installationStatusLabel(operation))}
          </p>
          <p className="text-sm text-muted-foreground">
            {t(installationStageLabels[operation.stage])} · {t('Attempt {{count}}', { count: operation.attempt })}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('Installation ID')}: {operation.id}
          </p>
          {operation.error && (
            <p role="alert" className="text-sm text-destructive">
              {operation.error.message}
            </p>
          )}
          {operation.pendingAuthInstallationIds.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {t('Assistant created. {{count}} connections still require configuration in the workspace.', {
                count: operation.pendingAuthInstallationIds.length
              })}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={state.busy} onClick={() => void client?.refresh()}>
              {t('Refresh status')}
            </Button>
            {operation.retryable && (
              <Button type="button" disabled={state.busy} onClick={() => void client?.retry()}>
                {t('Resume installation')}
              </Button>
            )}
            {operation.status === 'succeeded' && operation.assistantId && (
              <Button
                type="button"
                onClick={() => {
                  if (!operation.assistantId) return
                  setOpeningError('')
                  void onUse(operation.assistantId).catch((error) =>
                    setOpeningError(error instanceof Error ? error.message : t('Could not open the assistant.'))
                  )
                }}
              >
                {t('Open assistant')}
              </Button>
            )}
            {operation.pendingAuthInstallationIds.length > 0 && (
              <Button type="button" variant="outline" onClick={() => void configure()}>
                {t('Configure connections')}
              </Button>
            )}
            {operation.status !== 'running' && (
              <Button type="button" variant="outline" disabled={state.busy} onClick={() => client?.newInstance()}>
                {t('Create another assistant')}
              </Button>
            )}
          </div>
        </div>
      )}
      {state.uncertain && (
        <p role="status" className="text-sm">
          {t('Connection interrupted. Check status to continue the same installation safely.')}
        </p>
      )}
      {(state.error || openingError) && (
        <p role="alert" className="text-sm text-destructive">
          {state.error || openingError}
        </p>
      )}
      {state.uncertain && (
        <Button type="button" disabled={state.busy} onClick={() => void client?.refresh()}>
          {t('Check installation status')}
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        {t('You can close this window. Reopen this template and workspace to continue from installation history.')}
      </p>
      <details>
        <summary className="cursor-pointer text-sm">{t('Installation history')}</summary>
        <div className="mt-3 space-y-2">
          <Button type="button" variant="outline" disabled={state.busy} onClick={() => void client?.history()}>
            {t('Refresh history')}
          </Button>
          {state.history.map((item) => (
            <button
              type="button"
              key={item.id}
              disabled={state.busy}
              onClick={() => void client?.select(item)}
              className="block w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
            >
              {new Date(item.createdAt).toLocaleString()} · {t(installationStatusLabel(item))}
              <span className="block text-xs text-muted-foreground">{item.id}</span>
            </button>
          ))}
          {state.hasMore && (
            <Button type="button" variant="outline" onClick={() => void client?.history(true)}>
              {t('Load more')}
            </Button>
          )}
        </div>
      </details>
    </section>
  )
}
