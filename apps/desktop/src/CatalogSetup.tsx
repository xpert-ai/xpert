import { TemplateManifestDetails } from './catalog/TemplateManifestDetails'
import { platformCommandUrl } from '../electron/workbench-platform.mjs'
import { TemplateInstallationProgress, useTemplateInstallation } from './catalog/TemplateInstallation'
import { getLocale, t } from './i18n'
import { useEffect, useRef, useState } from 'react'
import { Button, Input, Label, Textarea } from '@xpert-ai/shadcn-ui'
import { CatalogCombobox } from './CatalogCombobox'
import { ModelCascader } from './catalog/ModelCascader'
import { TemplateRequirements } from './catalog/TemplateRequirements'
import { ApplicationToolsets } from './catalog/ApplicationToolsets'
import { applicationToolsetsSelected, reconcileApplicationToolsets } from './catalog/application-toolsets'
import { Check, ExternalLink, LoaderCircle } from 'lucide-react'
import { invoke, openWorkspace } from './host'
import { canUseExpert, categoryLabel } from './catalog-labels'
import { ApplicationScreenshots } from './ApplicationScreenshots'
import type {
  ApplicationSetup,
  ApplicationToolsetSelection,
  CatalogItem,
  ExpertItem,
  WorkspaceOption,
  TemplatePreflight
} from './catalog-types'

