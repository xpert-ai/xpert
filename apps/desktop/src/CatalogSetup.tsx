import { t } from './i18n'
import { useEffect, useState } from 'react'
import { Button, Input, Label, Textarea } from '@xpert-ai/shadcn-ui'
import { CatalogCombobox } from './CatalogCombobox'
import { ModelSelect } from './catalog/ModelSelect'
import { TemplateRequirements } from './catalog/TemplateRequirements'
import { Check, ExternalLink, LoaderCircle } from 'lucide-react'
import { HostError, invoke, openWorkspace } from './host'
import { canUseExpert } from './catalog-labels'
import { ApplicationScreenshots } from './ApplicationScreenshots'
import type { ApplicationSetup, CatalogItem, ExpertItem, WorkspaceOption, TemplatePreflight } from './catalog-types'

export function CatalogSetup({
  item,
  creation = false,
  webUrl,
  onBusy,
  onUse,
  onRequested
}: {
  item: CatalogItem
  creation?: boolean
  webUrl: string
  onBusy: (busy: boolean) => void
  onUse: (id: string) => Promise<void>
  onRequested: (item: ExpertItem) => void
}) {
  const [setup, setSetup] = useState<ApplicationSetup | null>(null)
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([])
  const [hasPrimaryLanguageModel, setHasPrimaryLanguageModel] = useState<boolean | null>(null)
  const [preflight, setPreflight] = useState<TemplatePreflight | null>(null)
  const [capabilities, setCapabilities] = useState<string[]>([])
  const [templateModel, setTemplateModel] = useState('')
  const [workspaceId, setWorkspaceId] = useState('')
  const [title, setTitle] = useState(creation ? '' : item.name.slice(0, 100))
  const [prompt, setPrompt] = useState('')
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
      setHasPrimaryLanguageModel(null)
      try {
        if (item.kind === 'applications') {
          const result = await invoke('applicationSetup', { pluginName: item.pluginName, appName: item.appName })
          if (!active) return
          setSetup(result)
          setEmbedding(result.defaultEmbeddingModelId)
          setVision(result.defaultVisionModelId)
          if (result.application.status === 'ready') setInstalled(result.application.botId)
        } else if (item.kind === 'templates') {
          const result = await invoke('templateSetup', { id: item.id, capabilities })
          if (!active) return
          setWorkspaces(result.workspaces)
          setWorkspaceId((current) =>
            result.workspaces.some((workspace) => workspace.id === current) ? current : result.workspaces[0]?.id || ''
          )
          setPreflight(result.preflight ?? null)
          setTemplateModel((current) => (result.preflight?.models.some((model) => model.id === current) ? current : ''))
          setHasPrimaryLanguageModel(result.hasPrimaryLanguageModel)
        }
      } catch (error) {
        if (active) {
          setPreflight(null)
          setTemplateModel('')
          setError(error instanceof Error ? error.message : t('Could not load installation settings.'))
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [item, revision, capabilities])
  const initializing = setup?.application.status === 'initializing'
  const canSubmit =
    !busy &&
    !loading &&
    !uncertain &&
    (installed ||
      (item.kind === 'experts'
        ? reason.trim().length > 0
        : item.kind === 'templates'
          ? workspaceId &&
            title.trim() &&
            preflight?.canInstall !== false &&
            (preflight?.requiresModel ? !!templateModel : hasPrimaryLanguageModel === true)
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
          : await invoke('installTemplate', {
              id: item.id,
              workspaceId,
              title: title.trim(),
              ...(creation ? { prompt } : {}),
              capabilities,
              modelId: templateModel || undefined
            })
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
          {item.kind === 'applications' && (
            <ApplicationScreenshots name={item.name} screenshots={setup?.application.screenshots ?? item.screenshots} />
          )}
          {loading && !preflight ? (
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
                  {hasPrimaryLanguageModel === false && !preflight?.requiresModel && !installed && (
                    <p role="status" className="rounded-lg bg-muted p-4 text-sm">
                      {t(
                        'No authorized primary language model is configured for this organization. Ask an administrator to set a default primary model in Xpert and grant access, then refresh settings.'
                      )}
                    </p>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="assistant-title">{t('Assistant name')}</Label>
                    <Input
                      id="assistant-title"
                      value={title}
                      maxLength={100}
                      autoFocus={creation}
                      placeholder={creation ? t('New digital expert') : undefined}
                      required
                      disabled={busy || !!installed}
                      onChange={(event) => setTitle(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">{t('Target workspace')}</p>
                    <CatalogCombobox
                      label={t('Select a workspace you can edit')}
                      searchLabel={t('Search workspaces')}
                      items={workspaces}
                      value={workspaceId}
                      onChange={setWorkspaceId}
                      disabled={busy || !!installed}
                    />
                    {!error && !workspaces.length && (
                      <p className="text-sm text-destructive">
                        {t('No writable workspace is available. Create one in Xpert or request edit access.')}
                      </p>
                    )}
                  </div>
                  {creation && (
                    <div className="space-y-2">
                      <Label htmlFor="assistant-prompt">{t('Instructions')}</Label>
                      <Textarea
                        id="assistant-prompt"
                        value={prompt}
                        onChange={(event) => setPrompt(event.target.value)}
                        placeholder={t('Describe the assistant’s role, goals and response style.')}
                        maxLength={32000}
                        rows={5}
                        disabled={busy || !!installed}
                      />
                      <p className="text-xs text-muted-foreground">
                        {t('Optional. Capability instructions are managed automatically.')}
                      </p>
                    </div>
                  )}
                  <TemplateRequirements
                    preflight={preflight}
                    capabilities={capabilities}
                    onCapabilities={setCapabilities}
                    model={templateModel}
                    onModel={setTemplateModel}
                    disabled={busy || loading || !!installed}
                  />
                  {loading && (
                    <p role="status" className="text-sm text-muted-foreground">
                      {t('Checking installation settings…')}
                    </p>
                  )}
                  <div className="space-y-2 border-t pt-5 text-sm leading-6 text-muted-foreground">
                    <p>
                      {creation
                        ? t(
                            'Create and publish an assistant in this workspace, then start chatting. Change its model, capabilities and instructions later in Edit profile.'
                          )
                        : t(
                            'This initializes the template resources in your chosen workspace and creates and publishes a chat assistant.'
                          )}
                    </p>
                    <p>
                      {preflight?.requiresModel
                        ? t('The selected model and capabilities will be configured before publishing.')
                        : t(
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
                  : creation
                    ? t('Create & chat')
                    : t('Install & use')}
          </Button>
        </div>
      </div>
    </form>
  )
}
