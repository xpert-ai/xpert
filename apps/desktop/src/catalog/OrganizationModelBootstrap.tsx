import { useEffect, useRef, useState } from 'react'
import { Button } from '@xpert-ai/shadcn-ui'
import type {
  BootstrapPlan,
  OrganizationModelChoice,
  OrganizationModelResult,
  OrganizationModelStep
} from '../catalog-types'
import { t } from '../i18n'
import { Choice } from './OrganizationModelChoice'

export function OrganizationModelBootstrap({
  integrationId,
  revision,
  options,
  users,
  run,
  disabled,
  onStart,
  onReady
}: {
  integrationId: string
  revision: number
  options: { version: string; modes: OrganizationModelChoice[] }
  users: OrganizationModelChoice[]
  run: (op: OrganizationModelStep) => Promise<OrganizationModelResult>
  disabled: boolean
  onStart: () => void
  onReady: (model: OrganizationModelChoice) => void
}) {
  const [open, setOpen] = useState(false)
  const [workspaces, setWorkspaces] = useState<OrganizationModelChoice[]>([])
  const [sources, setSources] = useState<OrganizationModelChoice[]>([])
  const [workspace, setWorkspace] = useState('')
  const [source, setSource] = useState('')
  const [mode, setMode] = useState('')
  const [actor, setActor] = useState('')
  const [people, setPeople] = useState<string[]>([])
  const [plan, setPlan] = useState<BootstrapPlan | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const epoch = useRef(0)
  useEffect(
    () => () => {
      epoch.current++
    },
    []
  )
  async function request(step: OrganizationModelStep, receive: (r: OrganizationModelResult) => void) {
    const current = ++epoch.current
    setBusy(true)
    setError('')
    try {
      const result = await run(step)
      if (epoch.current === current) receive(result)
    } catch (err) {
      if (epoch.current === current)
        setError(err instanceof Error ? err.message : t('Could not load installation settings.'))
    } finally {
      if (epoch.current === current) setBusy(false)
    }
  }
  const locked = busy || disabled
  const selection = { integrationId, workspaceId: workspace, dataSourceId: source, mode, userIds: people, revision }
  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="outline"
        disabled={locked}
        aria-expanded={open}
        onClick={() => {
          if (open) {
            setOpen(false)
            setPlan(null)
            setWorkspace('')
            setSource('')
            setSources([])
            setWorkspaces([])
            setMode('')
            setActor('')
            setPeople([])
            return
          }
          onStart()
          setOpen(true)
          void request({ step: 'bootstrap-workspaces', integrationId }, (r) => {
            if (!('choices' in r) || !r.actorId) throw Error(t('Could not load installation settings.'))
            setWorkspaces(r.choices)
            setActor(r.actorId)
            setPeople([r.actorId])
          })
        }}
      >
        {t('Prepare a model from the application template')}
      </Button>
      {open && (
        <>
          <Choice
            id="bootstrap-workspace"
            label={t('Private workspace')}
            value={workspace}
            options={workspaces}
            disabled={locked}
            onChange={(id) => {
              setWorkspace(id)
              setSource('')
              setSources([])
              setPlan(null)
              void request({ step: 'bootstrap-sources', integrationId, workspaceId: id }, (r) => {
                if (!('choices' in r)) throw Error(t('Could not load installation settings.'))
                setSources(r.choices)
              })
            }}
          />
          <Choice
            id="bootstrap-source"
            label={t('Authorized data source')}
            value={source}
            options={sources}
            disabled={locked}
            onChange={(id) => {
              setSource(id)
              setPlan(null)
            }}
          />
          {workspace && !sources.length && !busy && !error && (
            <p role="status">{t('Bind a supported data source to this workspace first.')}</p>
          )}
          <Choice
            id="bootstrap-mode"
            label={t('Model source')}
            value={mode}
            options={options.modes}
            disabled={locked}
            onChange={(id) => {
              setMode(id)
              setPlan(null)
            }}
          />
          <Choice
            id="bootstrap-members"
            label={t('Members to grant read access to')}
            options={users.filter((u) => !people.includes(u.id))}
            value=""
            disabled={locked || people.length >= 50}
            onChange={(id) => {
              setPlan(null)
              setPeople((prev) => (prev.includes(id) ? prev : [...prev, id]))
            }}
          />
          <div className="flex flex-wrap gap-2">
            {users
              .filter((u) => people.includes(u.id))
              .map((u) =>
                u.id === actor ? (
                  <span key={u.id}>{u.label}</span>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    key={u.id}
                    disabled={locked}
                    aria-label={t('Remove {{name}}', { name: u.label })}
                    onClick={() => {
                      setPlan(null)
                      setPeople((prev) => prev.filter((id) => id !== u.id))
                    }}
                  >
                    {u.label} ×
                  </Button>
                )
              )}
          </div>
          <p className="text-sm text-muted-foreground">{t('Existing read grants are retained.')}</p>
          <Button
            type="button"
            variant="outline"
            disabled={locked || !source || !mode || !actor}
            onClick={() =>
              void request({ step: 'bootstrap-plan', ...selection }, (r) => {
                if (!('plan' in r)) throw Error(t('Could not load installation settings.'))
                setPlan(r.plan)
              })
            }
          >
            {t('Review model and access')}
          </Button>
          {plan && (
            <div className="space-y-2" aria-live="polite">
              <p>
                {plan.modelLabel} · {options.version} ·{' '}
                {t(
                  {
                    create: 'Create and publish',
                    resume: 'Resume publication',
                    reuse: 'Reuse published model',
                    conflict: 'Existing configuration differs'
                  }[plan.state]
                )}
              </p>
              <p>
                {[
                  workspaces.find((w) => w.id === workspace)?.label,
                  sources.find((s) => s.id === source)?.label,
                  options.modes.find((m) => m.id === mode)?.label,
                  users
                    .filter((u) => people.includes(u.id))
                    .map((u) => u.label)
                    .join(', ')
                ].join(' · ')}
              </p>
              {plan.state === 'conflict' ? (
                <p>
                  {t('The existing configuration was preserved.')} {plan.differences.join(', ')}
                </p>
              ) : (
                <Button
                  type="button"
                  disabled={locked}
                  onClick={() =>
                    void request({ step: 'bootstrap-apply', ...selection, receipt: plan.receipt }, (r) => {
                      if (!('model' in r)) throw Error(t('Could not load installation settings.'))
                      setOpen(false)
                      setPlan(null)
                      onReady(r.model)
                    })
                  }
                >
                  {t('Confirm and preview queries')}
                </Button>
              )}
            </div>
          )}
          {busy && <p role="status">{t('Checking installation settings…')}</p>}
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  )
}
