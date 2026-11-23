import { TemplateSetupPanel } from './TemplateSetupPanel'
import { useEffect, useRef, useState } from 'react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Input,
  Label,
  Textarea,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent
} from '@xpert-ai/shadcn-ui'
import { ExternalLink, LoaderCircle } from 'lucide-react'
import { t } from '../i18n'
import { invoke } from '../host'
import { TemplateRequirements } from '../catalog/TemplateRequirements'
import type { Bot } from '../types'
import type { AssistantSettings } from './types'
import { AssistantAppearanceDialog } from '../avatar/AssistantAppearanceDialog'
import { platformCommandUrl } from '../../electron/workbench-platform.mjs'

export function AssistantSettingsDialog({
  bot,
  webUrl,
  onClose,
  onOpenConversation,
  onDescriptionSaved,
  onSaved
}: {
  bot: Bot
  webUrl: string
  onClose: () => void
  onOpenConversation?: (id: string, threadId: string) => void
  onDescriptionSaved: (id: string, description: string) => void
  onSaved: (id: string) => Promise<void>
}) {
  const [tab, setTab] = useState('profile')
  const sharedTab = tab === 'configuration' || tab === 'prompt'
  const [description, setDescription] = useState(bot.description)
  const [savedDescription, setSavedDescription] = useState(bot.description)
  const [settings, setSettings] = useState<AssistantSettings | null>(null)
  const [capabilities, setCapabilities] = useState<string[] | undefined>()
  const [model, setModel] = useState('')
  const [realtimeVoice, setRealtimeVoice] = useState<import('../catalog-types').VoiceSelection>()
  const [prompt, setPrompt] = useState('')
  const [configurationDirty, setConfigurationDirty] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [configurationError, setConfigurationError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [configurationRequest, setConfigurationRequest] = useState(0)
  const [customizing, setCustomizing] = useState(false)
  const initialRevision = useRef<string | null>(null)
  useEffect(() => {
    if (!configurationRequest) return
    let active = true
    setLoading(true)
    setConfigurationError('')
    invoke('assistantConfiguration', { botId: bot.id, capabilities })
      .then((result) => {
        if (!active) return
        if (result.canEdit) {
          if (initialRevision.current === null) {
            initialRevision.current = result.revision
            setPrompt(result.prompt)
            setModel(result.modelId)
            setRealtimeVoice(result.realtimeVoice)
          } else {
            setModel((value) => (result.preflight.models.some((item) => item.id === value) ? value : ''))
          }
          // Keep the original revision so a later preflight cannot hide concurrent edits.
          setSettings({ ...result, revision: initialRevision.current })
        } else {
          setSettings(result)
        }
      })
      .catch((error) => {
        if (active)
          setConfigurationError(error instanceof Error ? error.message : t('The operation failed. Please retry.'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [bot.id, capabilities, configurationRequest])
  const disabled = saving || loading
  const studioUrl = platformCommandUrl(webUrl, { target: 'assistant.studio', assistantId: bot.assistantId || bot.id })
  const voiceConfigured =
    !(capabilities ?? (settings?.canEdit ? settings.capabilities : [])).includes('realtime-voice') ||
    !!(realtimeVoice?.modelId && realtimeVoice.voice)
  const publish = sharedTab && configurationDirty
  const canSave =
    !saving &&
    (publish
      ? !loading &&
        settings?.canEdit &&
        settings.preflight.canInstall &&
        !!model &&
        voiceConfigured &&
        !configurationError
      : description !== savedDescription)
  const configurationFeedback = (
    <>
      {settings?.canEdit === false && (
        <p className="text-sm text-muted-foreground">
          {t('Editing models, capabilities and instructions requires workspace edit access.')}
        </p>
      )}
      {loading && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          {t('Loading…')}
        </p>
      )}
      {configurationError && (
        <div role="alert" className="mt-3 space-y-2 text-sm text-destructive">
          <p>{configurationError}</p>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => {
              initialRevision.current = null
              setSettings(null)
              setCapabilities(undefined)
              setConfigurationDirty(false)
              setConfigurationRequest((value) => value + 1)
            }}
          >
            {t('Reload saved settings')}
          </Button>
        </div>
      )}
    </>
  )
  if (customizing)
    return (
      <AssistantAppearanceDialog
        botId={bot.id}
        onClose={() => setCustomizing(false)}
        onSaved={async () => {
          await onSaved(bot.id)
          onClose()
        }}
      />
    )
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose()
      }}
    >
      <DialogContent
        className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
        onInteractOutside={(event) => {
          if (saving) event.preventDefault()
        }}
        onEscapeKeyDown={(event) => {
          if (saving) event.preventDefault()
        }}
      >
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4">
          <DialogTitle>{t('Edit profile')}</DialogTitle>
          <DialogDescription>
            {t('Personal profile stays on this computer. Assistant settings are shared across its users.')}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-col"
          onSubmit={async (event) => {
            event.preventDefault()
            if (!canSave) return
            setSaving(true)
            setSaveError('')
            try {
              if (publish && settings?.canEdit) {
                try {
                  await invoke('saveAssistantConfiguration', {
                    botId: bot.id,
                    revision: settings.revision,
                    prompt,
                    modelId: model,
                    realtimeVoice: (capabilities ?? settings.capabilities).includes('realtime-voice')
                      ? realtimeVoice
                      : undefined,
                    capabilities: capabilities ?? settings.capabilities
                  })
                } catch (error) {
                  setConfigurationError(
                    error instanceof Error ? error.message : t('The operation failed. Please retry.')
                  )
                  return
                }
                setConfigurationDirty(false)
              }
              if (description !== savedDescription) {
                const value = description.trim()
                await invoke('editBot', { botId: bot.id, description: value })
                setDescription(value)
                setSavedDescription(value)
                if (!publish) onDescriptionSaved(bot.id, value)
              }
              if (publish) await onSaved(bot.id)
              if (publish || !configurationDirty) onClose()
            } catch (error) {
              setSaveError(error instanceof Error ? error.message : t('The operation failed. Please retry.'))
            } finally {
              setSaving(false)
            }
          }}
        >
          <Tabs
            value={tab}
            onValueChange={(next) => {
              setTab(next)
              if (!configurationRequest && (next === 'configuration' || next === 'prompt')) setConfigurationRequest(1)
            }}
            className="flex min-h-0 flex-col"
          >
            <TabsList className="mx-6 mb-3 shrink-0">
              <TabsTrigger value="template">{t('Template setup')}</TabsTrigger>
              <TabsTrigger value="profile">{t('Profile')}</TabsTrigger>
              <TabsTrigger value="configuration">{t('Model & capabilities')}</TabsTrigger>
              <TabsTrigger value="prompt">{t('Instructions')}</TabsTrigger>
            </TabsList>
            <div className="min-h-0 overflow-y-auto px-6 pb-5">
              <TabsContent value="template">
                <TemplateSetupPanel
                  botId={bot.id}
                  webUrl={webUrl}
                  onOpen={
                    onOpenConversation
                      ? (threadId) => {
                          onClose()
                          onOpenConversation(bot.id, threadId)
                        }
                      : undefined
                  }
                />
              </TabsContent>
              <TabsContent value="profile" className="space-y-4">
                <Button type="button" variant="outline" disabled={saving} onClick={() => setCustomizing(true)}>
                  {t('Customize your assistant')}
                </Button>
                <p className="text-sm text-muted-foreground">
                  {t('Changes only affect this assistant in your desktop list.')}
                </p>
                <div className="space-y-2">
                  <Label htmlFor="edit-assistant-name">{t('Name')}</Label>
                  <Input id="edit-assistant-name" value={bot.name} maxLength={200} required disabled />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-assistant-description">{t('Description')}</Label>
                  <Textarea
                    id="edit-assistant-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    maxLength={4000}
                    rows={4}
                    disabled={saving}
                  />
                </div>
              </TabsContent>
              <TabsContent value="configuration" className="space-y-5">
                {settings?.canEdit && (
                  <>
                    <p className="text-sm text-muted-foreground">
                      {t('Workspace')}: {settings.workspace.name}
                    </p>
                    <TemplateRequirements
                      preflight={settings.preflight}
                      capabilities={capabilities ?? settings.capabilities}
                      onCapabilities={(value) => {
                        setConfigurationDirty(true)
                        setCapabilities(value)
                      }}
                      realtimeVoice={realtimeVoice}
                      onRealtimeVoice={(value) => {
                        setConfigurationDirty(true)
                        setRealtimeVoice(value)
                      }}
                      model={model}
                      onModel={(value) => {
                        setConfigurationDirty(true)
                        setModel(value)
                      }}
                      disabled={disabled}
                    />
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        {t('Capabilities built into the original workflow are kept.')}
                      </p>
                      {studioUrl && (
                        <Button asChild variant="link" className="h-auto p-0 text-sm">
                          <a href={studioUrl} target="_blank" rel="noopener noreferrer">
                            {t('Edit workflow in Xpert Studio')}
                            <ExternalLink className="size-3.5" aria-hidden="true" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </>
                )}
                {configurationFeedback}
              </TabsContent>
              <TabsContent value="prompt" className="space-y-3">
                {settings?.canEdit && (
                  <>
                    <Label htmlFor="edit-assistant-prompt">{t('Instructions')}</Label>
                    <Textarea
                      id="edit-assistant-prompt"
                      value={prompt}
                      onChange={(event) => {
                        setConfigurationDirty(true)
                        setPrompt(event.target.value)
                      }}
                      placeholder={t('Describe the assistant’s role, goals and response style.')}
                      rows={10}
                      maxLength={32000}
                      disabled={saving}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('Optional. Capability instructions are managed automatically.')}
                    </p>
                  </>
                )}
                {configurationFeedback}
              </TabsContent>
              {saveError && (
                <p role="alert" className="text-sm text-destructive">
                  {saveError}
                </p>
              )}
            </div>
          </Tabs>
          <div className="flex shrink-0 items-center justify-end gap-2 border-t px-6 py-4">
            {configurationDirty && (
              <span className="mr-auto text-xs text-muted-foreground">
                {t('Assistant settings take effect after publishing.')}
              </span>
            )}
            <Button type="button" variant="ghost" disabled={saving} onClick={onClose}>
              {t('Cancel')}
            </Button>
            <Button type="submit" disabled={!canSave}>
              {saving && <LoaderCircle className="size-4 animate-spin" />}
              {t(publish ? 'Save & publish' : 'Save changes')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
