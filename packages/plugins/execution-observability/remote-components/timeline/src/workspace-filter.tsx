import { useEffect, useState } from 'react'
import { z } from 'zod/v3'
import { Button, Popover, PopoverTrigger, PopoverContent, Input } from '@xpert-ai/shadcn-ui'
import { ChevronDown, Check } from 'lucide-react'
import { executionObservationWorkspacesSchema } from '@xpert-ai/contracts'
import { request } from './bridge'
import { useI18n } from './i18n'

export function WorkspaceFilter({ value, onChange }: { value?: string; onChange: (id?: string) => void }) {
  const { t } = useI18n(),
    [open, setOpen] = useState(false),
    [search, setSearch] = useState(''),
    [page, setPage] = useState(1)
  const [options, setOptions] = useState<z.infer<typeof executionObservationWorkspacesSchema>>({
    items: [],
    hasMore: false
  })
  const [names, setNames] = useState(new Map<string, string>()),
    [error, setError] = useState(false)
  useEffect(() => {
    if (!open) return
    let active = true
    setError(false)
    request('requestData', { query: { page, parameters: { operation: 'workspaces', search } } })
      .then((response) => {
        if (active) {
          const result = z.object({ item: executionObservationWorkspacesSchema }).parse(response).item
          setOptions(result)
          setNames(
            (current) => new Map([...current, ...result.items.map((item): [string, string] => [item.id, item.name])])
          )
        }
      })
      .catch(() => {
        if (active) setError(true)
      })
    return () => {
      active = false
    }
  }, [open, search, page])
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="max-w-48 justify-between" title={value}>
          <span className="truncate">
            {value ? names.get(value) || `${t('workspace')} · ${value.slice(0, 8)}` : t('allWorkspaces')}
          </span>
          <ChevronDown />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-2 p-3" align="start">
        <Input
          aria-label={t('workspace')}
          value={search}
          placeholder={t('workspace')}
          onChange={(event) => {
            setSearch(event.target.value)
            setPage(1)
          }}
        />
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {t('failed')}
          </p>
        )}
        <div className="max-h-64 overflow-auto">
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={() => {
              onChange(undefined)
              setOpen(false)
            }}
          >
            {t('allWorkspaces')}
          </Button>
          {options.items.map((item) => (
            <Button
              key={item.id}
              variant="ghost"
              className="w-full justify-start"
              onClick={() => {
                onChange(item.id)
                setOpen(false)
              }}
            >
              {value === item.id && <Check />}
              <span className="truncate">{item.name}</span>
            </Button>
          ))}
        </div>
        <div className="flex justify-between">
          <Button size="sm" variant="ghost" disabled={page === 1} onClick={() => setPage(page - 1)}>
            {t('previous')}
          </Button>
          <Button size="sm" variant="ghost" disabled={!options.hasMore} onClick={() => setPage(page + 1)}>
            {t('next')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
