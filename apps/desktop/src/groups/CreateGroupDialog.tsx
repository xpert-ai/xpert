import { useEffect, useState } from 'react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Input,
  Label
} from '@xpert-ai/shadcn-ui'
import { LoaderCircle, Search, Check, Users } from 'lucide-react'
import { invoke } from '../host'
import { t } from '../i18n'
import type { GroupCandidate } from './types'

export function CreateGroupDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState('')
  const [search, setSearch] = useState('')
  const [assistantId, setAssistantId] = useState('')
  const [candidates, setCandidates] = useState<GroupCandidate[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    invoke('groupCandidates')
      .then((items) => {
        if (active) setCandidates(items)
      })
      .catch((error) => {
        if (active) setError(error.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <span className="mb-2 flex size-10 items-center justify-center rounded-xl bg-muted">
            <Users className="size-5" />
          </span>
          <DialogTitle>{t('New group')}</DialogTitle>
          <DialogDescription>{t('Bring people and digital experts into one conversation.')}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault()
            if (busy || !assistantId || !title.trim()) return
            setBusy(true)
            setError('')
            try {
              const group = await invoke('createGroup', { title: title.trim(), assistantId })
              onCreated(group.id)
            } catch (error) {
              setError(error instanceof Error ? error.message : t('The operation failed. Please retry.'))
              setBusy(false)
            }
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="group-title">{t('Group name')}</Label>
            <Input
              id="group-title"
              autoFocus
              maxLength={200}
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t('e.g. Project collaboration')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="group-assistant-search">{t('Default assistant')}</Label>
            <p className="text-xs text-muted-foreground">
              {t('Replies when no member is mentioned. Invite more members after creating the group.')}
            </p>
            <div className="relative">
              <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
              <Input
                id="group-assistant-search"
                className="pl-9"
                placeholder={t('Search digital experts')}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div
              role="radiogroup"
              aria-label={t('Default assistant')}
              className="h-52 overflow-auto rounded-lg border p-1"
            >
              {loading && (
                <p role="status" className="p-3 text-sm text-muted-foreground">
                  {t('Loading assistants')}
                </p>
              )}
              {!loading &&
                !candidates.filter((item) => item.name.toLowerCase().includes(search.toLowerCase())).length && (
                  <p className="p-3 text-sm text-muted-foreground">{t('No matching assistants')}</p>
                )}
              {candidates
                .filter((item) => item.name.toLowerCase().includes(search.toLowerCase()))
                .map((item) => (
                  <button
                    key={item.subjectId}
                    type="button"
                    role="radio"
                    aria-checked={assistantId === item.subjectId}
                    onClick={() => setAssistantId(item.subjectId)}
                    className={`flex w-full items-center gap-3 rounded-md p-2.5 text-left text-sm hover:bg-muted ${assistantId === item.subjectId ? 'bg-muted' : ''}`}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-xs">
                      {item.name.slice(0, 1)}
                    </span>
                    <span className="flex-1 truncate">{item.name}</span>
                    {assistantId === item.subjectId && <Check className="size-4" />}
                  </button>
                ))}
            </div>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
              {t('Cancel')}
            </Button>
            <Button disabled={busy || !title.trim() || !assistantId}>
              {busy && <LoaderCircle className="size-4 animate-spin" />}
              {t('Create group')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
