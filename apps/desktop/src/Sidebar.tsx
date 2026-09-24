import { t } from './i18n'
import { useEffect, useRef, useState } from 'react'
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@xpert-ai/shadcn-ui'
import {
  Bot as BotIcon,
  ArrowLeft,
  ArrowRight,
  LoaderCircle,
  PanelLeft,
  Plus,
  RefreshCw,
  Search,
  X
} from 'lucide-react'
import { avatarEmoji } from './avatar'
import { UserMenu } from './UserMenu'
import type { AppState, Bot } from './types'

export function BotAvatar({ bot }: { bot: Bot }) {
  const [failedUrl, setFailedUrl] = useState('')
  const emoji = avatarEmoji(bot.avatarEmoji)
  return (
    <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-accent-foreground">
      {bot.avatarUrl && failedUrl !== bot.avatarUrl ? (
        <img
          src={bot.avatarUrl}
          alt=""
          className="size-full object-cover"
          onError={() => setFailedUrl(bot.avatarUrl!)}
        />
      ) : emoji ? (
        <span aria-hidden="true" className="text-2xl leading-none">
          {emoji}
        </span>
      ) : (
        <BotIcon className="size-5" />
      )}
    </span>
  )
}

export function Sidebar({
  state,
  bots,
  selected,
  pending,
  error,
  onSelect,
  onRefresh,
  onOrganization,
  onSettings,
  onBrowse,
  onLogout
}: {
  state: AppState
  bots: Bot[]
  selected: string | null
  pending: boolean
  error: string
  onSelect: (id: string) => void
  onRefresh: () => void
  onOrganization: (id: string) => void
  onSettings: () => void
  onBrowse: () => void
  onLogout: () => void
}) {
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [history, setHistory] = useState<{ ids: string[]; index: number }>({ ids: [], index: -1 })
  const searchInput = useRef<HTMLInputElement>(null)
  const searchButton = useRef<HTMLButtonElement>(null)
  const profile = state.profile!
  const organization = profile.organizations.find((org) => org.id === profile.organizationId)
  const filtered = bots.filter((bot) => `${bot.name} ${bot.description}`.toLowerCase().includes(query.toLowerCase()))
  const isMac = window.xpertDesktop?.platform === 'darwin'
  useEffect(() => {
    window.xpertDesktop?.setSidebarCollapsed?.(collapsed)
  }, [collapsed])
  useEffect(() => () => window.xpertDesktop?.setSidebarCollapsed?.(false), [])
  useEffect(() => {
    if (!selected) return
    setHistory((current) => {
      if (current.ids[current.index] === selected) return current
      const ids = [...current.ids.slice(0, current.index + 1), selected].slice(-50)
      return { ids, index: ids.length - 1 }
    })
  }, [selected])
  useEffect(() => {
    if (searchOpen && !collapsed) searchInput.current?.focus()
  }, [searchOpen, collapsed])
  const canNavigate = (offset: number) => !pending && bots.some((bot) => bot.id === history.ids[history.index + offset])
  const navigate = (offset: number) => {
    if (!canNavigate(offset)) return
    const index = history.index + offset
    setHistory({ ...history, index })
    onSelect(history.ids[index])
  }
  const closeSearch = () => {
    setQuery('')
    setSearchOpen(false)
    searchButton.current?.focus()
  }
  return (
    <aside
      aria-label={t('Bot navigation')}
      className={`flex h-full shrink-0 flex-col border-r bg-muted/35 ${collapsed ? 'w-[72px]' : 'w-[360px] max-[1100px]:w-[268px]'}`}
    >
      <div
        className={`window-drag flex shrink-0 gap-1 text-muted-foreground ${collapsed ? `justify-center ${isMac ? 'h-[88px] items-end pb-2' : 'h-[48px] items-center'}` : `h-[48px] items-center pr-4 ${isMac ? 'pt-[2px] pl-[88px]' : 'pl-5'}`}`}
      >
        <Button
          size="icon"
          variant="ghost"
          className="size-8 shrink-0"
          aria-label={collapsed ? t('Expand sidebar') : t('Collapse sidebar')}
          aria-expanded={!collapsed}
          aria-controls="bot-sidebar-content"
          title={collapsed ? t('Expand sidebar') : t('Collapse sidebar')}
          onClick={() => setCollapsed(!collapsed)}
        >
          <PanelLeft className="size-4" />
        </Button>
        {!collapsed && (
          <>
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              aria-label={t('Back to previous Bot')}
              title={t('Back to previous Bot')}
              disabled={!canNavigate(-1)}
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              aria-label={t('Forward to next Bot')}
              title={t('Forward to next Bot')}
              disabled={!canNavigate(1)}
              onClick={() => navigate(1)}
            >
              <ArrowRight className="size-4" />
            </Button>
          </>
        )}
      </div>
      {collapsed && (
        <div className="flex min-h-0 flex-1 flex-col items-center">
          <Button
            size="icon"
            variant="ghost"
            className="mb-2 size-8 shrink-0 text-muted-foreground"
            aria-label={t('Search Bots')}
            title={t('Search Bots')}
            onClick={() => {
              setCollapsed(false)
              setSearchOpen(true)
            }}
          >
            <Search className="size-[18px]" />
          </Button>
          <nav
            aria-label={t('Assistant avatars')}
            className="flex min-h-0 w-full flex-1 flex-col items-center gap-1 overflow-y-auto px-1 py-2 [scrollbar-width:thin]"
          >
            {pending && (
              <span
                role="status"
                aria-label={t('Loading assistants')}
                className="flex size-14 shrink-0 items-center justify-center"
              >
                <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
              </span>
            )}
            {!pending && error && (
              <Button
                size="icon"
                variant="ghost"
                className="size-12 shrink-0"
                aria-label={t('Reload assistants')}
                title={error}
                onClick={onRefresh}
              >
                <RefreshCw />
              </Button>
            )}
            {!pending &&
              !error &&
              bots.map((bot) => (
                <button
                  key={bot.id}
                  aria-label={bot.name}
                  title={`${bot.name}${bot.description ? ` · ${bot.description}` : ''}`}
                  aria-current={selected === bot.id ? 'page' : undefined}
                  onClick={() => onSelect(bot.id)}
                  className={`flex size-14 shrink-0 items-center justify-center rounded-2xl transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${selected === bot.id ? 'bg-primary/15 ring-1 ring-primary/40 ring-inset' : 'hover:bg-muted'}`}
                >
                  <BotAvatar bot={bot} />
                </button>
              ))}
            {!pending && !error && (
              <Button
                size="icon"
                variant="ghost"
                className="size-12 shrink-0"
                aria-label={t('Discover & add')}
                title={t('Discover experts, apps and agent templates')}
                onClick={onBrowse}
              >
                <Plus />
              </Button>
            )}
          </nav>
          <div className="flex w-full shrink-0 justify-center border-t py-3">
            <UserMenu
              profile={profile}
              webUrl={state.config.webUrl}
              compact
              onSettings={onSettings}
              onLogout={onLogout}
            />
          </div>
        </div>
      )}
      <div id="bot-sidebar-content" className={collapsed ? 'hidden' : 'flex min-h-0 flex-1 flex-col'}>
        <div className="shrink-0 px-5">
          <div className="-ml-2 flex min-w-0 items-center gap-2">
            <Select
              value={profile.organizationId || undefined}
              onValueChange={onOrganization}
              disabled={pending || !profile.organizations.length}
            >
              <SelectTrigger
                className="min-w-0 max-w-[calc(100%-40px)] justify-start gap-1.5 border-0 px-2 text-lg leading-6 font-semibold tracking-tight shadow-none hover:bg-muted data-[size=default]:h-10 dark:bg-transparent dark:hover:bg-muted [&>[data-slot=select-value]]:block [&>[data-slot=select-value]]:truncate"
                aria-label={t('Switch organization')}
                title={organization?.name || t('No organization')}
              >
                <SelectValue placeholder={t('No organization')} />
              </SelectTrigger>
              <SelectContent position="popper" align="start" className="max-w-[320px]">
                {profile.organizations.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              ref={searchButton}
              size="icon"
              variant="ghost"
              className="ml-auto size-8 shrink-0 text-muted-foreground"
              aria-label={searchOpen ? t('Close search') : t('Search Bots')}
              title={searchOpen ? t('Close search') : t('Search Bots')}
              aria-expanded={searchOpen}
              aria-controls="bot-search"
              onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
            >
              {searchOpen ? <X className="size-[18px]" /> : <Search className="size-[18px]" />}
            </Button>
          </div>
          {searchOpen && (
            <div id="bot-search" className="relative mt-3">
              <Search className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground" />
              <Input
                ref={searchInput}
                aria-label={t('Search Bots')}
                placeholder={t('Search Bots')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') closeSearch()
                }}
                className="h-10 bg-background/60 pl-9 shadow-none"
              />
            </div>
          )}
          <div className="mt-4 mb-2 flex items-center justify-between">
            <h2 className="text-[0.8125rem] leading-5 font-medium text-muted-foreground">
              {t('My Bots')}
              <span className="ml-1 text-xs font-normal">{bots.length || ''}</span>
            </h2>
            <div className="flex">
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                aria-label={t('Refresh Bots')}
                title={t('Refresh Bots')}
                disabled={pending}
                onClick={onRefresh}
              >
                <RefreshCw className={pending ? 'animate-spin' : ''} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                aria-label={t('Discover & add')}
                title={t('Discover experts, apps and agent templates')}
                onClick={onBrowse}
              >
                <Plus />
              </Button>
            </div>
          </div>
        </div>
        <nav
          aria-label={t('My Bots')}
          className="min-h-0 flex-1 space-y-[var(--desktop-row-gap)] overflow-y-auto px-3 pb-2"
        >
          {pending && (
            <p role="status" className="flex items-center gap-2 px-3 py-5 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" />
              {t('Loading Bots…')}
            </p>
          )}
          {error && (
            <div className="px-3 py-4">
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
              <Button variant="outline" size="sm" className="mt-3" onClick={onRefresh}>
                {t('Retry')}
              </Button>
            </div>
          )}
          {!pending &&
            !error &&
            filtered.map((bot) => (
              <button
                key={bot.id}
                onClick={() => onSelect(bot.id)}
                aria-current={selected === bot.id ? 'page' : undefined}
                className={`flex w-full items-center gap-[var(--desktop-avatar-gap)] rounded-xl px-2 py-[var(--desktop-row-padding)] text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected === bot.id ? 'bg-primary/10' : 'hover:bg-muted'}`}
              >
                <BotAvatar bot={bot} />
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-sm leading-5 ${selected === bot.id ? 'font-semibold' : 'font-medium'}`}
                  >
                    {bot.name}
                  </span>
                  <span className="mt-0.5 block truncate text-[0.8125rem] leading-5 text-muted-foreground">
                    {bot.description || t('Start a chat with this Bot')}
                  </span>
                </span>
              </button>
            ))}
          {!pending && !error && !filtered.length && (
            <p className="px-3 py-6 text-sm leading-6 text-muted-foreground">
              {query
                ? t('No matching Bots.')
                : t('No Bots are available in this workspace. Publish an assistant in Xpert, then refresh.')}
            </p>
          )}
        </nav>
        <div className="shrink-0 px-4 pb-3">
          <div className="mt-2 border-t pt-2">
            <UserMenu profile={profile} webUrl={state.config.webUrl} onSettings={onSettings} onLogout={onLogout} />
          </div>
        </div>
      </div>
    </aside>
  )
}
