import { t } from './i18n'
import { useCallback, useEffect, useRef, useState } from 'react'
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
  TabsList,
  TabsTrigger
} from '@xpert-ai/shadcn-ui'
import { ArrowLeft, ArrowUpRight, Layers, LoaderCircle, RefreshCw, Search, X } from 'lucide-react'
import { BotAvatar } from './Sidebar'
import { CatalogSetup } from './CatalogSetup'
import { invoke } from './host'
import { actionLabel, businessCategories, canUseExpert, categoryLabel, statusLabel } from './catalog-labels'
import type { CatalogItem, CatalogKind } from './catalog-types'

const tabs: { id: CatalogKind; label: string }[] = [
  { id: 'experts', label: 'Experts' },
  { id: 'applications', label: 'Apps' },
  { id: 'templates', label: 'Agent templates' }
]

export function CatalogDialog({
  organization,
  webUrl,
  onClose,
  onUse
}: {
  organization: string
  webUrl: string
  onClose: () => void
  onUse: (botId: string) => Promise<void>
}) {
  const [kind, setKind] = useState<CatalogKind>('experts')
  const [items, setItems] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [selected, setSelected] = useState<CatalogItem | null>(null)
  const [busy, setBusy] = useState(false)
  const version = useRef(0)
  const reload = useCallback(async () => {
    const current = ++version.current
    setLoading(true)
    setError('')
    try {
      const result = await invoke('listCatalog', kind)
      if (current === version.current) setItems(result)
    } catch (error) {
      if (current === version.current)
        setError(error instanceof Error ? error.message : t('Could not load the catalog.'))
    } finally {
      if (current === version.current) setLoading(false)
    }
  }, [kind])
  useEffect(() => {
    setItems([])
    setCategory('all')
    setSearch('')
    setNotice('')
    void reload()
    return () => {
      version.current++
    }
  }, [reload])
  const filtered = items.filter(
    (item) =>
      (category === 'all' || item.categories.includes(category)) &&
      `${item.name} ${item.description} ${item.publisher} ${item.tags.map(categoryLabel).join(' ')}`
        .toLowerCase()
        .includes(search.trim().toLowerCase())
  )
  const categories =
    kind === 'templates'
      ? [...new Set(items.flatMap((item) => item.categories))].map((id) => [id, categoryLabel(id)])
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
                void reload()
              }}
            >
              <ArrowLeft />
            </Button>
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <DialogTitle className="text-xl">{selected ? selected.name : t('Discover & add')}</DialogTitle>
            <DialogDescription className="truncate">
              {selected
                ? statusLabel(selected)
                : t('Add experts, apps and assistants to {{organization}}', { organization })}
            </DialogDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="-mr-2 -mt-2 size-9"
            aria-label={t('Close discovery')}
            disabled={busy}
            onClick={onClose}
          >
            <X />
          </Button>
        </DialogHeader>
        {selected ? (
          <CatalogSetup
            key={selected.id}
            item={selected}
            webUrl={webUrl}
            onBusy={setBusy}
            onUse={onUse}
            onRequested={(updated) => {
              setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)))
              setSelected(null)
              setNotice(t('Request submitted. Check its approval status in the experts list.'))
            }}
          />
        ) : (
          <Tabs
            className="min-h-0 flex-1 gap-0"
            value={kind}
            onValueChange={(value) => {
              if (value === 'experts' || value === 'applications' || value === 'templates') setKind(value)
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 pb-3">
              <TabsList variant="line" className="gap-3 p-0">
                {tabs.map((tab) => (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    disabled={busy}
                    className="px-1 text-lg data-[state=active]:text-accent-foreground"
                  >
                    {t(tab.label)}
                    {kind === tab.id && !loading && (
                      <span className="ml-1 text-sm font-normal text-muted-foreground">{items.length}</span>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
              <div className="flex min-w-0 items-center gap-2">
                <div className="relative w-64 max-w-full">
                  <Search className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground" />
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
            </div>
            <TabsContent
              value={kind}
              className="min-h-0 flex-1 overflow-y-auto bg-muted/20 px-6 py-5 [scrollbar-gutter:stable]"
            >
              <div aria-label={t('Catalog categories')} className="mb-5 flex flex-wrap gap-1">
                {[['all', t('All')], ...categories].map(([id, label]) => (
                  <Button
                    key={id}
                    variant="ghost"
                    size="sm"
                    aria-pressed={category === id}
                    className={category === id ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}
                    onClick={() => setCategory(id)}
                  >
                    {t(label)}
                  </Button>
                ))}
              </div>
              {error && (
                <div
                  role="alert"
                  className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                >
                  {error}
                </div>
              )}
              {notice && (
                <div role="status" className="mb-4 rounded-lg bg-accent p-3 text-sm text-accent-foreground">
                  {notice}
                </div>
              )}
              {loading ? (
                <div
                  role="status"
                  className="flex h-56 items-center justify-center gap-2 text-sm text-muted-foreground"
                >
                  <LoaderCircle className="size-5 animate-spin" />
                  {t('Loading {{section}}…', { section: t(tabs.find((tab) => tab.id === kind)?.label || '') })}
                </div>
              ) : filtered.length ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-4" aria-busy={busy}>
                  {filtered.map((item) => (
                    <article
                      key={item.id}
                      className="flex min-h-64 flex-col rounded-xl border bg-background p-5 transition-shadow hover:shadow-sm"
                    >
                      <div className="mb-5 flex items-start gap-3">
                        {item.kind === 'applications' ? (
                          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-accent-foreground">
                            <Layers className="size-6" />
                          </span>
                        ) : (
                          <BotAvatar bot={item} />
                        )}
                        <div className="min-w-0 flex-1">
                          <h3 className="line-clamp-2 text-base leading-6 font-semibold" title={item.name}>
                            {item.name}
                          </h3>
                          <p className="mt-1 truncate text-xs text-muted-foreground" title={item.publisher}>
                            {item.publisher || 'Xpert'}
                          </p>
                        </div>
                      </div>
                      <p className="mb-5 line-clamp-3 text-sm leading-6 text-muted-foreground">
                        {item.description || t('Explore this assistant and start a new chat.')}
                      </p>
                      <div className="mt-auto flex flex-wrap gap-1.5 pb-4">
                        {item.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                            {categoryLabel(tag)}
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center justify-between gap-2 border-t pt-3">
                        <span className="text-xs text-muted-foreground">{statusLabel(item)}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0 hover:border-primary/50 hover:text-accent-foreground"
                          disabled={busy || (item.kind === 'experts' && item.access === 'requested')}
                          onClick={() => open(item)}
                        >
                          {actionLabel(item)}
                          <ArrowUpRight className="size-3.5" />
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="flex h-56 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                  <Search className="size-7" />
                  <p>
                    {search || category !== 'all'
                      ? t('No matching results')
                      : t('No content available for this organization')}
                  </p>
                  {(search || category !== 'all') && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSearch('')
                        setCategory('all')
                      }}
                    >
                      {t('Clear filters')}
                    </Button>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}
