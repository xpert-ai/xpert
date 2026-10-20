import { useState } from 'react'
import { FolderKanban } from 'lucide-react'
import { Button } from '@xpert-ai/shadcn-ui'
import { platformCommandUrl } from '../electron/workbench-platform.mjs'
import { t } from './i18n'

/** Standalone Projects use the platform login; no Assistant session or credentials are delegated. */
export function ProjectEntry({ webUrl, compact }: { webUrl: string; compact: boolean }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(false)
  const open = async () => {
    if (busy) return
    setBusy(true)
    setError(false)
    try {
      const payload = { target: 'project.list' }
      if (window.xpertDesktop) {
        if (!(await window.xpertDesktop.openPlatform(payload))) throw Error('navigation_failed')
      } else {
        const url = platformCommandUrl(webUrl, payload),
          tab = url && window.open('about:blank', '_blank')
        if (!tab) throw Error('navigation_failed')
        tab.opener = null
        tab.location.href = url
      }
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className={`shrink-0 border-t py-2 ${compact ? 'px-3' : 'px-4'}`}>
      <Button
        variant="ghost"
        size={compact ? 'icon' : 'default'}
        className={compact ? 'size-12' : 'w-full justify-start'}
        disabled={busy}
        aria-label={t('Project pipelines')}
        title={t('Open Projects in platform')}
        onClick={() => void open()}
      >
        <FolderKanban className="size-5 shrink-0" />
        {!compact && t('Project pipelines')}
      </Button>
      {error && (
        <p role="alert" className="px-1 pt-1 text-xs text-destructive">
          {t('Could not open Projects. Please retry.')}
        </p>
      )}
    </div>
  )
}
