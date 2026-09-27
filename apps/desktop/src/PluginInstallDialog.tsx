import { useEffect, useRef, useState } from 'react'
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@xpert-ai/shadcn-ui'
import { LoaderCircle } from 'lucide-react'
import { CatalogCombobox } from './CatalogCombobox'
import { PluginAvatar } from './avatar'
import { invoke } from './host'
import { t } from './i18n'
import type { PluginLibraryItem } from './plugin-library-types'

export function PluginInstallDialog({
  item,
  workspace,
  experts,
  onClose,
  onAdded
}: {
  item: PluginLibraryItem
  workspace: { id: string; name: string }
  experts: { id: string; name: string }[]
  onClose: () => void
  onAdded: () => void
}) {
  const [mappings, setMappings] = useState<{ [reference: string]: string }>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const alive = useRef(true)
  const submitting = useRef(false)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const add = async () => {
    if (submitting.current) return
    submitting.current = true
    setBusy(true)
    setError('')
    try {
      await invoke('addWorkspacePlugin', { workspaceId: workspace.id, packageId: item.id, experts: mappings })
      if (alive.current) onAdded()
    } catch (reason) {
      if (alive.current) setError(reason instanceof Error ? reason.message : t('Could not add plugin.'))
    } finally {
      submitting.current = false
      if (alive.current) setBusy(false)
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('Add to workspace')}</DialogTitle>
          <DialogDescription>
            {t(
              'Adding a plugin makes it available to this workspace. It does not select it in a conversation or authorize a service connection.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-3">
          <PluginAvatar icon={item.icon} />
          <div>
            <p className="font-semibold">{item.name}</p>
            <p className="text-xs text-muted-foreground">
              {t('Version')}: {item.version}
            </p>
          </div>
        </div>
        <p className="text-sm">
          {t('Workspace')}: <strong>{workspace.name}</strong>
        </p>
        {!!item.components.length && (
          <div className="text-sm">
            <p className="mb-1 font-medium">{t('Included capabilities')}</p>
            <p className="text-muted-foreground">{item.components.map((component) => component.name).join(', ')}</p>
          </div>
        )}
        {item.expertReferences.map((reference) => (
          <div key={reference} className="space-y-1">
            <p className="text-sm">{reference}</p>
            <CatalogCombobox
              items={experts}
              value={mappings[reference] || ''}
              label={t('Select a digital expert')}
              searchLabel={t('Search digital experts')}
              disabled={busy}
              onChange={(id) => setMappings((previous) => ({ ...previous, [reference]: id }))}
            />
          </div>
        ))}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button
            disabled={busy || item.expertReferences.some((reference) => !mappings[reference])}
            onClick={() => void add()}
          >
            {busy && <LoaderCircle className="size-4 animate-spin" />}
            {t('Add plugin')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
