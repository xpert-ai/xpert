import { t } from './i18n'
import { useEffect, useState } from 'react'
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@xpert-ai/shadcn-ui'
import { Check, ExternalLink, LoaderCircle } from 'lucide-react'
import { HostError, invoke, openWorkspace } from './host'
import { canUseExpert } from './catalog-labels'
import type { ApplicationSetup, CatalogItem, ExpertItem, WorkspaceOption } from './catalog-types'

function ModelSelect({
  id,
  label,
  options,
  value,
  onChange,
  disabled
}: {
  id: string
  label: string
  options: { id: string; label: string }[]
  value: string
  onChange: (id: string) => void
  disabled: boolean
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={t('Select a model')} />
        </SelectTrigger>
        <SelectContent>
          {options.map((model) => (
            <SelectItem key={model.id} value={model.id}>
              {model.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function CatalogSetup({
  item,
  webUrl,
  onBusy,
  onUse,
  onRequested
}: {
  item: CatalogItem
  webUrl: string
  onBusy: (busy: boolean) => void
  onUse: (id: string) => Promise<void>
  onRequested: (item: ExpertItem) => void
}) {
  const [setup, setSetup] = useState<ApplicationSetup | null>(null)
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [title, setTitle] = useState(item.name.slice(0, 100))
  const [reason, setReason] = useState('')
  const [embedding, setEmbedding] = useState('')
  const [vision, setVision] = useState('')
  const [operationId] = useState(() => crypto.randomUUID())
  const [loading, setLoading] = useState(item.kind !== 'experts')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [installed, setInstalled] = useState<string | null>(null)
  const [uncertain, setUncertain] = useState(false)
  useEffect(() => {
    let active = true
    async function load() {
      setLoading(item.kind !== 'experts')
      setError('')
      try {
        if (item.kind === 'applications') {
          const result = await invoke('applicationSetup', { pluginName: item.pluginName, appName: item.appName })
          if (!active) return
          setSetup(result)
          setEmbedding(result.defaultEmbeddingModelId)
          setVision(result.defaultVisionModelId)
          if (result.application.status === 'ready') setInstalled(result.application.botId)
        } else if (item.kind === 'templates') {
          const result = await invoke('templateWorkspaces')
          if (!active) return
          setWorkspaces(result)
          setWorkspaceId(result[0]?.id || '')
        }
      } catch (error) {
        if (active) setError(error instanceof Error ? error.message : t('Could not load installation settings.'))
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [item, revision])
  const initializing = setup?.application.status === 'initializing'
  const canSubmit =
    !busy &&
    !loading &&
    !uncertain &&
    (installed ||
      (item.kind === 'experts'
        ? reason.trim().length > 0
        : item.kind === 'templates'
          ? workspaceId && title.trim()
          : setup?.canInitialize &&
            !initializing &&
            (!setup.requireEmbedding || embedding) &&
            (!setup.requireVision || vision)))
  const submit = async () => {
    if (!canSubmit) return
    setBusy(true)
    onBusy(true)
    setError('')
    let installationComplete = !!installed
    try {
      if (installed) {
        await onUse(installed)
        return
      }
      if (item.kind === 'experts') {
        const result = await invoke('requestExpertAccess', { id: item.id, reason: reason.trim() })
        if (canUseExpert(result)) await onUse(result.id)
        else onRequested(result)
        return
      }
      const result =
        item.kind === 'applications'
          ? await invoke('initializeApplication', {
              pluginName: item.pluginName,
              appName: item.appName,
              operationId,
              ...(embedding ? { embeddingModelId: embedding } : {}),
              ...(vision ? { visionModelId: vision } : {})
            })
          : await invoke('installTemplate', { id: item.id, workspaceId, title: title.trim() })
      setInstalled(result.botId)
      installationComplete = true
      await onUse(result.botId)
    } catch (error) {
      if (!installationComplete && item.kind === 'templates' && error instanceof HostError && error.status === 503)
        setUncertain(true)
      setError(error instanceof Error ? error.message : t('The operation failed. Please retry.'))
    } finally {
      setBusy(false)
      onBusy(false)
    }
  }
  return (
    <form
      className="flex min-h-0 flex-1 flex-col border-t"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-2xl space-y-6">
          <p className="text-sm leading-7 text-muted-foreground">{item.description}</p>
          {loading ? (
            <div role="status" className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <LoaderCircle className="size-5 animate-spin" />
              {t('Checking installation settings…')}
            </div>
          ) : (
            <>
              {item.kind === 'experts' && (
                <div className="space-y-3">
                  <Label htmlFor="access-reason">{t('Request details')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t('Describe your use case to the expert administrator. You can use the expert after approval.')}
                  </p>
                  <textarea
                    id="access-reason"
                    required
                    maxLength={500}
                    rows={5}
                    disabled={busy}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder={t('For example: weekly business data analysis…')}
                    className="w-full resize-y rounded-lg border bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <p className="text-right text-xs text-muted-foreground">{reason.length} / 500</p>
                </div>
              )}
              {item.kind === 'templates' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="assistant-title">{t('Assistant name')}</Label>
                    <Input
                      id="assistant-title"
                      value={title}
                      maxLength={100}
                      required
                      disabled={busy || !!installed}
                      onChange={(event) => setTitle(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="target-workspace">{t('Target workspace')}</Label>
                    <Select value={workspaceId} onValueChange={setWorkspaceId} disabled={busy || !!installed}>
                      <SelectTrigger id="target-workspace" className="w-full">
                        <SelectValue placeholder={t('Select a workspace you can edit')} />
                      </SelectTrigger>
                      <SelectContent>
                        {workspaces.map((workspace) => (
                          <SelectItem key={workspace.id} value={workspace.id}>
                            {workspace.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!workspaces.length && (
                      <p className="text-sm text-destructive">
                        {t('No writable workspace is available. Create one in Xpert or request edit access.')}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2 border-t pt-5 text-sm leading-6 text-muted-foreground">
                    <p>
                      {t(
                        'This initializes the template resources in your chosen workspace and creates and publishes a chat assistant.'
                      )}
                    </p>
                    <p>
                      {t(
                        'Models use platform defaults. Some templates also require tools, knowledge bases or other dependencies to be configured in the workspace.'
                      )}
                    </p>
                  </div>
                </>
              )}
              {item.kind === 'applications' && setup && (
                <>
                  <div className="space-y-3">
                    <h3 className="font-medium">{installed ? t('App ready') : t('Installation details')}</h3>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {setup.application.summary ||
                        t(
                          'Xpert creates an app workspace for this organization and initializes the required assistants and resources.'
                        )}
                    </p>
                    <ol className="space-y-2 text-sm text-muted-foreground">
                      {setup.application.steps.map((step, index) => (
                        <li key={index} className="flex gap-3">
                          <span className="text-accent-foreground">{index + 1}.</span>
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>
                  {!installed && (
                    <>
                      {(setup.requireEmbedding || setup.requireVision) && (
                        <div className="space-y-5 border-t pt-5">
                          {setup.requireEmbedding && (
                            <ModelSelect
                              id="embedding-model"
                              label={t(setup.embeddingLabel)}
                              options={setup.embeddingModels}
                              value={embedding}
                              onChange={setEmbedding}
                              disabled={busy}
                            />
                          )}
                          {setup.requireVision && (
                            <ModelSelect
                              id="vision-model"
                              label={t(setup.visionLabel)}
                              options={setup.visionModels}
                              value={vision}
                              onChange={setVision}
                              disabled={busy}
                            />
                          )}
                        </div>
                      )}
                      {!setup.canInitialize && (
                        <p role="status" className="rounded-lg bg-muted p-4 text-sm">
                          {t(setup.reason)}
                        </p>
                      )}
                      {initializing && (
                        <p role="status" className="text-sm text-muted-foreground">
                          {t('The app is installing. Select Refresh settings shortly to check the result.')}
                        </p>
                      )}
                    </>
                  )}
                </>
              )}
              {installed && (
                <p role="status" className="flex items-center gap-2 text-sm text-accent-foreground">
                  <Check className="size-4" />
                  {t('Installation complete. You can open the assistant now.')}
                </p>
              )}
            </>
          )}
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm leading-6 text-destructive"
            >
              {error}
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-6 py-4">
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => openWorkspace(webUrl)}>
          <ExternalLink className="size-4" />
          {t('Open Xpert workspace')}
        </Button>
        <div className="flex gap-2">
          {item.kind !== 'experts' && (
            <Button
              type="button"
              variant="outline"
              disabled={busy || loading || uncertain}
              onClick={() => setRevision((value) => value + 1)}
            >
              {t('Refresh settings')}
            </Button>
          )}
          <Button type="submit" disabled={!canSubmit}>
            {busy && <LoaderCircle className="size-4 animate-spin" />}
            {busy
              ? item.kind === 'experts'
                ? t('Submitting…')
                : t('Preparing assistant…')
              : installed
                ? t('Open assistant')
                : item.kind === 'experts'
                  ? t('Submit request')
                  : t('Install & use')}
          </Button>
        </div>
      </div>
    </form>
  )
}
