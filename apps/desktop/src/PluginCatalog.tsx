import { useEffect, useId, useRef, useState } from 'react'
import { Button, HoverCard, HoverCardContent, HoverCardTrigger } from '@xpert-ai/shadcn-ui'
import { ArrowLeft, Check, Info, LoaderCircle, Plus } from 'lucide-react'
import { CatalogCombobox } from './CatalogCombobox'
import { PluginAvatar } from './avatar'
import { PluginInstallDialog } from './PluginInstallDialog'
import { invoke } from './host'
import { t } from './i18n'
import type { PluginLibrary, PluginLibraryItem } from './plugin-library-types'

const statuses = {
  available: 'Added to this workspace',
  not_published: 'Not added to this workspace',
  disabled: 'Disabled in this workspace'
}
const components = { skill: 'Skill', mcp: 'Tools', middleware: 'Middleware', external_xpert: 'Digital expert' }

export function PluginCatalog({ search, revision }: { search: string; revision: number }) {
  const [workspaceId, setWorkspaceId] = useState('')
  const selectedWorkspace = useRef('')
  const [data, setData] = useState<PluginLibrary | null>(null)
  const [detail, setDetail] = useState<PluginLibraryItem | null>(null)
  const [install, setInstall] = useState<PluginLibraryItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [infoOpen, setInfoOpen] = useState(false)
  const infoId = useId()
  const [filter, setFilter] = useState<'all' | 'available'>('all')
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let alive = true
    setLoading(true)
    setDetail(null)
    setInstall(null)
    setError('')
    invoke('pluginLibrary', { workspaceId: workspaceId || selectedWorkspace.current || undefined })
      .then((result) => {
        if (alive) {
          selectedWorkspace.current = result.workspaceId || ''
          setData(result)
        }
      })
      .catch((reason) => {
        if (alive) setError(reason instanceof Error ? reason.message : t('Could not load plugins.'))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [workspaceId, revision, refresh])
  const workspace = data?.workspaces.find((item) => item.id === data.workspaceId)
  const action = (item: PluginLibraryItem) =>
    item.status === 'available' ? (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Check className="size-3.5" />
        {t('Added')}
      </span>
    ) : item.status === 'disabled' ? (
      <span className="text-xs text-muted-foreground">{t('Contact administrator')}</span>
    ) : (
      <Button size="sm" variant="outline" disabled={!workspace || loading || !!error} onClick={() => setInstall(item)}>
        <Plus className="size-3.5" />
        {t('Add to workspace')}
      </Button>
    )
  const items =
    data?.items.filter(
      (item) =>
        (filter === 'all' || item.status === 'available') &&
        `${item.name} ${item.description} ${item.components.map((entry) => entry.name).join(' ')}`
          .toLowerCase()
          .includes(search.trim().toLowerCase())
    ) ?? []
  return (
    <section aria-label={t('Workspace plugin library')} className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b px-6 py-3 text-sm">
        <span className="text-muted-foreground">{t('Workspace')}</span>
        <CatalogCombobox
          items={data?.workspaces ?? []}
          value={workspace?.id || ''}
          label={t('Select a workspace')}
          searchLabel={t('Search workspaces')}
          disabled={loading || !data?.workspaces.length}
          onChange={(id) => {
            setNotice('')
            setWorkspaceId(id)
          }}
        />
        <HoverCard open={infoOpen} onOpenChange={setInfoOpen} openDelay={200} closeDelay={150}>
          <HoverCardTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto shrink-0 text-muted-foreground"
              aria-label={t('About workspace plugins')}
              aria-describedby={infoOpen ? infoId : undefined}
              onClick={() => setInfoOpen(true)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setInfoOpen(false)
              }}
            >
              <Info className="size-4" aria-hidden="true" />
            </Button>
          </HoverCardTrigger>
          <HoverCardContent
            id={infoId}
            role="tooltip"
            align="end"
            side="bottom"
            collisionPadding={16}
            className="w-80 max-w-[calc(100vw-2rem)] text-sm leading-6"
          >
            {t('Only workspaces you can edit are listed.')}{' '}
            {notice ||
              t(
                'Add plugins to this workspace here. Experts in this workspace can then select them from the conversation Plugins menu.'
              )}
          </HoverCardContent>
        </HoverCard>
        <span role="status" className="sr-only">
          {notice}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto bg-muted/20 px-6 py-4">
        {error && (
          <div
            role="alert"
            className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-destructive/30 p-3 text-sm text-destructive"
          >
            {error}
            <Button size="sm" variant="outline" onClick={() => setRefresh((value) => value + 1)}>
              {t('Retry')}
            </Button>
          </div>
        )}
        {loading ? (
          <div role="status" className="flex justify-center gap-2 py-12 text-muted-foreground">
            <LoaderCircle className="size-5 animate-spin" />
            {t('Loading plugins...')}
          </div>
        ) : !data?.workspaces.length ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {t('You have no editable workspaces in this organization.')}
          </p>
        ) : detail ? (
          <div className="space-y-5">
            <Button variant="ghost" onClick={() => setDetail(null)}>
              <ArrowLeft />
              {t('Back to catalog')}
            </Button>
            <div className="flex items-start gap-4">
              <PluginAvatar icon={detail.icon} large />
              <div className="flex-1">
                <h3 className="text-lg font-semibold">{detail.name}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{detail.description}</p>
              </div>
              {action(detail)}
            </div>
            <p className="text-sm">{t(statuses[detail.status])}</p>
            <h4 className="font-medium">{t('Included capabilities')}</h4>
            <ul className="divide-y">
              {detail.components.map((item, index) => (
                <li key={index} className="flex justify-between gap-3 py-2 text-sm">
                  <span>{item.name}</span>
                  <span className="text-muted-foreground">{t(components[item.kind])}</span>
                </li>
              ))}
            </ul>
            <p className="break-all text-xs text-muted-foreground">
              {t('Version')}: {detail.version}
            </p>
            <p className="text-sm text-muted-foreground">
              {t(
                'Adding a plugin makes it available to this workspace. It does not select it in a conversation or authorize a service connection.'
              )}
            </p>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center gap-2">
              <Button size="sm" variant={filter === 'all' ? 'secondary' : 'ghost'} onClick={() => setFilter('all')}>
                {t('All')}
              </Button>
              <Button
                size="sm"
                variant={filter === 'available' ? 'secondary' : 'ghost'}
                onClick={() => setFilter('available')}
              >
                {t('Added to this workspace')}
              </Button>
              <span className="ml-auto text-xs text-muted-foreground">
                {items.length} {t('Plugins')}
              </span>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-4">
              {items.map((item) => (
                <article
                  key={item.id}
                  tabIndex={0}
                  className="group/plugin relative flex h-36 flex-col overflow-hidden rounded-xl border bg-background p-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-start gap-3">
                    <PluginAvatar icon={item.icon} />
                    <button
                      className="line-clamp-2 min-w-0 text-left text-sm font-semibold leading-5 hover:underline focus-visible:underline"
                      onClick={() => setDetail(item)}
                    >
                      {item.name}
                    </button>
                  </div>
                  {item.description && (
                    <p className="mt-1.5 line-clamp-2 text-sm leading-5 text-muted-foreground">{item.description}</p>
                  )}
                  <p className="mt-1.5 truncate text-xs text-muted-foreground">{t(statuses[item.status])}</p>
                  <div className="pointer-events-none absolute bottom-0 left-0 flex w-full translate-y-1 items-center justify-between border-t bg-background px-4 py-2 opacity-0 transition-[opacity,transform] group-hover/plugin:pointer-events-auto group-hover/plugin:translate-y-0 group-hover/plugin:opacity-100 group-focus-within/plugin:pointer-events-auto group-focus-within/plugin:translate-y-0 group-focus-within/plugin:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:translate-y-0 [@media(hover:none)]:opacity-100">
                    <Button size="sm" variant="ghost" onClick={() => setDetail(item)}>
                      {t('View details')}
                    </Button>
                    {action(item)}
                  </div>
                </article>
              ))}
            </div>
            {!items.length && (
              <p className="py-12 text-center text-sm text-muted-foreground">{t('No matching results')}</p>
            )}
          </>
        )}
      </div>
      {install && workspace && data && (
        <PluginInstallDialog
          item={install}
          workspace={workspace}
          experts={data.experts}
          onClose={() => setInstall(null)}
          onAdded={() => {
            setInstall(null)
            setNotice(t('Plugin added. Select it from the conversation Plugins menu to use it.'))
            setRefresh((value) => value + 1)
          }}
        />
      )}
    </section>
  )
}
