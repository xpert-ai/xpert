import { useEffect, useState, type ReactNode } from 'react'
import { Button, Switch } from '@xpert-ai/shadcn-ui'
import { BrandLogo } from '../branding/BrandLogo'
import { ThemeSelect, ThemeRange } from '../ThemeFields'
import { t } from '../i18n'
import type { ActivityIslandPreferences, AgentDockPreferences, ConnectionConfig, DockChoices } from '../types'
import defaults from '../../electron/overlay-defaults.json'

type Props = { draft: ConnectionConfig; onChange: (config: ConnectionConfig) => void }

function Group({
  title,
  note,
  action,
  children
}: {
  title: string
  note?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {note && <p className="mt-1 text-xs leading-5 text-muted-foreground">{note}</p>}
        </div>
        {action}
      </div>
      <div className="divide-y rounded-xl border bg-card px-5">{children}</div>
    </section>
  )
}
function Row({ title, note, icon, children }: { title: string; note?: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-14 items-center gap-3 py-3">
      {icon}
      <div className="min-w-0 flex-1">
        <div className="break-words text-sm font-medium">{title}</div>
        {note && <p className="mt-1 text-xs leading-5 text-muted-foreground">{note}</p>}
      </div>
      <div className="max-w-[48%] shrink-0">{children}</div>
    </div>
  )
}
function Toggle({
  title,
  note,
  icon,
  value,
  disabled,
  onChange
}: {
  title: string
  note?: string
  icon?: ReactNode
  value: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <Row title={title} note={note} icon={icon}>
      <Switch aria-label={title} checked={value} disabled={disabled} onCheckedChange={onChange} />
    </Row>
  )
}
function Range({
  label,
  value,
  limits,
  onChange
}: {
  label: string
  value: number
  limits: number[]
  onChange: (n: number) => void
}) {
  return (
    <div className="py-3">
      <ThemeRange label={label} value={value} min={limits[0]} max={limits[1]} unit="%" onChange={onChange} />
    </div>
  )
}

