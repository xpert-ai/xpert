import { useEffect, useRef, useState } from 'react'
import { Button } from '@xpert-ai/shadcn-ui'
import { t } from './i18n'
import { invoke } from './host'
import type { SkillCatalogItem, WorkspaceTarget } from './catalog-types'

export function SkillsCatalog({
  target,
  readOnly,
  writesPaused,
  search,
  revision
}: {
  target: WorkspaceTarget
  readOnly: boolean
  writesPaused: boolean
  search: string
  revision: number
}) {
  const [items, setItems] = useState<SkillCatalogItem[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState('')
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const busy = useRef(false)
  const { organizationId, workspaceId } = target
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    const timer = window.setTimeout(
      () => {
        void invoke('skillCatalog', { organizationId, workspaceId: readOnly ? '' : workspaceId, search, offset })
          .then((page) => {
            if (!active) return
            setTotal(page.total)
            setItems((previous) => [...previous.slice(0, offset), ...page.items])
          })
          .catch((reason: Error) => {
            if (active) setError(reason.message)
          })
          .finally(() => {
            if (active) setLoading(false)
          })
      },
      search && !offset ? 180 : 0
    )
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [organizationId, workspaceId, readOnly, search, revision, offset, retry])
  const install = async (id: string) => {
    if (busy.current || !workspaceId || readOnly || writesPaused) return
    busy.current = true
    setError('')
    setPending(id)
    try {
      await invoke('installWorkspaceSkill', { ...target, indexId: id })
      setItems((previous) => previous.map((item) => (item.id === id ? { ...item, installed: true } : item)))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('The operation failed. Please retry.'))
    } finally {
      busy.current = false
      setPending('')
    }
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-muted/20 px-6 py-5">
      {error && (
        <div role="alert" className="mb-3 flex items-center gap-2 text-sm text-destructive">
          {error}
          <Button size="sm" variant="ghost" onClick={() => setRetry((value) => value + 1)}>
            {t('Retry')}
          </Button>
        </div>
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-4">
        {items.map((item) => (
          <article key={item.id} className="flex flex-col gap-2 rounded-xl border bg-background p-4">
            <h3 className="text-base font-semibold">{item.name}</h3>
            {item.description && <p className="line-clamp-3 text-sm text-muted-foreground">{item.description}</p>}
            <div className="mt-auto flex items-center justify-between gap-2 pt-2">
              <span className="truncate text-xs text-muted-foreground">{item.publisher}</span>
              {readOnly ? (
                <span className="text-xs text-muted-foreground">{t('Read only')}</span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!workspaceId || writesPaused || !!pending || item.installed === true || loading}
                  onClick={() => void install(item.id)}
                >
                  {item.installed ? t('Installed') : pending === item.id ? t('Installing…') : t('Install skill')}
                </Button>
              )}
            </div>
          </article>
        ))}
      </div>
      <div className="mt-4 flex justify-center text-sm text-muted-foreground" aria-live="polite">
        {loading
          ? t('Loading {{section}}…', { section: t('Skills') })
          : !error && !items.length
            ? t('No matching results')
            : !error &&
              items.length < total && (
                <Button variant="outline" size="sm" disabled={!!pending} onClick={() => setOffset(items.length)}>
                  {t('Load more')}
                </Button>
              )}
      </div>
    </div>
  )
}
