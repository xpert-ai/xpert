import { WorkspaceConnectors } from './WorkspaceConnectors'
import { SkillsCatalog } from './SkillsCatalog'
import { CatalogCombobox } from './CatalogCombobox'
import { PluginCatalog } from './PluginCatalog'
import { t, useLocale } from './i18n'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Tabs,
  TabsContent,
  TabsHeader,
  TabsList,
  TabsTrigger
} from '@xpert-ai/shadcn-ui'
import { ArrowLeft, ArrowUpRight, LoaderCircle, Plus, RefreshCw, Search, X } from 'lucide-react'
import { CatalogAvatar } from './catalog/CatalogAvatar'
import { ApplicationCard } from './catalog/ApplicationCard'
import { CatalogSetup } from './CatalogSetup'
import { TemplateOverview } from './catalog/TemplateOverview'
import { invoke } from './host'
import { actionLabel, businessCategories, canUseExpert, categoryLabel, statusLabel } from './catalog-labels'
import type { CatalogItem, CatalogKind, DiscoveryWorkspace } from './catalog-types'
import { catalogBusinessAreas, matchesBusinessArea } from './catalog/business-area-filter'
import { blankAssistant } from './catalog/blank-assistant'
import { subscribeAppActivation } from './app-activation'
import { createCatalogCache, isCatalogDataKind } from './catalog/catalog-cache'
import {
  templateSource,
  templateSourceGroups,
  templateSourceLabels,
  sortTemplateSources,
  type TemplateSource
} from './catalog/template-source'

const tabs: { id: CatalogKind; label: string }[] = [
  { id: 'experts', label: 'Digital experts' },
  { id: 'applications', label: 'Apps' },
  { id: 'plugins', label: 'Plugins' },
  { id: 'connectors', label: 'Connectors' },
  { id: 'skills', label: 'Skills' },
  { id: 'templates', label: 'Agent templates' }
]

