import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ProfileViewSession } from '../assistant-profile-types'
import { invoke } from '../host'
import { t, useLocale } from '../i18n'
import { localizedText } from '../../electron/i18n/index.mjs'
import { Button, Input } from '../ui'
import { ProfileError, ProfileLoading } from './ProfileState'

// Declarative schemas select fields by key. API records remain data, never markup or URLs.
function fields(value: unknown): Map<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? new Map(Object.entries(value)) : new Map()
}
const display = (value: unknown) =>
  value === undefined || value === null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value)
export function SchemaProfileView({ session, active }: { session: ProfileViewSession; active: boolean }) {
  const locale = useLocale()
  const [data, setData] = useState<unknown>()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [retry, setRetry] = useState(0)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!active) return
    let disposed = false
    const timer = setTimeout(
      () => {
        setData(undefined)
        setError('')
        invoke('profileViewRequest', {
          sessionId: session.sessionId,
          operation: 'data',
          query: { page, pageSize: 5, search }
        }).then(
          (value) => {
            if (!disposed) setData(value)
          },
          (error: Error) => {
            if (!disposed) setError(error.message)
          }
        )
      },
      search ? 200 : 0
    )
    return () => {
      disposed = true
      clearTimeout(timer)
    }
  }, [session.sessionId, active, search, page, retry])
  const result = fields(data)
  const rawItems = result.get('items')
  const items: unknown[] = Array.isArray(rawItems) ? rawItems : []
  const total = result.get('total')
  const schema = session.manifest.view
  const label = (value: Parameters<typeof localizedText>[0]) => localizedText(value, locale)
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-4">
      {session.manifest.dataSource.querySchema?.supportsSearch && (
        <Input
          value={search}
          placeholder={t('Search')}
          aria-label={t('Search')}
          onChange={(event) => {
            setSearch(event.target.value)
            setPage(1)
          }}
        />
      )}
      {error ? (
        <ProfileError message={error} retry={() => setRetry(retry + 1)} />
      ) : data === undefined ? (
        <ProfileLoading />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto text-xs">
          {schema.type === 'stats' || schema.type === 'detail' ? (
            <dl className="divide-y">
              {(schema.type === 'stats' ? schema.items : schema.fields).map((field) => (
                <div key={field.key} className="flex justify-between gap-3 py-3">
                  <dt className="text-muted-foreground">{label(field.label)}</dt>
                  <dd>{display(fields(result.get(schema.type === 'stats' ? 'summary' : 'item')).get(field.key))}</dd>
                </div>
              ))}
            </dl>
          ) : schema.type === 'table' ? (
            <table className="w-full text-left">
              <thead>
                <tr>
                  {schema.columns.map((column) => (
                    <th key={column.key} className="border-b p-2">
                      {label(column.label)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={index}>
                    {schema.columns.map((column) => (
                      <td key={column.key} className="border-b p-2">
                        {display(fields(item).get(column.key))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : schema.type === 'list' ? (
            <div className="divide-y">
              {items.map((item, index) => (
                <div key={index} className="space-y-1 py-3">
                  <p className="font-medium">{display(fields(item).get(schema.item.titleKey))}</p>
                  {[schema.item.subtitleKey, schema.item.descriptionKey, ...(schema.item.metaKeys || [])]
                    .filter(Boolean)
                    .map((key) => (
                      <p key={key} className="text-muted-foreground">
                        {display(fields(item).get(key!))}
                      </p>
                    ))}
                </div>
              ))}
            </div>
          ) : (
            <pre className="whitespace-pre-wrap break-words">{JSON.stringify(data, null, 2)}</pre>
          )}
          {['table', 'list'].includes(schema.type) && !items.length && (
            <p className="py-5 text-center text-muted-foreground">{t('No results')}</p>
          )}
        </div>
      )}
      {typeof total === 'number' && total > 5 && (
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('Previous page')}
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="self-center text-xs">
            {page} / {Math.ceil(total / 5)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('Next page')}
            disabled={page * 5 >= total}
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
