import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, Clock3, FileText, Grid2X2, MessageCircle, Pencil, Pin, PinOff, Puzzle, X } from 'lucide-react'
import type { XpertExtensionViewManifest } from '@xpert-ai/contracts'
import type { AssistantRow } from '../assistant-list-model'
import { assistantStatusLabel } from '../assistant-list-model'
import type { AssistantProfile } from '../assistant-profile-types'
import { BotAvatar } from '../avatar'
import { invoke } from '../host'
import { t, useLocale } from '../i18n'
import { localizedText } from '../../electron/i18n/index.mjs'
import { Button, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../ui'
import { ProfileActivity, ProfileDetails, profileDate } from './NativeProfileTabs'
import { ProfileError, ProfileLoading } from './ProfileState'
import { RemoteProfileView } from './RemoteProfileView'

export function ProfilePanel({
  row,
  pinned,
  onPin,
  onClose,
  onBusy,
  onSelect,
  onEdit
}: {
  row: AssistantRow
  pinned: boolean
  onPin: () => void
  onClose: () => void
  onBusy: (busy: boolean) => void
  onSelect: (threadId?: string | null) => void
  onEdit: () => void
}) {
  const locale = useLocale()
  const id = useId()
  const [profile, setProfile] = useState<AssistantProfile>()
  const [views, setViews] = useState<XpertExtensionViewManifest[]>([])
  const [profileError, setProfileError] = useState('')
  const [viewsError, setViewsError] = useState('')
  const [viewsLoading, setViewsLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  const [active, setActive] = useState('activity')
  const [mounted, setMounted] = useState<string[]>([])
  const busyViews = useRef(new Set<string>())
  const [busy, setBusy] = useState(false)
  const reportBusy = useRef(onBusy)
  reportBusy.current = onBusy
  useEffect(() => () => reportBusy.current(false), [])
  useEffect(() => {
    let disposed = false
    setProfileError('')
    setViewsError('')
    setViewsLoading(true)
    invoke('botProfile', row.bot.id).then(
      (value) => {
        if (!disposed) setProfile(value)
      },
      (error: Error) => {
        if (!disposed) setProfileError(error.message)
      }
    )
    invoke('botProfileViews', row.bot.id)
      .then(
        (value) => {
          if (!disposed) setViews(value)
        },
        (error: Error) => {
          if (!disposed) setViewsError(error.message)
        }
      )
      .finally(() => {
        if (!disposed) setViewsLoading(false)
      })
    return () => {
      disposed = true
    }
  }, [row.bot.id, locale, retry])
  const setViewBusy = (key: string, value: boolean) => {
    if (value) busyViews.current.add(key)
    else busyViews.current.delete(key)
    const next = busyViews.current.size > 0
    setBusy(next)
    reportBusy.current(next)
  }
  const selectTab = (key: string) => {
    if (busyViews.current.size) return
    setActive(key)
    if (key.startsWith('view:')) setMounted((items) => (items.includes(key) ? items : [...items, key]))
  }
  const native = [
    { key: 'activity', label: t('Activity'), Icon: Clock3 },
    { key: 'capabilities', label: t('Capabilities'), Icon: Grid2X2 },
    { key: 'about', label: t('About'), Icon: FileText }
  ]
  const custom = views.map((view) => ({
    key: `view:${view.key}`,
    label: localizedText(view.title, locale) || view.key,
    Icon: Puzzle
  }))
  const featured = custom.find((item) => item.key === active) || custom[0]
  const visibleTabs = [...native, ...(featured ? [featured] : [])]
  const refresh = () => setRetry((value) => value + 1)
  return (
    <>
      <header className="relative shrink-0 px-5 pt-9 pb-4 text-center">
        <div className="absolute top-2 right-2 flex gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground"
            disabled={busy}
            aria-label={t('Open conversation')}
            title={t('Open conversation')}
            onClick={() => onSelect()}
          >
            <MessageCircle className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground"
            aria-label={t(pinned ? 'Unpin profile' : 'Pin profile')}
            aria-pressed={pinned}
            onClick={onPin}
          >
            {pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground"
            disabled={busy}
            aria-label={t('Close profile')}
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </div>
        <div className="flex justify-center">
          <div className="relative">
            <BotAvatar bot={row.bot} size="profile" />
            <Button
              variant="outline"
              size="icon"
              className="absolute -right-1 -bottom-1 size-7 rounded-full bg-popover text-muted-foreground shadow-sm"
              disabled={busy}
              aria-label={t('Edit profile')}
              title={t('Edit profile')}
              onClick={onEdit}
            >
              <Pencil className="size-3.5" />
            </Button>
          </div>
        </div>
        <h2 className="mt-3 truncate text-xl font-semibold tracking-tight" title={row.bot.name}>
          {row.bot.name}
        </h2>
        <p className="mt-1 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <span
            className={`size-1.5 rounded-full ${row.activity?.latestConversationStatus === 'error' ? 'bg-destructive' : 'bg-primary'}`}
          />
          <span>{t(assistantStatusLabel(row.activity))}</span>
          {row.activity?.latestConversationAt && (
            <span>· {profileDate(row.activity.latestConversationAt, locale)}</span>
          )}
        </p>
      </header>
      <div className="flex shrink-0 items-center border-b px-3">
        <div
          role="tablist"
          aria-label={t('Assistant profile')}
          className="flex min-w-0 flex-1"
          onKeyDown={(event) => {
            const index = visibleTabs.findIndex((tab) => tab.key === active)
            const next =
              event.key === 'ArrowRight'
                ? (index + 1) % visibleTabs.length
                : event.key === 'ArrowLeft'
                  ? (index + visibleTabs.length - 1) % visibleTabs.length
                  : event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? visibleTabs.length - 1
                      : -1
            if (next >= 0 && !busy) {
              event.preventDefault()
              selectTab(visibleTabs[next].key)
              document.getElementById(`${id}-${visibleTabs[next].key}`)?.focus()
            }
          }}
        >
          {visibleTabs.map(({ key, label, Icon }) => (
            <button
              key={key}
              role="tab"
              id={`${id}-${key}`}
              aria-controls={`${id}-panel-${key}`}
              aria-selected={active === key}
              tabIndex={active === key ? 0 : -1}
              disabled={busy && active !== key}
              onClick={() => selectTab(key)}
              className={`flex min-w-0 items-center justify-center gap-1 border-b-2 px-2 py-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-50 ${!custom.length || key.startsWith('view:') ? 'flex-1' : 'shrink-0'} ${active === key ? 'border-primary font-medium text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
              title={label}
            >
              <Icon className="size-3.5 shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>
        {custom.length > 1 && (
          <DropdownMenu
            onOpenChange={(open) => {
              if (open && !pinned) onPin()
            }}
          >
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" disabled={busy} className="h-9 gap-1 px-2 text-xs">
                {t('More')}
                <ChevronDown className="size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {custom.map((item) => (
                <DropdownMenuItem key={item.key} onSelect={() => selectTab(item.key)}>
                  <Puzzle className="size-4" />
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="relative min-h-0 flex-1">
        {native.map(({ key, label }) => (
          <section
            key={key}
            role="tabpanel"
            id={`${id}-panel-${key}`}
            aria-labelledby={`${id}-${key}`}
            aria-label={label}
            hidden={active !== key}
            className="h-full min-h-0 overflow-auto overscroll-contain p-4"
          >
            {key === 'activity' ? (
              <ProfileActivity row={row} onSelect={onSelect} />
            ) : profile ? (
              <ProfileDetails profile={profile} tab={key} />
            ) : profileError ? (
              <ProfileError message={profileError} retry={refresh} />
            ) : (
              <ProfileLoading />
            )}
          </section>
        ))}
        {views
          .filter((view) => mounted.includes(`view:${view.key}`))
          .map((view) => (
            <section
              key={view.key}
              role="tabpanel"
              id={`${id}-panel-view:${view.key}`}
              aria-label={localizedText(view.title, locale)}
              hidden={active !== `view:${view.key}`}
              className="h-full min-h-0"
            >
              <RemoteProfileView
                botId={row.bot.id}
                manifest={view}
                active={active === `view:${view.key}`}
                onBusy={setViewBusy}
                onClose={onClose}
              />
            </section>
          ))}
      </div>
      {(viewsError || profileError) && (
        <div className="shrink-0 px-4 pb-2">
          <ProfileError message={viewsError || profileError} retry={refresh} />
        </div>
      )}
      {viewsLoading && (
        <p role="status" className="shrink-0 px-4 pb-2 text-[11px] text-muted-foreground">
          {t('Loading custom views…')}
        </p>
      )}
      {busy && (
        <p role="status" className="shrink-0 px-4 pb-2 text-[11px] text-muted-foreground">
          {t('Finish the current interaction before switching or closing.')}
        </p>
      )}
    </>
  )
}