export function IslandSettings({ draft, onChange }: Props) {
  const prefs: ActivityIslandPreferences = { ...defaults.island, ...draft.activityIsland }
  const change = (patch: Partial<ActivityIslandPreferences>) =>
    onChange({ ...draft, activityIsland: { ...prefs, ...patch } })
  return (
    <div className="space-y-7">
      <Group title={t('Behavior')}>
        <Toggle
          title={t('Show status at the MacBook notch')}
          note={t('Show active window control and requests that need attention.')}
          value={prefs.enabled}
          onChange={(enabled) => change({ enabled })}
        />
        <Toggle
          title={t('Show the island when idle')}
          note={t('Show the Bosi logo and greeting between tasks.')}
          value={prefs.idle}
          disabled={!prefs.enabled}
          onChange={(idle) => change({ idle })}
        />
        <Toggle
          title={t('Show on additional displays')}
          note={t('Show an island on each connected display.')}
          value={prefs.external}
          disabled={!prefs.enabled}
          onChange={(external) => change({ external })}
        />
        <Toggle
          title={t('Force Touch feedback')}
          note={t('Confirm island interactions on a compatible trackpad.')}
          value={prefs.haptics}
          disabled={!prefs.enabled}
          onChange={(haptics) => change({ haptics })}
        />
      </Group>
      <Group
        title={t('Size')}
        note={t('On a notched display the island always fits around the camera.')}
        action={
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={prefs.width === 100 && prefs.height === 100}
            onClick={() => change({ width: 100, height: 100 })}
          >
            {t('Reset size')}
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-3 py-4">
          {[true, false].map((builtIn) => (
            <div key={String(builtIn)} className="min-w-0 text-center">
              <div
                className={
                  'flex h-16 justify-center overflow-hidden rounded-lg border bg-muted/50 ' +
                  (builtIn ? 'items-start' : 'items-center')
                }
              >
                <div
                  className={
                    'flex max-w-[94%] items-center justify-between bg-black px-2 text-xs ' +
                    (builtIn ? 'rounded-b-xl' : 'rounded-full')
                  }
                  style={{ width: ((builtIn ? 146 : 118) * prefs.width) / 100, height: (25 * prefs.height) / 100 }}
                >
                  <BrandLogo className="size-4" />
                  <span aria-hidden="true">👋</span>
                </div>
              </div>
              <span className="mt-2 block text-xs text-muted-foreground">
                {t(builtIn ? 'Built-in display' : 'External display')}
              </span>
            </div>
          ))}
        </div>
        <Range
          label={t('Width')}
          value={prefs.width}
          limits={defaults.limits.width}
          onChange={(width) => change({ width })}
        />
        <Range
          label={t('Height')}
          value={prefs.height}
          limits={defaults.limits.height}
          onChange={(height) => change({ height })}
        />
      </Group>
    </div>
  )
}

export function DockSettings({ draft, onChange, signedIn }: Props & { signedIn: boolean }) {
  const prefs: AgentDockPreferences = { ...defaults.dock, edge: 'right', placement: 'screen', ...draft.agentDock }
  const change = (patch: Partial<AgentDockPreferences>) => onChange({ ...draft, agentDock: { ...prefs, ...patch } })
  const [displays, setDisplays] = useState<{ id: string; label: string }[]>([])
  const [roster, setRoster] = useState<DockChoices>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const bridge = window.xpertDesktop?.dockSettings
  useEffect(() => {
    if (!bridge) return
    let current = true
    const refresh = () => {
      void bridge
        .displays()
        .then((v) => {
          if (current) setDisplays(v)
        })
        .catch(() => {
          if (current) setError(t('Could not load Dock settings.'))
        })
    }
    refresh()
    let revision = 0
    const refreshChoices = () => {
      if (!signedIn) return
      const request = ++revision
      void bridge
        .choices()
        .then((v) => {
          if (current && request === revision) setRoster(v)
        })
        .catch(() => {
          if (current) setError(t('Could not load Dock settings.'))
        })
    }
    refreshChoices()
    const unsubscribe = bridge.onChange(refreshChoices)
    window.addEventListener('focus', refresh)
    return () => {
      current = false
      unsubscribe()
      window.removeEventListener('focus', refresh)
    }
  }, [bridge, signedIn])
  async function select(token: string, v: boolean) {
    if (!bridge || !roster?.scope || busy) return
    setBusy(true)
    try {
      setRoster(await bridge.select(roster.scope, token, v))
      setError('')
    } catch {
      setError(t('Could not update Dock shortcuts.'))
    } finally {
      setBusy(false)
    }
  }
  const screen = prefs.placement === 'screen'
  const displayOptions = [
    { value: 'window', label: t('Follow the Bosi window') },
    { value: 'primary', label: t('Primary display') },
    { value: 'all', label: t('All displays') },
    ...displays.map((d) => ({ value: d.id, label: d.label || d.id }))
  ]
  if (!displayOptions.some((d) => d.value === prefs.display))
    displayOptions.push({ value: prefs.display, label: t('Disconnected display') })
  return (
    <div className="space-y-7">
      <Group title={t('Behavior')}>
        <Toggle
          title={t('Show Agent Dock')}
          note={t('Open assistants and group chats from the screen edge.')}
          value={prefs.enabled}
          onChange={(enabled) => change({ enabled })}
        />
        <fieldset className="divide-y" disabled={!prefs.enabled}>
          <Row title={t('Placement')}>
            <ThemeSelect
              hideLabel
              label={t('Placement')}
              value={prefs.placement}
              options={[
                { value: 'screen', label: t('Above other apps') },
                { value: 'window', label: t('In the Bosi window') }
              ]}
              onChange={(placement) => change({ placement })}
            />
          </Row>
          {screen && (
            <Row title={t('Display')} note={t('When disconnected, the Dock follows the Bosi window.')}>
              <ThemeSelect
                hideLabel
                label={t('Display')}
                value={prefs.display}
                options={displayOptions}
                onChange={(display) => change({ display })}
              />
            </Row>
          )}
          <Row title={t('Screen edge')} note={t('Drag the curved handle to move along this edge.')}>
            <ThemeSelect
              hideLabel
              label={t('Screen edge')}
              value={prefs.edge}
              options={[
                { value: 'left', label: t('Left') },
                { value: 'right', label: t('Right') }
              ]}
              onChange={(edge) => change({ edge })}
            />
          </Row>
          {screen && (
            <>
              <Range
                label={t('Dock size')}
                value={prefs.size}
                limits={defaults.limits.size}
                onChange={(size) => change({ size })}
              />
              <Toggle
                title={t('Automatically hide Agent Dock')}
                note={t('Move the pointer toward the edge to reveal your shortcuts.')}
                value={prefs.autoHide}
                onChange={(autoHide) => change({ autoHide })}
              />
              <Toggle
                title={t('Show edge strip')}
                note={t('A colored wave signals a pending question.')}
                disabled={!prefs.autoHide}
                value={prefs.strip}
                onChange={(strip) => change({ strip })}
              />
            </>
          )}
          <Toggle
            title={t('Show completed work')}
            note={t('Briefly show the latest assistant reply beside the Dock.')}
            value={prefs.results}
            onChange={(results) => change({ results })}
          />
        </fieldset>
      </Group>
      <Group
        title={t('Assistants in the Dock')}
        note={t('Shortcut changes apply immediately to the current organization.')}
      >
        {roster?.entries.map((e) => (
          <Toggle
            key={e.token}
            title={e.name}
            icon={
              e.image ? (
                <img src={e.image} alt="" referrerPolicy="no-referrer" className="size-7 rounded-lg object-cover" />
              ) : e.glyph ? (
                <span aria-hidden="true">{e.glyph}</span>
              ) : (
                <BrandLogo className="size-7" />
              )
            }
            value={e.selected}
            disabled={busy}
            onChange={(v) => void select(e.token, v)}
          />
        ))}
        {(!signedIn || roster?.entries.length === 0) && (
          <p className="py-4 text-sm text-muted-foreground">
            {t(signedIn ? 'No assistants available.' : 'Sign in to choose assistants.')}
          </p>
        )}
      </Group>
      {error && <p role="alert">{error}</p>}
    </div>
  )
}
