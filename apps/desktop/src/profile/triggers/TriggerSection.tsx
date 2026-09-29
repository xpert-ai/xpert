import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal, Pause, Pencil, Play, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import type { AssistantTriggerCategory, AssistantTriggerMutation } from '@xpert-ai/contracts'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input
} from '../../ui'
import { invoke } from '../../host'
import { t, useLocale } from '../../i18n'
import { localizedText } from '../../../electron/i18n/index.mjs'
import { ProfileError, ProfileLoading } from '../ProfileState'
import { profileDate } from '../NativeProfileTabs'
import { channelProviders, triggerSummary, type AssistantTriggerItem, type AssistantTriggerProvider } from './model'
import { ProviderIcon } from './ProviderIcon'
import { TriggerWizard } from './TriggerWizard'
import { scheduleSummary } from './ScheduleFields'
import type { TriggerSettingsState } from './useTriggerSettings'

export function TriggerSection({
  botId,
  category,
  settings,
  onBusy
}: {
  botId: string
  category: AssistantTriggerCategory
  settings: TriggerSettingsState
  onBusy: (key: string, busy: boolean) => void
}) {
  const locale = useLocale()
  const { data, loading } = settings
  const [mutationError, setMutationError] = useState('')
  const error = mutationError || settings.error
  const [search, setSearch] = useState('')
  const [editor, setEditor] = useState<{ provider?: AssistantTriggerProvider; item?: AssistantTriggerItem }>()
  const [deleting, setDeleting] = useState<AssistantTriggerItem>()
  const [saving, setSaving] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const report = useRef(onBusy)
  report.current = onBusy
  // Menus are portaled outside the hover card, so they must hold it open too.
  const held = menuOpen || !!editor || !!deleting || saving
  useEffect(() => {
    report.current(`trigger-settings:${category}`, held)
    return () => report.current(`trigger-settings:${category}`, false)
  }, [category, held])
  const refresh = () => {
    setMutationError('')
    settings.refresh()
  }
  const channel = category === 'channel'
  const providers = data ? (channel ? channelProviders(data.providers) : data.providers) : []
  const matches = (value: string) => value.toLocaleLowerCase().includes(search.toLocaleLowerCase())
  const items =
    data?.items.filter((item) => item.category === category && matches(`${item.title} ${item.provider}`)) ?? []
  const available = providers.filter(
    (provider) =>
      provider.presentation.category === category &&
      !data?.items.some((item) => item.provider === provider.name) &&
      matches(localizedText(provider.label, locale))
  )
  const mutate = async (change: AssistantTriggerMutation) => {
    setSaving(true)
    setMutationError('')
    try {
      await invoke('saveAssistantTrigger', { botId, change })
      setDeleting(undefined)
      refresh()
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : t('The operation failed. Please retry.'))
    } finally {
      setSaving(false)
    }
  }
  if (loading && !data) return <ProfileLoading />
  if (!data)
    return <ProfileError message={error || t('Trigger settings are unavailable on this server.')} retry={refresh} />
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold tracking-tight">{t(channel ? 'Channels' : 'Automations')}</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {t(
              channel
                ? 'Chat with this assistant in your connected apps.'
                : 'Let this assistant start working when events happen.'
            )}
          </p>
        </div>
        <Button
          size="sm"
          className="shrink-0 gap-1 text-xs"
          disabled={!data.canEdit || saving || loading}
          onClick={() => setEditor({})}
        >
          <Plus className="size-3.5" />
          {t(channel ? 'Add channel' : 'New automation')}
        </Button>
      </div>
      {!data.canEdit && (
        <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          {t('A published assistant and workspace edit access are required to manage triggers.')}
        </p>
      )}
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search aria-hidden="true" className="absolute top-2.5 left-3 size-3.5 text-muted-foreground" />
          <Input
            className="h-8 pl-8 text-xs"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t(channel ? 'Search channels' : 'Search automations')}
            aria-label={t(channel ? 'Search channels' : 'Search automations')}
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          disabled={loading || saving}
          onClick={refresh}
          aria-label={t('Refresh')}
        >
          <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>
      {error && <ProfileError message={error} retry={refresh} />}
      <div className="space-y-2.5">
        {items.map((item) => {
          const provider = providers.find((option) => option.name === item.provider)
          const status = !item.enabled
            ? 'Paused'
            : !channel
              ? 'Active'
              : item.connection === 'connected'
                ? 'Connected'
                : item.connection === 'failed'
                  ? 'Connection failed'
                  : item.connection === 'connecting'
                    ? 'Connecting…'
                    : item.connection === 'unknown'
                      ? 'Configured'
                      : 'Disconnected'
          const summary = triggerSummary(provider, item)
          const lastActivityAt = channel ? item.lastActivityAt : item.lastRunAt
          return (
            <article key={item.key} className="rounded-xl border bg-card p-3.5">
              <div className="flex items-start gap-3">
                <ProviderIcon
                  provider={channel ? (provider?.presentation.channel ?? item.provider) : undefined}
                  kind={provider?.presentation.kind}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="truncate text-sm font-semibold" title={item.title}>
                      {item.title}
                    </h4>
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[10px] ${item.enabled && item.connection !== 'failed' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}
                    >
                      {t(status)}
                    </span>
                  </div>
                  {channel && provider && <AccountLabel botId={botId} provider={provider} item={item} />}
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {provider?.name === 'schedule' && typeof item.config.cron === 'string'
                      ? scheduleSummary(item.config.cron)
                      : typeof summary === 'string'
                        ? summary
                        : summary.length
                          ? summary.map((part) => part.value || localizedText(part.label, locale)).join(' · ')
                          : t(channel ? 'Provider default response settings' : 'App event')}
                  </p>
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    {t(channel ? 'Last activity' : 'Last run')} ·{' '}
                    {lastActivityAt ? profileDate(lastActivityAt, locale) : t('Not available')}
                  </p>
                </div>
                <DropdownMenu onOpenChange={setMenuOpen}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 shrink-0"
                      disabled={!data.canEdit || saving || loading}
                      aria-label={t('Manage {{name}}', { name: item.title })}
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem disabled={!provider?.available} onSelect={() => setEditor({ provider, item })}>
                      <Pencil className="size-4" />
                      {t('Edit')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() =>
                        void mutate({
                          revision: data.revision,
                          provider: item.provider,
                          operation: 'toggle',
                          enabled: !item.enabled
                        })
                      }
                    >
                      {item.enabled ? <Pause className="size-4" /> : <Play className="size-4" />}
                      {t(item.enabled ? 'Pause' : 'Enable')}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onSelect={() => setDeleting(item)}>
                      <Trash2 className="size-4" />
                      {t('Delete')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </article>
          )
        })}
      </div>
      {!items.length && (
        <div className="rounded-xl border border-dashed px-5 py-7 text-center">
          <p className="text-sm font-medium">
            {t(search ? 'No matching results' : channel ? 'No channels connected yet' : 'No automations yet')}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {t(
              channel
                ? 'Connect an app to make this assistant available there.'
                : 'Create a trigger to put this assistant’s existing capabilities to work.'
            )}
          </p>
        </div>
      )}
      {channel && available.length > 0 && (
        <div className="space-y-2">
          <h4 className="pt-1 text-xs font-medium text-muted-foreground">{t('Available channels')}</h4>
          {available.map((provider) => (
            <div key={provider.name} className="flex items-center gap-3 rounded-xl border p-3">
              <ProviderIcon provider={provider.presentation.channel} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t(localizedText(provider.label, locale))}</p>
                <p className="text-[11px] text-muted-foreground">
                  {t(provider.available ? 'Not connected' : 'Provider plugin required')}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-primary"
                disabled={!provider.available || !data.canEdit || loading || saving}
                onClick={() => setEditor({ provider })}
              >
                {t('Connect')}
              </Button>
            </div>
          ))}
        </div>
      )}
      {editor && (
        <TriggerWizard
          botId={botId}
          category={category}
          data={data}
          initialProvider={editor.provider}
          item={editor.item}
          onClose={() => setEditor(undefined)}
          onSaved={() => {
            setEditor(undefined)
            refresh()
          }}
        />
      )}
      {deleting && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !saving) setDeleting(undefined)
          }}
        >
          <DialogContent
            onEscapeKeyDown={(event) => {
              if (saving) event.preventDefault()
            }}
            onInteractOutside={(event) => {
              if (saving) event.preventDefault()
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('Delete {{name}}?', { name: deleting.title })}</DialogTitle>
              <DialogDescription>
                {t('This removes the trigger from this assistant. The connected account remains available in Xpert.')}
              </DialogDescription>
            </DialogHeader>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" disabled={saving} onClick={() => setDeleting(undefined)}>
                {t('Cancel')}
              </Button>
              <Button
                variant="destructive"
                disabled={saving}
                onClick={() =>
                  void mutate({ revision: data.revision, provider: deleting.provider, operation: 'delete' })
                }
              >
                {t(saving ? 'Deleting…' : 'Delete')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function AccountLabel({
  botId,
  provider,
  item
}: {
  botId: string
  provider: AssistantTriggerProvider
  item: AssistantTriggerItem
}) {
  const field = provider.presentation.accountFields?.find((key) => typeof item.config[key] === 'string')
  const value = field ? item.config[field] : undefined
  const [label, setLabel] = useState('')
  useEffect(() => {
    let current = true
    setLabel('')
    if (field)
      void invoke('assistantTriggerOptions', { botId, provider: provider.name, field })
        .then((items) => {
          if (current) setLabel(items.find((option) => option.value === value)?.label ?? '')
        })
        .catch(() => {})
    return () => {
      current = false
    }
  }, [botId, provider.name, field, value])
  return <p className="mt-1 truncate text-xs text-muted-foreground">{label || t('Workspace connection')}</p>
}
