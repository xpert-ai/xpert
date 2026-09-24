import { useState } from 'react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea
} from '@xpert-ai/shadcn-ui'
import { LoaderCircle } from 'lucide-react'
import { invoke } from './host'
import { t } from './i18n'
import type { Bot } from './types'
import type { SidebarState } from './assistant-list-types'

export function AssistantDialog({
  bot,
  mode,
  onClose,
  onSaved,
  onSidebar
}: {
  bot: Bot
  mode: 'edit' | 'duplicate' | 'section'
  onClose: () => void
  onSaved: (id: string) => Promise<void>
  onSidebar: (value: SidebarState) => void
}) {
  const [name, setName] = useState(
    mode === 'section' ? '' : mode === 'duplicate' ? t('{{name}} copy', { name: bot.name }) : bot.name
  )
  const [description, setDescription] = useState(bot.description)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const title = t(mode === 'section' ? 'New section' : mode === 'edit' ? 'Edit profile' : 'Duplicate assistant')
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose()
      }}
    >
      <DialogContent
        className="max-h-[85vh] overflow-y-auto p-0 sm:max-w-lg"
        onInteractOutside={(event) => {
          if (saving) event.preventDefault()
        }}
        onEscapeKeyDown={(event) => {
          if (saving) event.preventDefault()
        }}
      >
        <form
          onSubmit={async (event) => {
            event.preventDefault()
            setSaving(true)
            setError('')
            try {
              if (mode === 'section')
                onSidebar(await invoke('updateSidebar', { action: 'section', name, botId: bot.id }))
              else {
                const result =
                  mode === 'edit'
                    ? await invoke('editBot', { botId: bot.id, name, description })
                    : await invoke('duplicateBot', { botId: bot.id, name })
                await onSaved(result.botId)
              }
              onClose()
            } catch (error) {
              setError(error instanceof Error ? error.message : t('The operation failed. Please retry.'))
            } finally {
              setSaving(false)
            }
          }}
        >
          <DialogHeader className="sticky top-0 z-10 bg-background px-6 pt-6 pb-4">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {t(
                mode === 'section'
                  ? 'Organize assistants in a personal section on this computer.'
                  : mode === 'edit'
                    ? 'Changes only affect this assistant in your desktop list.'
                    : 'Create a separate local entry connected to the same platform assistant.'
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-6 py-2">
            <div className="space-y-2">
              <Label htmlFor="assistant-name">{t('Name')}</Label>
              <Input
                id="assistant-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={200}
                autoFocus
                disabled={saving}
              />
            </div>
            {mode === 'edit' && (
              <div className="space-y-2">
                <Label htmlFor="assistant-description">{t('Description')}</Label>
                <Textarea
                  id="assistant-description"
                  value={description}
                  maxLength={4000}
                  onChange={(event) => setDescription(event.target.value)}
                  disabled={saving}
                  rows={4}
                />
              </div>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-background px-6 py-4 mt-4">
            <Button type="button" variant="ghost" disabled={saving} onClick={onClose}>
              {t('Cancel')}
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving && <LoaderCircle className="size-4 animate-spin" />}
              {t(mode === 'duplicate' ? 'Duplicate and use' : mode === 'section' ? 'Create section' : 'Save changes')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