export function CatalogDialog({
  templateId,
  workspace,
  workspaces,
  workspacesLoading,
  onTemplateCreated,
  workspaceError,
  onWorkspace,
  retryWorkspaces,
  installationScope,
  organizationId,
  organization,
  webUrl,
  onClose,
  onUse
}: {
  workspace?: DiscoveryWorkspace
  workspaces: DiscoveryWorkspace[]
  workspacesLoading: boolean
  onTemplateCreated: () => void
  workspaceError: string
  retryWorkspaces: () => void
  onWorkspace: (id: string) => void
  templateId?: string
  organizationId: string
  installationScope: string
  organization: string
  webUrl: string
  onClose: () => void
  onUse: (botId: string) => Promise<void>
}) {
  const [kind, setKind] = useState<CatalogKind>('experts')
  const target = { organizationId, workspaceId: workspace?.id ?? '' }
  const readOnly = !!workspace && !workspace.canWrite
  const writesPaused = workspacesLoading || !!workspaceError
  const connectorTab = kind === 'connectors'
  const writable = workspaces.filter((item) => (connectorTab ? item.canManage : item.canWrite))
  const [permissionRevision, setPermissionRevision] = useState(0)
  const [canInstall, setCanInstall] = useState(false)
  const [permissionError, setPermissionError] = useState('')
  useEffect(() => {
    let active = true
    void invoke('organizationPluginAccess', organizationId)
      .then((allowed) => {
        if (!active) return
        setPermissionError('')
        setCanInstall(allowed === true)
      })
      .catch((reason: Error) => {
        if (active) {
          setCanInstall(false)
          setPermissionError(reason.message)
        }
      })
    return () => {
      active = false
    }
  }, [organizationId, permissionRevision])
  useEffect(() => {
    if (kind === 'plugins' && !canInstall) setKind('experts')
  }, [kind, canInstall])
  const locale = useLocale()
  const cache = useMemo(
    () =>
      createCatalogCache(
        (kind) => invoke('listCatalog', kind),
        (offset) => invoke('templateCatalogPage', { offset })
      ),
    [locale, organizationId, installationScope]
  )
  const {
    items,
    loading,
    loadingMore,
    error: loadError
  } = useSyncExternalStore(cache.subscribe, () => cache.getSnapshot(kind))
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [source, setSource] = useState<TemplateSource | 'all'>('all')
  const [businessAreaId, setBusinessAreaId] = useState<string | null>(null)
  const [selected, setSelected] = useState<CatalogItem | null>(null)
  const [installingTemplate, setInstallingTemplate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pluginRevision, setPluginRevision] = useState(0)
  const [connectorRevision, setConnectorRevision] = useState(0)
  const [skillRevision, setSkillRevision] = useState(0)
  const [pluginsVisited, setPluginsVisited] = useState(false)
  const reload = useCallback(() => {
    setError('')
    setPermissionRevision((value) => value + 1)
    if (kind === 'plugins') setPluginRevision((value) => value + 1)
    else if (kind === 'connectors') setConnectorRevision((value) => value + 1)
    else if (kind === 'skills') setSkillRevision((value) => value + 1)
    else void cache.load(kind, true)
  }, [cache, kind])
  useEffect(() => {
    // Only these tabs track access or installation changes on ordinary window activation.
    if (kind === 'experts' || kind === 'applications' || kind === 'skills') return subscribeAppActivation(reload)
  }, [kind, reload])
  useEffect(() => {
    setCategory('all')
    setSource('all')
    setBusinessAreaId(null)
    setSearch('')
    setNotice('')
    setError('')
    if (kind === 'plugins') setPluginsVisited(true)
    else if (isCatalogDataKind(kind)) void cache.load(kind)
  }, [cache, kind])
  useEffect(() => {
    if (!templateId) return
    let active = true
    setKind('templates')
    void invoke('templateCatalogItem', { id: templateId })
      .then((item) => {
        if (active) {
          setSelected(item)
          setInstallingTemplate(false)
        }
      })
      .catch((error) => {
        if (active) setError(String(error))
      })
    return () => {
      active = false
    }
  }, [templateId])
  const sourceItems =
    kind === 'templates'
      ? sortTemplateSources(items).filter((item) => source === 'all' || templateSource(item) === source)
      : items
  const sourceGroups = kind === 'templates' ? templateSourceGroups(items) : []
  const filtered = sourceItems.filter(
    (item) =>
      matchesBusinessArea(item, kind === 'experts' ? businessAreaId : null) &&
      (category === 'all' || item.categories.includes(category)) &&
      `${item.name} ${item.description} ${item.publisher} ${item.tags.map(categoryLabel).join(' ')}`
        .toLowerCase()
        .includes(search.trim().toLowerCase())
  )
  const businessAreas = catalogBusinessAreas(items)
  const categories =
    kind === 'templates'
      ? [...new Set(sourceItems.flatMap((item) => item.categories))].map((id) => [id, categoryLabel(id)])
      : businessCategories
  const use = async (id: string) => {
    setBusy(true)
    setError('')
    try {
      await onUse(id)
    } catch (error) {
      setError(error instanceof Error ? error.message : t('Could not open the assistant.'))
    } finally {
      setBusy(false)
    }
  }
  const open = (item: CatalogItem) => {
    setNotice('')
    setInstallingTemplate(false)
    if (item.kind === 'experts' && canUseExpert(item)) void use(item.id)
    else if (item.kind === 'applications' && item.status === 'ready' && item.botId) void use(item.botId)
    else setSelected(item)
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(780px,calc(100dvh-64px))] w-[calc(100%-48px)] max-w-none flex-col gap-0 overflow-hidden rounded-xl p-0 sm:max-w-[1180px]"
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault()
        }}
        onInteractOutside={(event) => {
          if (busy) event.preventDefault()
        }}
      >
        <DialogHeader className="flex-row items-start gap-3 px-6 pt-6 pb-5 text-left">
          {selected && (
            <Button
              variant="ghost"
              size="icon"
              className="-ml-2 size-9 shrink-0"
              aria-label={t('Back to catalog')}
              disabled={busy}
              onClick={() => {
                setSelected(null)
                setCreating(false)
                if (isCatalogDataKind(kind)) void cache.load(kind)
              }}
            >
              <ArrowLeft />
            </Button>
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <DialogTitle className="text-xl">{selected ? selected.name : t('Discover & add')}</DialogTitle>
            <DialogDescription className="truncate">
              {selected
                ? creating
                  ? t('Choose a workspace, model and capabilities')
                  : selected.kind === 'templates' && !installingTemplate
                    ? t('Assistant template')
                    : statusLabel(selected)
                : t('Discover resources for {{organization}}', { organization })}
            </DialogDescription>
          </div>
          {(kind !== 'plugins' || selected) && (
            <div className="flex min-w-0 max-w-[45%] shrink-0 flex-col items-end gap-1 text-sm">
              <div className="flex h-9 min-w-0 max-w-full items-center gap-2">
                <span className="shrink-0 text-muted-foreground">{t('Workspace')}</span>
                {workspace ? (
                  <span className="truncate font-medium" title={workspace.name}>
                    {workspace.name}
                  </span>
                ) : (
                  <CatalogCombobox
                    items={writable}
                    value=""
                    label={t(connectorTab ? 'Select a workspace you manage' : 'Select a workspace you can edit')}
                    searchLabel={t('Search workspaces')}
                    onChange={onWorkspace}
                    disabled={busy || workspacesLoading || !writable.length}
                  />
                )}
              </div>
              {!connectorTab && workspace && !workspace.canWrite && (
                <span className="text-muted-foreground">{t('You do not have edit access to this workspace.')}</span>
              )}
              {workspaceError ? (
                <span role="alert" className="text-destructive">
                  {workspaceError}{' '}
                  <Button size="sm" variant="ghost" onClick={retryWorkspaces}>
                    {t('Retry')}
                  </Button>
                </span>
              ) : (
                !connectorTab &&
                !workspace &&
                !workspacesLoading &&
                !writable.length && (
                  <span className="text-muted-foreground">
                    {t('No writable workspace is available. Create one in Xpert or request edit access.')}
                  </span>
                )
              )}
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="-mr-2 size-9 shrink-0"
            aria-label={t('Close discovery')}
            disabled={busy}
            onClick={onClose}
          >
            <X />
          </Button>
        </DialogHeader>
        {permissionError && (
          <div role="alert" className="flex items-center gap-2 px-6 text-sm text-destructive">
            {t('Could not check plugin installation access.')} {permissionError}
            <Button size="sm" variant="ghost" onClick={() => setPermissionRevision((value) => value + 1)}>
              {t('Retry')}
            </Button>
          </div>
        )}
        {selected?.kind === 'templates' && !creating && !installingTemplate && (
          <TemplateOverview
            key={`${organizationId}:${selected.id}`}
            id={selected.id}
            onInstall={() => setInstallingTemplate(true)}
          />
        )}
        {selected && (selected.kind !== 'templates' || creating || installingTemplate) && (
          <CatalogSetup
            workspaceId={workspace?.canWrite && !writesPaused ? workspace.id : ''}
            installationScope={installationScope}
            organizationId={organizationId}
            key={selected.id}
            item={selected}
            creation={creating}
            webUrl={webUrl}
            onBusy={setBusy}
            onUse={onUse}
            onItemUpdated={cache.update}
            onRequested={() => {
              setSelected(null)
              setNotice(t('Request submitted. Check its approval status in the experts list.'))
            }}
            onInstalled={() => {
              cache.invalidate('experts')
              if (selected.kind === 'templates') onTemplateCreated()
              if (selected.kind === 'applications') cache.invalidate('applications')
              setPluginRevision((value) => value + 1)
            }}
          />
        )}
        <Tabs
          hidden={!!selected}
          className={selected ? 'hidden' : 'min-h-0 flex-1 gap-0'}
          value={kind}
          onValueChange={(value) => {
            if (
              value === 'experts' ||
              value === 'applications' ||
              (value === 'plugins' && canInstall) ||
              value === 'connectors' ||
              value === 'skills' ||
              value === 'templates'
            )
              setKind(value)
          }}
        >
          <TabsHeader className="justify-between gap-2 px-6">
            <TabsList variant="line" className="min-w-0 justify-start gap-2 overflow-x-auto lg:gap-3">
              {tabs
                .filter((tab) => tab.id !== 'plugins' || canInstall)
                .map((tab) => (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    disabled={busy}
                    className="shrink-0 px-1 text-base data-[state=active]:text-accent-foreground lg:text-lg"
                  >
                    {t(tab.label)}
                    {kind === tab.id && isCatalogDataKind(kind) && !loading && (
                      <span className="ml-1 text-sm font-normal text-muted-foreground">{items.length}</span>
                    )}
                  </TabsTrigger>
                ))}
            </TabsList>
            <div className="flex min-w-0 items-center gap-2">
              {kind === 'experts' && (
                <Button
                  disabled={busy}
                  onClick={() => {
                    setCreating(true)
                    setSelected(blankAssistant())
                  }}
                >
                  <Plus className="size-4" />
                  {t('New digital expert')}
                </Button>
              )}
              <div className="relative min-w-0 w-44 max-w-full lg:w-64">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  aria-label={t('Search catalog')}
                  placeholder={t('Search names, use cases or capabilities')}
                  className="pl-9"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('Refresh catalog')}
                disabled={loading || busy}
                onClick={() => void reload()}
              >
                <RefreshCw className={loading ? 'animate-spin' : ''} />
              </Button>
            </div>
          </TabsHeader>
          <TabsContent
            value="plugins"
            forceMount
            hidden={kind !== 'plugins'}
            className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
          >
            {canInstall && pluginsVisited && (
              <PluginCatalog
                key={locale}
                organizationId={organizationId}
                organization={organization}
                search={search}
                revision={pluginRevision}
                onDenied={() => {
                  setCanInstall(false)
                  setPluginsVisited(false)
                }}
              />
            )}
          </TabsContent>
          {connectorTab && (
            <TabsContent value="connectors" className="min-h-0 flex-1 overflow-y-auto bg-muted/20 px-6 py-4">
              {!workspace || !workspace.canManage || writesPaused ? (
                <p role="status" className="py-10 text-center text-sm text-muted-foreground">
                  {t(
                    workspacesLoading
                      ? 'Loading…'
                      : workspaceError
                        ? 'Could not load workspaces.'
                        : !workspace && writable.length
                          ? 'Select a workspace to configure connectors.'
                          : 'Workspace management permission is required.'
                  )}
                </p>
              ) : (
                <WorkspaceConnectors
                  key={JSON.stringify([locale, organizationId, workspace.id])}
                  target={target}
                  search={search}
                  revision={connectorRevision}
                  webUrl={webUrl}
                />
              )}
            </TabsContent>
          )}
          {kind === 'skills' && (
            <TabsContent value="skills" className="flex min-h-0 flex-1 flex-col">
              <SkillsCatalog
                key={JSON.stringify([locale, target.workspaceId, readOnly, search, skillRevision])}
                search={search.trim()}
                revision={skillRevision}
                target={target}
                readOnly={readOnly}
                writesPaused={writesPaused}
              />
            </TabsContent>
          )}
          {isCatalogDataKind(kind) && (
            <TabsContent
              value={kind}
              className="min-h-0 flex-1 overflow-y-auto bg-muted/20 px-6 py-5 [scrollbar-gutter:stable]"
            >
              {kind === 'templates' && (
                <div role="group" aria-label={t('Template sources')} className="mb-4 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    aria-pressed={source === 'all'}
                    className={source === 'all' ? 'bg-accent text-accent-foreground' : ''}
                    onClick={() => {
                      setSource('all')
                      setCategory('all')
                    }}
                  >
                    {t('All')} {items.length}
                  </Button>
                  {sourceGroups.map((group) => (
                    <Button
                      key={group.source}
                      variant="outline"
                      size="sm"
                      aria-pressed={source === group.source}
                      className={source === group.source ? 'bg-accent text-accent-foreground' : ''}
                      onClick={() => {
                        setSource(source === group.source ? 'all' : group.source)
                        setCategory('all')
                      }}
                    >
                      {t(templateSourceLabels[group.source])} {group.count}
                    </Button>
                  ))}
                </div>
              )}
              <div
                role="group"
                aria-label={t('Catalog categories')}
                className="mb-5 flex items-center gap-1 overflow-x-auto pb-1"
              >
                <Button
                  variant="ghost"
                  size="sm"
                  aria-pressed={category === 'all' && !businessAreaId}
                  className={`shrink-0 ${category === 'all' && !businessAreaId ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}
                  onClick={() => {
                    setBusinessAreaId(null)
                    setCategory('all')
                  }}
                >
                  {t('All')}
                </Button>
                {kind === 'experts' &&
                  businessAreas.map((area) => (
                    <Button
                      key={area.id}
                      variant="ghost"
                      size="sm"
                      title={`${t('Business domains')}: ${area.name}`}
                      aria-pressed={businessAreaId === area.id}
                      className={`shrink-0 ${businessAreaId === area.id ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}
                      onClick={() => setBusinessAreaId(businessAreaId === area.id ? null : area.id)}
                    >
                      {area.name}
                    </Button>
                  ))}
                {categories.map(([id, label]) => (
                  <Button
                    key={id}
                    variant="ghost"
                    size="sm"
                    title={`${t('Marketplace categories')}: ${t(label)}`}
                    aria-pressed={category === id}
                    className={`shrink-0 ${category === id ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}
                    onClick={() => setCategory(category === id ? 'all' : id)}
                  >
                    {t(label)}{' '}
                    {kind === 'templates' && sourceItems.filter((item) => item.categories.includes(id)).length}
                  </Button>
                ))}
              </div>
              {loadingMore && (
                <div role="status" className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin" />
                  {t('Loading {{section}}…', { section: t('Agent templates') })}
                </div>
              )}
              {(error || loadError) && (
                <div
                  role="alert"
                  className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                >
                  {t(error || loadError)}
                </div>
              )}
              {notice && (
                <div role="status" className="mb-4 rounded-lg bg-accent p-3 text-sm text-accent-foreground">
                  {notice}
                </div>
              )}
              {loading && !items.length && kind === 'applications' ? (
                <div
                  role="status"
                  aria-label={t('Loading {{section}}…', { section: t('Apps') })}
                  className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))] gap-4"
                >
                  {Array.from({ length: 6 }, (_, index) => (
                    <div
                      key={index}
                      className="aspect-video min-h-[calc(2*var(--desktop-row-padding,10px)+8.25rem+3px)] animate-pulse rounded-xl bg-muted motion-reduce:animate-none"
                    />
                  ))}
                </div>
              ) : loading && !items.length ? (
                <div
                  role="status"
                  className="flex h-56 items-center justify-center gap-2 text-sm text-muted-foreground"
                >
                  <LoaderCircle className="size-5 animate-spin" />
                  {t('Loading {{section}}…', { section: t(tabs.find((tab) => tab.id === kind)?.label || '') })}
                </div>
              ) : filtered.length ? (
                <div
                  className={`grid gap-4 ${kind === 'applications' ? 'grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))]' : 'grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))]'}`}
                  aria-busy={busy || loading || loadingMore}
                >
                  {filtered.map((item) =>
                    item.kind === 'applications' ? (
                      <ApplicationCard
                        key={item.id}
                        item={item}
                        busy={busy}
                        onDetails={() => setSelected(item)}
                        onUse={() => open(item)}
                      />
                    ) : (
                      <article
                        key={item.id}
                        tabIndex={0}
                        aria-label={item.name}
                        className="group/catalog relative isolate flex h-44 flex-col overflow-hidden rounded-xl border bg-background p-4 outline-none transition-shadow hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="mb-2 flex shrink-0 items-start gap-3">
                          <CatalogAvatar item={item} />
                          <div className="min-w-0 flex-1">
                            <h3 className="line-clamp-2 text-base leading-5 font-semibold" title={item.name}>
                              {item.name}
                            </h3>
                            <p className="mt-1 truncate text-xs text-muted-foreground" title={item.publisher}>
                              {item.publisher || 'Xpert'}
                              {item.kind === 'templates' && ` · ${t(templateSourceLabels[templateSource(item)])}`}
                            </p>
                          </div>
                        </div>
                        <p className="mb-2 line-clamp-2 shrink-0 text-sm leading-5 text-muted-foreground">
                          {item.description || t('Explore this assistant and start a new chat.')}
                        </p>
                        <div className="mt-auto flex shrink-0 flex-nowrap gap-1.5 overflow-hidden">
                          {item.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              title={categoryLabel(tag)}
                              className="min-w-0 truncate rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
                            >
                              {categoryLabel(tag)}
                            </span>
                          ))}
                        </div>
                        <div
                          data-slot="catalog-card-actions"
                          className="pointer-events-none absolute bottom-0 left-0 flex w-full translate-y-2 items-center justify-between gap-2 border-t bg-background px-4 py-3 opacity-0 transition-[opacity,transform] duration-150 group-hover/catalog:pointer-events-auto group-hover/catalog:translate-y-0 group-hover/catalog:opacity-100 group-focus-within/catalog:pointer-events-auto group-focus-within/catalog:translate-y-0 group-focus-within/catalog:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:translate-y-0 [@media(hover:none)]:opacity-100"
                        >
                          <span className="text-xs text-muted-foreground">{statusLabel(item)}</span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="shrink-0 hover:border-primary/50 hover:text-accent-foreground"
                            disabled={busy || (item.kind === 'experts' && item.access === 'requested')}
                            onClick={() => open(item)}
                          >
                            {item.kind === 'templates' ? t('View template') : actionLabel(item)}
                            <ArrowUpRight className="size-3.5" />
                          </Button>
                        </div>
                      </article>
                    )
                  )}
                </div>
              ) : (
                <div className="flex h-56 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                  <Search className="size-7" />
                  <p>
                    {search || category !== 'all' || businessAreaId
                      ? t('No matching results')
                      : t('No content available for this organization')}
                  </p>
                  {(search || category !== 'all' || businessAreaId) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSearch('')
                        setCategory('all')
                        setBusinessAreaId(null)
                      }}
                    >
                      {t('Clear filters')}
                    </Button>
                  )}
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
