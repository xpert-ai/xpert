import { useEffect, useMemo, useState } from 'react'
import { Button } from '@xpert-ai/shadcn-ui'
import { LoaderCircle } from 'lucide-react'
import { platformCommandUrl } from '../electron/workbench-platform.mjs'
import { HostError, invoke } from './host'
import { t } from './i18n'
import { createWorkspaceConnectionFlow, type ConnectionProgress } from './workspace-connection-flow'

export function useWorkspaceConnection(webUrl: string, assistantId: string) {
  const [progress, setProgress] = useState<ConnectionProgress>(null)
  const flow = useMemo(
    () =>
      createWorkspaceConnectionFlow({
        assistantId,
        start: (request) => invoke('startPluginConnection', request),
        check: (attemptId) => invoke('checkPluginConnection', { attemptId }),
        cancel: (attemptId) => invoke('cancelPluginConnection', { attemptId }),
        open: async (target) => {
          const url = platformCommandUrl(webUrl, target)
          if (!url) throw new Error(t('This workspace connection is not available.'))
          if (window.xpertDesktop) {
            if (await window.xpertDesktop.openPlatform(target)) return
          } else {
            const tab = window.open('', '_blank')
            if (tab) {
              tab.opener = null
              tab.location.href = url
              return
            }
          }
          throw new Error(t('Could not open the connection page.'))
        },
        onProgress: setProgress,
        isFatal: (error) => error instanceof HostError && [400, 401, 403, 404, 408, 409].includes(error.status),
        invalidRequest: () => new Error(t('This workspace connection is not available.'))
      }),
    [assistantId, webUrl]
  )
  useEffect(() => {
    const check = () => void flow.check()
    window.addEventListener('focus', check)
    return () => {
      window.removeEventListener('focus', check)
      flow.cancel()
    }
  }, [flow])
  return {
    connect: flow.connect,
    status: progress ? (
      <div
        role="status"
        className="flex shrink-0 items-center gap-2 border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground"
      >
        <LoaderCircle className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
        <span className="flex-1">
          {progress === 'retrying'
            ? t('Connection check failed. Retrying automatically...')
            : progress === 'opening'
              ? t('Opening the service connection...')
              : t('Waiting for authorization. Your message draft stays here.')}
        </span>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => flow.cancel()}>
          {t('Cancel')}
        </Button>
      </div>
    ) : null
  }
}
