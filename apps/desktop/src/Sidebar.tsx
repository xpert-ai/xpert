import { t } from './i18n'
import { useEffect, useRef, useState } from 'react'
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@xpert-ai/shadcn-ui'
import { ArrowLeft, ArrowRight, LoaderCircle, PanelLeft, Plus, RefreshCw, Search, X } from 'lucide-react'
import { AssistantItem, type AssistantAction } from './AssistantItems'
import { AssistantDialog } from './AssistantDialog'
import { useAssistantList } from './useAssistantList'
import { assistantRows, type AssistantRow } from './assistant-list-model'
import { SidebarResizer } from './SidebarResizer'
import type { ConversationNotice } from './assistant-list-types'
import { invoke } from './host'
import { UserMenu } from './UserMenu'
import type { AppState, Bot } from './types'

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
  onLogout,
  notice,
  onBotSaved
}: {
  state: AppState
  bots: Bot[]
  selected: string | null
  pending: boolean
  error: string
  onSelect: (id: string, threadId?: string | null) => void
  onRefresh: () => void
  onOrganization: (id: string) => void
  onSettings: () => void
  onBrowse: () => void
  onLogout: () => void
  notice?: ConversationNotice
  onBotSaved: (id: string) => Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const list = useAssistantList(
    `${state.config.apiUrl}:${state.profile?.user.id}:${state.profile?.organizationId}`,
    bots.map((bot) => bot.id).join(','),
    notice
  )
  const collapsed = list.sidebar.collapsed
  const [dialog, setDialog] = useState<{ bot: Bot; mode: 'edit' | 'duplicate' | 'section' } | null>(null)
  const [feedback, setFeedback] = useState('')
  const setLayout = (width: number, collapsed: boolean) =>
    list.setSidebar((current) => ({ ...current, width, collapsed }))
  const saveLayout = (width: number, collapsed: boolean) =>
    void list.run(() => list.update({ action: 'layout', width, collapsed }))
  const setCollapsed = (value: boolean) => {
    setLayout(list.sidebar.width, value)
    saveLayout(list.sidebar.width, value)
  }
  const rows = assistantRows(bots, list.sidebar, list.activities, query)
  const pinned = rows.filter((row) => !!row.preference?.pinnedAt)
  const unpinned = rows.filter((row) => !row.preference?.pinnedAt)
  const selectRow = (row: AssistantRow) => {
    if (row.preference?.unreadAt)
      void list.run(() => list.update({ action: 'unread', botId: row.bot.id, unread: false }))
    onSelect(row.bot.id, row.activity?.latestUnreadThreadId || row.activity?.latestConversationThreadId || null)
  }
  const action = (row: AssistantRow, action: AssistantAction) => {
    if (action === 'edit' || action === 'duplicate' || action === 'section') {
      setDialog({ bot: row.bot, mode: action })
      return
    }
    void list.run(async () => {
      if (action === 'pin') await list.update({ action: 'pin', botId: row.bot.id, pinned: !row.preference?.pinnedAt })
      if (action === 'unread') {
        if (row.unread) {
          list.setSidebar(await invoke('markAllBotRead', row.bot.id))
          await list.refresh()
        } else await list.update({ action: 'unread', botId: row.bot.id, unread: true })
      }
      if (action === 'copy') {
        const threadId = notice?.botId === row.bot.id ? notice.threadId : null
        const resolveId = async () => {
          const id = threadId
            ? (await invoke('botConversation', { botId: row.bot.id, threadId })).id
            : row.activity?.latestConversationId
          if (!id) throw new Error(t('No conversation is available yet.'))
          return new Blob([id], { type: 'text/plain' })
        }
        await navigator.clipboard.write([new ClipboardItem({ 'text/plain': resolveId() })])
        setFeedback(t('Conversation ID copied.'))
      }
    })
  }
  const renderRow = (row: AssistantRow, mode: 'list' | 'pinned' | 'compact' = 'list') => (
    <AssistantItem
      key={row.bot.id}
      row={row}
      mode={mode}
      selected={selected}
      sidebar={list.sidebar}
      busy={list.busy}
      onSelect={selectRow}
      onAction={action}
      onMove={(row, sectionId) => void list.run(() => list.update({ action: 'move', botId: row.bot.id, sectionId }))}
    />
  )
  const sections = [
    ...list.sidebar.sections.map((section) => ({
      ...section,
      rows: unpinned.filter((row) => row.preference?.sectionId === section.id)
    })),
    {
      id: '',
      name: t('Unassigned'),
      rows: unpinned.filter(
        (row) =>
          !row.preference?.sectionId ||
          !list.sidebar.sections.some((section) => section.id === row.preference?.sectionId)
      )
    }
  ].sort((a, b) => Number(b.rows.some((row) => row.unread)) - Number(a.rows.some((row) => row.unread)))
  const [history, setHistory] = useState<{ ids: string[]; index: number }>({ ids: [], index: -1 })
  const searchInput = useRef<HTMLInputElement>(null)
  const searchButton = useRef<HTMLButtonElement>(null)
  const profile = state.profile!
  const organization = profile.organizations.find((org) => org.id === profile.organizationId)
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
    const row = assistantRows(bots, list.sidebar, list.activities, '').find((row) => row.bot.id === history.ids[index])
    if (row) selectRow(row)
  }
  const closeSearch = () => {
    setQuery('')
    setSearchOpen(false)
    searchButton.current?.focus()
  }
  return (
    <aside
      aria-label={t('Bot navigation')}
      className="relative flex h-full shrink-0 flex-col border-r bg-muted/35"
      style={{ width: collapsed ? 72 : `min(${list.sidebar.width}px, max(240px, calc(100vw - 360px)))` }}
    >
      {!collapsed && <SidebarResizer width={list.sidebar.width} onChange={setLayout} onCommit={saveLayout} />}
      <div
        className={`window-drag flex shrink-0 gap-1 text-muted-foreground ${collapsed ? `justify-center ${isMac ? 'h-[88px] items-end pb-2' : 'h-[48px] items-center'}` : `h-[48px] items-center pr-4 ${isMac ? 'pt-[2px] pl-[88px]' : 'pl-5'}`}`}
      >
        <Button
          size="icon"
          variant="ghost"
          className={`shrink-0 ${collapsed ? 'size-12' : 'size-8'}`}
          aria-label={collapsed ? t('Expand sidebar') : t('Collapse sidebar')}
          aria-expanded={!collapsed}
          aria-controls="bot-sidebar-content"
          title={collapsed ? t('Expand sidebar') : t('Collapse sidebar')}
          onClick={() => setCollapsed(!collapsed)}
        >
          <PanelLeft className={collapsed ? 'size-5' : 'size-4'} />
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
            className="mb-2 size-12 shrink-0 text-muted-foreground"
            aria-label={t('Search Bots')}
            title={t('Search Bots')}
            onClick={() => {
              setCollapsed(false)
              setSearchOpen(true)
            }}
          >
            <Search className="size-5" />
          </Button>
          <nav
            aria-label={t('Assistant avatars')}
            className="flex min-h-0 w-full flex-1 flex-col items-center gap-1 overflow-y-auto px-1 py-2 [scrollbar-width:thin]"
          >
            {pending && (
              <span
                role="status"
                aria-label={t('Loading assistants')}
                className="flex size-12 shrink-0 items-center justify-center"
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
            {!pending && !error && [...pinned, ...unpinned].map((row) => renderRow(row, 'compact'))}
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
          {list.error && (
            <div className="px-2 py-2 text-xs text-destructive" role="alert">
              {list.error}
              <button className="ml-2 underline" onClick={() => void list.refresh()}>
                {t('Retry')}
              </button>
            </div>
          )}
          {feedback && (
            <p role="status" className="px-2 py-1 text-xs text-muted-foreground" onClick={() => setFeedback('')}>
              {feedback}
            </p>
          )}
          {!pending && !error && pinned.length > 0 && (
            <section aria-label={t('Pinned assistants')} className="mb-3 border-b pb-3">
              <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-1">
                {pinned.map((row) => renderRow(row, 'pinned'))}
              </div>
            </section>
          )}
          {!pending &&
            !error &&
            sections.map(
              (section) =>
                section.rows.length > 0 && (
                  <section key={section.id} aria-label={section.name}>
                    {list.sidebar.sections.length > 0 && (
                      <h3 className="px-2 pt-3 pb-1 text-xs font-medium text-muted-foreground">{section.name}</h3>
                    )}
                    <div className="space-y-[var(--desktop-row-gap)]">{section.rows.map((row) => renderRow(row))}</div>
                  </section>
                )
            )}
          {!pending && !error && !rows.length && (
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
      {dialog && (
        <AssistantDialog
          bot={dialog.bot}
          mode={dialog.mode}
          onClose={() => setDialog(null)}
          onSidebar={list.setSidebar}
          onSaved={async (id) => {
            await onBotSaved(id)
            list.setSidebar(await invoke('sidebarState'))
            await list.refresh()
          }}
        />
      )}
    </aside>
  )
}