export function CatalogSetup({
  installationScope,
  organizationId,
  item,
  creation = false,
  webUrl,
  onBusy,
  onUse,
  onRequested,
  onInstalled,
  onItemUpdated
}: {
  organizationId: string
  installationScope: string
  item: CatalogItem
  creation?: boolean
  webUrl: string
  onBusy: (busy: boolean) => void
  onUse: (id: string) => Promise<void>
  onRequested: (item: ExpertItem) => void
  onInstalled: () => void
  onItemUpdated: (item: CatalogItem) => void
}) {
  const [setup, setSetup] = useState<ApplicationSetup | null>(null)
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([])
  const [hasPrimaryLanguageModel, setHasPrimaryLanguageModel] = useState<boolean | null>(null)
  const [preflight, setPreflight] = useState<TemplatePreflight | null>(null)
  const [capabilities, setCapabilities] = useState<string[]>([])
  const [templateModel, setTemplateModel] = useState('')
  const [realtimeVoice, setRealtimeVoice] = useState<import('./catalog-types').VoiceSelection>()
  const [workspaceId, setWorkspaceId] = useState('')
  const [title, setTitle] = useState(creation ? '' : item.name.slice(0, 100))
  const [prompt, setPrompt] = useState('')
  const [reason, setReason] = useState('')
  const [embedding, setEmbedding] = useState('')
  const [vision, setVision] = useState('')
  const [toolsets, setToolsets] = useState<ApplicationToolsetSelection[]>([])
  const [editingToolset, setEditingToolset] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [operationId] = useState(() => crypto.randomUUID())
  const [loading, setLoading] = useState(item.kind !== 'experts')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [installed, setInstalled] = useState<string | null>(null)
  const installation = useTemplateInstallation(installationScope, item.kind === 'templates' ? workspaceId : '', item.id)
  const templateLocked = !!installation.state.operation || installation.state.uncertain || installation.state.busy
  const uncertain = installation.state.uncertain
  const completedInstallation = useRef<string | null>(null)
  useEffect(() => {
    const operation = installation.state.operation
    if (operation?.status === 'succeeded' && operation.id !== completedInstallation.current) {
      completedInstallation.current = operation.id
      onInstalled()
    }
  }, [installation.state.operation, onInstalled])
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
          onItemUpdated(result.application)
          setSetup(result)
          setEmbedding((current) =>
            result.embeddingModels.some((model) => model.id === current) ? current : result.defaultEmbeddingModelId
          )
          setVision((current) =>
            result.visionModels.some((model) => model.id === current) ? current : result.defaultVisionModelId
          )
          setToolsets((current) => reconcileApplicationToolsets(result.toolsetRequirements, current))
          if (result.application.status === 'ready') setInstalled(result.application.botId)
        } else if (item.kind === 'templates') {
          const result = await invoke('templateSetup', {
            id: item.id,
            capabilities,
            ...(workspaceId ? { workspaceId } : {})
          })
          if (!active) return
          setWorkspaces(result.workspaces)
          setWorkspaceId((current) =>
            result.workspaces.some((workspace) => workspace.id === current) ? current : result.workspaces[0]?.id || ''
          )
          setPreflight(result.preflight ?? null)
          const defaultModelId = result.preflight?.defaultModelId
          setTemplateModel((current) =>
            result.preflight?.models.some((model) => model.id === current)
              ? current
              : result.preflight?.models.some((model) => model.id === defaultModelId)
                ? (defaultModelId ?? '')
                : ''
          )
          setHasPrimaryLanguageModel(result.hasPrimaryLanguageModel)
        }
      } catch (error) {
        if (active) {
          if (item.kind === 'applications') setSetup(null)
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
  }, [item, revision, capabilities, onItemUpdated, workspaceId])
  const initializing = setup?.application.status === 'initializing'
  const canSubmit =
    !busy &&
    !loading &&
    !uncertain &&
    !editingToolset &&
    (installed ||
      (item.kind === 'experts'
        ? reason.trim().length > 0
        : item.kind === 'templates'
          ? installation.client &&
            !templateLocked &&
            workspaceId &&
            title.trim() &&
            preflight?.canInstall !== false &&
            (!capabilities.includes('realtime-voice') || !!(realtimeVoice?.modelId && realtimeVoice.voice)) &&
            (preflight?.requiresModel
              ? preflight.models.some((model) => model.id === templateModel)
              : hasPrimaryLanguageModel === true)
          : setup?.canInitialize &&
            !initializing &&
            (!setup.requireEmbedding || embedding) &&
            (!setup.requireVision || vision) &&
            applicationToolsetsSelected(setup.toolsetRequirements, toolsets)))
  const submit = async () => {
    if (!canSubmit) return
    setBusy(true)
    onBusy(true)
    setError('')
    try {
      if (installed) {
        await onUse(installed)
        return
      }
      if (item.kind === 'experts') {
        const result = await invoke('requestExpertAccess', { id: item.id, reason: reason.trim() })
        onItemUpdated(result)
        if (canUseExpert(result)) await onUse(result.id)
        else onRequested(result)
        return
      }
      if (item.kind === 'templates') {
        await installation.client?.start({
          templateId: item.id,
          workspaceId,
          publish: true,
          locale: getLocale(),
          capabilities,
          basic: {
            title: title.trim(),
            ...(creation ? { prompt } : {}),
            realtimeVoice: capabilities.includes('realtime-voice') ? realtimeVoice : undefined,
            copilotModel: preflight?.models.find((model) => model.id === templateModel)?.copilotModel
          }
        })
        return
      }
      const result = await invoke('initializeApplication', {
        pluginName: item.pluginName,
        appName: item.appName,
        operationId,
        toolsets,
        ...(embedding ? { embeddingModelId: embedding } : {}),
        ...(vision ? { visionModelId: vision } : {})
      })
      setInstalled(result.botId)
      onInstalled()
      await onUse(result.botId)
    } catch (error) {
      setError(error instanceof Error ? error.message : t('The operation failed. Please retry.'))
    } finally {
      setBusy(false)
      onBusy(false)
    }
  }
  const discardConfiguration = async () => {
    if (item.kind !== 'applications' || !setup?.canDiscardConfiguration || busy || editingToolset) return
    setBusy(true)
    onBusy(true)
    setError('')
    try {
      const result = await invoke('discardApplicationConfiguration', {
        pluginName: item.pluginName,
        appName: item.appName
      })
      setSetup(result)
      setToolsets([])
      setConfirmDiscard(false)
      onItemUpdated(result.application)
    } catch (error) {
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
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{item.publisher || 'Xpert'}</span>
                {item.tags.map((tag) => (
                  <span key={tag} className="rounded-md bg-muted px-2 py-1">
                    {categoryLabel(tag)}
                  </span>
                ))}
              </div>
              <ApplicationScreenshots
                name={item.name}
                screenshots={setup?.application.screenshots ?? item.screenshots}
              />
            </>
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
                      disabled={busy || !!installed || templateLocked}
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
                      disabled={busy || installation.state.busy}
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
                        disabled={busy || !!installed || templateLocked}
                      />
                      <p className="text-xs text-muted-foreground">
                        {t('Optional. Capability instructions are managed automatically.')}
                      </p>
                    </div>
                  )}
                  <TemplateManifestDetails
                    readiness={preflight?.readiness}
                    onManage={() => {
                      const target = { target: 'workspace.plugins.manage', organizationId, workspaceId }
                      if (window.xpertDesktop) void window.xpertDesktop.openPlatform(target)
                      else {
                        const url = platformCommandUrl(webUrl, target)
                        if (url) window.open(url, '_blank', 'noopener,noreferrer')
                      }
                    }}
                  />
                  <TemplateRequirements
                    preflight={preflight}
                    capabilities={capabilities}
                    onCapabilities={setCapabilities}
                    model={templateModel}
                    onModel={setTemplateModel}
                    realtimeVoice={realtimeVoice}
                    onRealtimeVoice={setRealtimeVoice}
                    disabled={busy || loading || !!installed || templateLocked}
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
                  {!!setup.application.composition?.length && (
                    <section className="space-y-2 border-t pt-4">
                      <h3 className="font-medium">{t('Included with this application')}</h3>
                      <ul className="space-y-2 text-sm">
                        {setup.application.composition.map((entry) => (
                          <li key={entry.key}>
                            {entry.title}{' '}
                            <span className="text-muted-foreground">
                              · {t(`App composition ${entry.role ?? entry.kind}`)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                  {!installed && (
                    <>
                      {(setup.requireEmbedding || setup.requireVision) && (
                        <div className="space-y-5 border-t pt-5">
                          {setup.requireEmbedding && (
                            <ModelCascader
                              id="embedding-model"
                              label={t(setup.embeddingLabel)}
                              models={setup.embeddingModels}
                              defaultModelId={setup.defaultEmbeddingModelId}
                              value={embedding}
                              onChange={setEmbedding}
                              disabled={busy || editingToolset}
                            />
                          )}
                          {setup.requireVision && (
                            <ModelCascader
                              id="vision-model"
                              label={t(setup.visionLabel)}
                              models={setup.visionModels}
                              defaultModelId={setup.defaultVisionModelId}
                              value={vision}
                              onChange={setVision}
                              disabled={busy || editingToolset}
                            />
                          )}
                        </div>
                      )}
                      <ApplicationToolsets
                        application={{ pluginName: item.pluginName, appName: item.appName }}
                        setup={setup}
                        selections={toolsets}
                        onSelections={setToolsets}
                        disabled={busy || loading || initializing}
                        webUrl={webUrl}
                        onRefresh={() => setRevision((value) => value + 1)}
                        onEditing={setEditingToolset}
                        onBusy={(value) => {
                          setBusy(value)
                          onBusy(value)
                        }}
                      />
                      {setup.canDiscardConfiguration && !initializing && (
                        <div className="space-y-3 border-t pt-5">
                          {confirmDiscard ? (
                            <>
                              <p className="text-sm text-muted-foreground">
                                {t(
                                  'Discard this unfinished app configuration and its setup workspace? Existing source configurations are kept.'
                                )}
                              </p>
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  disabled={busy}
                                  onClick={() => setConfirmDiscard(false)}
                                >
                                  {t('Cancel')}
                                </Button>
                                <Button
                                  type="button"
                                  variant="destructive"
                                  disabled={busy || editingToolset}
                                  onClick={() => void discardConfiguration()}
                                >
                                  {t('Discard configuration')}
                                </Button>
                              </div>
                            </>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              disabled={busy || editingToolset}
                              onClick={() => setConfirmDiscard(true)}
                            >
                              {t('Discard configuration')}
                            </Button>
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
          {item.kind === 'templates' && (
            <TemplateInstallationProgress
              organizationId={organizationId}
              state={installation.state}
              client={installation.client}
              webUrl={webUrl}
              onUse={onUse}
            />
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
              disabled={busy || loading || uncertain || editingToolset}
              onClick={() => setRevision((value) => value + 1)}
            >
              {t('Refresh settings')}
            </Button>
          )}
          {!(item.kind === 'templates' && (installation.state.operation || uncertain)) && (
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
          )}
        </div>
      </div>
    </form>
  )
}
