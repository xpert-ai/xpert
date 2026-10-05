import { useEffect, useRef, useState } from 'react'
import type { BosiCapability, BosiSetup } from '@xpert-ai/contracts'
import { Button, Label, Switch } from '@xpert-ai/shadcn-ui'
import { ArrowLeft, Brain, Laptop, LoaderCircle, Monitor, ShieldCheck, Sparkles } from 'lucide-react'
import { invoke } from '../host'
import { t } from '../i18n'
import { AnimatedAssistantAvatar } from '../avatar/AnimatedAssistantAvatar'
import type { DesktopShellState } from '../types'
import { BosiConnections } from './BosiConnections'
import { ComputerPreview } from './ComputerPreview'
import { ModelCascader } from '../catalog/ModelCascader'

type Step = 'loading' | 'intro' | 'plugins' | 'capabilities' | 'creating'
export function BosiOnboarding({
  organizationId,
  onReady
}: {
  organizationId: string
  onReady: (assistantId: string, threadId: string | null) => Promise<void>
}) {
  const [step, setStep] = useState<Step>('loading')
  const [setup, setSetup] = useState<BosiSetup>()
  const [shell, setShell] = useState<DesktopShellState>()
  const [selected, setSelected] = useState<BosiCapability[]>([])
  const [model, setModel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [pluginsSkipped, setPluginsSkipped] = useState(false)
  const alive = useRef(false)
  const epoch = useRef(0)
  const selectionRequest = useRef(0)
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady
  const finish = async (value: BosiSetup, version: number) => {
    if (!value.assistantId) return
    const openingWelcome = value.progress && value.progress.phase !== 'ready'
    if (openingWelcome) {
      setStep('creating')
      value = await invoke('bosiWelcome')
    }
    if (alive.current && epoch.current === version && value.assistantId)
      await onReadyRef.current(value.assistantId, openingWelcome ? (value.progress?.threadId ?? null) : null)
  }
  useEffect(() => {
    alive.current = true
    const version = ++epoch.current
    setBusy(true)
    setError('')
    void (async () => {
      try {
        const value = await invoke('bosiSetup', {})
        if (!alive.current || epoch.current !== version) return
        setSetup(value)
        if (value.assistantId) {
          await finish(value, version)
          return
        }
        const local = await invoke('shellState')
        if (!alive.current || epoch.current !== version) return
        setShell(local)
        const choices: BosiCapability[] =
          value.progress?.capabilities ??
          (value.capabilities?.some((item) => item.key === 'cloud-computer' && item.available)
            ? ['cloud-computer']
            : [])
        setSelected(choices)
        const check = await invoke('bosiSetup', { capabilities: choices })
        if (!alive.current || epoch.current !== version) return
        setSetup(check)
        setModel(value.progress?.modelId ?? check.setup?.defaultModelId ?? check.setup?.models[0]?.id ?? '')
        setStep(value.progress ? 'capabilities' : 'intro')
      } catch (reason) {
        if (alive.current && epoch.current === version)
          setError(reason instanceof Error ? reason.message : t('Could not initialize Bosi.'))
      } finally {
        if (alive.current && epoch.current === version) setBusy(false)
      }
    })()
    return () => {
      alive.current = false
      epoch.current++
      selectionRequest.current++
    }
    // A scope change remounts this component; callbacks must not restart initialization.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload])
  const change = async (key: BosiCapability, enabled: boolean) => {
    const next = enabled ? [...selected, key] : selected.filter((item) => item !== key)
    const version = ++selectionRequest.current
    setSelected(next)
    setBusy(true)
    setError('')
    try {
      const check = await invoke('bosiSetup', { capabilities: next })
      if (!alive.current || selectionRequest.current !== version) return
      setSetup(check)
      setModel((value) =>
        check.setup?.models.some((item) => item.id === value)
          ? value
          : (check.setup?.defaultModelId ?? check.setup?.models[0]?.id ?? '')
      )
    } catch (reason) {
      if (alive.current && selectionRequest.current === version)
        setError(reason instanceof Error ? reason.message : t('Could not initialize Bosi.'))
    } finally {
      if (alive.current && version === selectionRequest.current) setBusy(false)
    }
  }
  const create = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    setStep('creating')
    const version = epoch.current
    try {
      // Selecting Shell never relaxes the existing per-command approval policy.
      if (selected.includes('desktop-shell') && shell?.settings) await invoke('shellConfigure', shell.settings)
      if (!alive.current || epoch.current !== version) return
      const result = await invoke('createBosi', { capabilities: selected, modelId: model })
      if (!alive.current || epoch.current !== version) return
      setSetup(result)
      await finish(result, version)
    } catch (reason) {
      if (alive.current && epoch.current === version)
        setError(reason instanceof Error ? reason.message : t('Could not initialize Bosi.'))
    } finally {
      if (alive.current && epoch.current === version) setBusy(false)
    }
  }
  const title =
    step === 'plugins'
      ? 'Make Bosi more helpful'
      : step === 'capabilities'
        ? 'Choose where Bosi can work'
        : step === 'creating'
          ? 'Setting up your Bosi'
          : 'Create your Bosi'
  return (
    <section className="flex min-h-0 flex-1 overflow-auto px-6 py-10" aria-label={t('Create your Bosi')}>
      <div className="m-auto w-full max-w-xl space-y-7 py-6 text-center">
        {step === 'capabilities' ? (
          <ComputerPreview />
        ) : (
          <div className="mx-auto size-28 text-primary motion-safe:animate-[pulse_4s_ease-in-out_infinite]">
            <AnimatedAssistantAvatar />
          </div>
        )}
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight">{t(title)}</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            {t(
              step === 'plugins'
                ? 'Choose what Bosi can help you with. You can add capabilities and connect accounts later.'
                : step === 'capabilities'
                  ? 'Give Bosi the tools it needs. You can change these choices later.'
                  : step === 'creating'
                    ? 'Preparing your assistant and first conversation. You can safely retry if the connection is interrupted.'
                    : 'Your personal assistant in this organization, ready to help with ongoing work.'
            )}
          </p>
        </div>
        {step === 'intro' && (
          <div className="space-y-6 text-left">
            {(
              [
                [Brain, 'Built for complex work', 'Break down tasks, use skills, and keep track of progress.'],
                [Sparkles, 'A companion that remembers', 'Keep useful context and manage plans in your workspace.'],
                [
                  ShieldCheck,
                  'You choose its capabilities',
                  'Choose connected tools and review local commands before they run.'
                ]
              ] as const
            ).map(([Icon, heading, description]) => (
              <div key={heading} className="flex gap-4">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-muted text-primary">
                  <Icon className="size-6" />
                </div>
                <div>
                  <h2 className="font-medium">{t(heading)}</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{t(description)}</p>
                </div>
              </div>
            ))}
            <Button className="h-12 w-full rounded-full" onClick={() => setStep('plugins')}>
              {t('Continue')}
            </Button>
          </div>
        )}
        {step === 'plugins' && (
          <>
            <BosiConnections
              onContinue={() => setStep('capabilities')}
              onEmpty={() => {
                setPluginsSkipped(true)
                setStep('capabilities')
              }}
            />
          </>
        )}
        {step === 'capabilities' && (
          <div className="space-y-5 text-left">
            <div className="divide-y rounded-2xl border px-5">
              {(['cloud-computer', 'desktop-shell'] as const).map((key) => {
                const option = setup?.capabilities?.find((item) => item.key === key)
                const available = !!option?.available && (key !== 'desktop-shell' || !!shell?.available)
                const Icon = key === 'cloud-computer' ? Monitor : Laptop
                return (
                  <div key={key} className="flex items-center gap-4 py-5">
                    <Icon className="size-6 shrink-0 text-muted-foreground" />
                    <div className="flex-1">
                      <Label htmlFor={key}>
                        {t(key === 'cloud-computer' ? 'Bosi’s computer' : 'This computer Shell')}
                      </Label>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {available
                          ? t(
                              key === 'cloud-computer'
                                ? 'Work with a server computer and its applications.'
                                : 'Run local commands with the existing command approvals.'
                            )
                          : key === 'desktop-shell' && !shell?.available
                            ? t('Desktop Shell requires the native macOS app.')
                            : option?.reason || t('This capability is unavailable on this server.')}
                      </p>
                    </div>
                    <Switch
                      id={key}
                      checked={selected.includes(key)}
                      disabled={busy || !available || !!setup?.progress}
                      onCheckedChange={(checked) => void change(key, checked)}
                    />
                  </div>
                )
              })}
            </div>
            <div className="space-y-2">
              <ModelCascader
                id="bosi-model"
                models={setup?.setup?.models ?? []}
                disabled={busy || !!setup?.progress}
                value={model}
                onChange={setModel}
                computer={selected.includes('cloud-computer')}
                defaultModelId={setup?.setup?.defaultModelId}
              />
              {setup?.setup?.reason && <p className="text-sm text-destructive">{setup.setup.reason}</p>}
            </div>
            <Button
              className="h-12 w-full rounded-full"
              disabled={busy || !model || !setup?.setup?.canInstall || !!error}
              onClick={() => void create()}
            >
              {busy && <LoaderCircle className="size-4 animate-spin" />}
              {t(setup?.progress ? 'Resume setup' : 'Create Bosi')}
            </Button>
          </div>
        )}
        {(['loading', 'creating'].includes(step) || busy) && !error && (
          <p role="status" className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            {t(step === 'creating' ? 'This may take a few moments.' : 'Loading…')}
          </p>
        )}
        {error && (
          <div role="alert" className="space-y-4">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" disabled={busy} onClick={() => setReload((value) => value + 1)}>
              {t('Retry')}
            </Button>
            {setup?.assistantId && (
              <Button
                variant="ghost"
                onClick={() => void onReadyRef.current(setup.assistantId!, setup.progress?.threadId ?? null)}
              >
                {t('Open conversation')}
              </Button>
            )}
          </div>
        )}
        {['plugins', 'capabilities'].includes(step) && !setup?.progress && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => setStep(step === 'plugins' || pluginsSkipped ? 'intro' : 'plugins')}
          >
            <ArrowLeft className="size-4" />
            {t('Back')}
          </Button>
        )}
      </div>
    </section>
  )
}
