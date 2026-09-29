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
import { LoaderCircle } from 'lucide-react'
import { t } from '../i18n'
import { invoke } from '../host'
import { TemplateRequirements } from '../catalog/TemplateRequirements'
import type { Bot } from '../types'
import type { AssistantSettings } from './types'

export function AssistantSettingsDialog({
  bot,
  onClose,
  onSaved
}: {
  bot: Bot
  onClose: () => void
  onSaved: (id: string) => Promise<void>
}) {
  const [name, setName] = useState(bot.name)
  const [description, setDescription] = useState(bot.description)
  const [settings, setSettings] = useState<AssistantSettings | null>(null)
  const [capabilities, setCapabilities] = useState<string[] | undefined>()
  const [model, setModel] = useState('')
  const [prompt, setPrompt] = useState('')
  const [dirty, setDirty] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const initialRevision = useRef<string | null>(null)
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    invoke('assistantConfiguration', { botId: bot.id, capabilities })
      .then((result) => {
        if (!active) return
        if (result.canEdit) {
          if (initialRevision.current === null) {
            initialRevision.current = result.revision
            setPrompt(result.prompt)
            setModel(result.modelId)
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
        if (active) setError(error instanceof Error ? error.message : t('The operation failed. Please retry.'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [bot.id, capabilities, reload])
  const disabled = saving || loading
  const canSave =
    !!name.trim() && !disabled && (!dirty || (settings?.canEdit && settings.preflight.canInstall && !!model && !error))
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
            setError('')
            try {
              if (dirty && settings?.canEdit) {
                await invoke('saveAssistantConfiguration', {
                  botId: bot.id,
                  revision: settings.revision,
                  prompt,
                  modelId: model,
                  capabilities: capabilities ?? settings.capabilities
                })
                setDirty(false)
              }
              await invoke('editBot', { botId: bot.id, name, description })
              await onSaved(bot.id)
              onClose()
            } catch (error) {
              setError(error instanceof Error ? error.message : t('The operation failed. Please retry.'))
            } finally {
              setSaving(false)
            }
          }}
        >
          <Tabs defaultValue="profile" className="flex min-h-0 flex-col">
            <TabsList className="mx-6 mb-3 shrink-0">
              <TabsTrigger value="profile">{t('Profile')}</TabsTrigger>
              <TabsTrigger value="configuration" disabled={!settings?.canEdit}>
                {t('Model & capabilities')}
              </TabsTrigger>
              <TabsTrigger value="prompt" disabled={!settings?.canEdit}>
                {t('Instructions')}
              </TabsTrigger>
            </TabsList>
            <div className="min-h-0 overflow-y-auto px-6 pb-5">
              <TabsContent value="profile" className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {t('Changes only affect this assistant in your desktop list.')}
                </p>
                <div className="space-y-2">
                  <Label htmlFor="edit-assistant-name">{t('Name')}</Label>
                  <Input
                    id="edit-assistant-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={200}
                    required
                    disabled={saving}
                  />
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
                {settings?.canEdit === false && (
                  <p className="text-sm text-muted-foreground">
                    {t('Editing models, capabilities and instructions requires workspace edit access.')}
                  </p>
                )}
              </TabsContent>
              {settings?.canEdit && (
                <>
                  <TabsContent value="configuration" className="space-y-5">
                    <p className="text-sm text-muted-foreground">
                      {t('Workspace')}: {settings.workspace.name}
                    </p>
                    <TemplateRequirements
                      preflight={settings.preflight}
                      capabilities={capabilities ?? settings.capabilities}
                      onCapabilities={(value) => {
                        setDirty(true)
                        setCapabilities(value)
                      }}
                      model={model}
                      onModel={(value) => {
                        setDirty(true)
                        setModel(value)
                      }}
                      disabled={disabled}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t(
                        'Capabilities built into the original workflow are kept. Advanced workflow settings remain in Xpert.'
                      )}
                    </p>
                  </TabsContent>
                  <TabsContent value="prompt" className="space-y-3">
                    <Label htmlFor="edit-assistant-prompt">{t('Instructions')}</Label>
                    <Textarea
                      id="edit-assistant-prompt"
                      value={prompt}
                      onChange={(event) => {
                        setDirty(true)
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
                  </TabsContent>
                </>
              )}
              {loading && (
                <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin" />
                  {t('Checking installation settings…')}
                </p>
              )}
              {error && (
                <div role="alert" className="mt-3 space-y-2 text-sm text-destructive">
                  <p>{error}</p>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => {
                      initialRevision.current = null
                      setSettings(null)
                      setCapabilities(undefined)
                      setDirty(false)
                      setReload((value) => value + 1)
                    }}
                  >
                    {t('Reload saved settings')}
                  </Button>
                </div>
              )}
            </div>
          </Tabs>
          <div className="flex shrink-0 items-center justify-end gap-2 border-t px-6 py-4">
            {dirty && (
              <span className="mr-auto text-xs text-muted-foreground">
                {t('Assistant settings take effect after publishing.')}
              </span>
            )}
            <Button type="button" variant="ghost" disabled={saving} onClick={onClose}>
              {t('Cancel')}
            </Button>
            <Button type="submit" disabled={!canSave}>
              {saving && <LoaderCircle className="size-4 animate-spin" />}
              {t(dirty ? 'Save & publish' : 'Save changes')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
