import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  applyRemoteComponentTheme,
  Button,
  Checkbox,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@xpert-ai/shadcn-ui'
import { z } from 'zod'
import { connect, request } from '@xpert-ai/plugin-sdk/remote-component'
import { en, zh } from './labels'
const intent = z.enum(['refund', 'order_status', 'other'])
const queue = z.enum(['pending', 'reviewed', 'insufficient'])
const reason = z.enum(['negation_missed', 'missing_phrase', 'ambiguous_request', 'other_reason'])
const receipt = z.object({
  receiptId: z.string(),
  reviewedAt: z.string(),
  disposition: z.enum(['confirmed', 'corrected', 'insufficient']),
  expectedLabel: intent.optional(),
  reason: reason.optional(),
  use: z.enum(['case_only', 'similar_cases']),
  learningEventId: z.string().optional()
})
const item = z.object({
  executionId: z.string(),
  conversationId: z.string(),
  threadId: z.string(),
  originalLabel: intent,
  bundleHash: z.string(),
  versionId: z.string(),
  sourceText: z.string().nullable(),
  receipt: receipt.optional()
})
const pageData = z.object({ items: z.array(item), total: z.number() })
type Row = z.infer<typeof item>
type Labels = typeof en
type ReviewError = 'error' | 'openError'
function RowReview({
  row,
  t,
  saved,
  onError
}: {
  row: Row
  t: Labels
  saved: (r: z.infer<typeof receipt>) => void
  onError: (error: ReviewError) => void
}) {
  const [label, setLabel] = useState(row.originalLabel),
    [why, setWhy] = useState<z.infer<typeof reason>>(),
    [reuse, setReuse] = useState(false),
    [busy, setBusy] = useState(false)
  async function submit(insufficient = false) {
    setBusy(true)
    try {
      const corrected = label !== row.originalLabel && !insufficient
      const result = z.object({ success: z.literal(true), data: receipt }).parse(
        await request('executeAction', {
          actionKey: 'submit',
          input: {
            executionId: row.executionId,
            bundleHash: row.bundleHash,
            disposition: insufficient ? 'insufficient' : corrected ? 'corrected' : 'confirmed',
            use: corrected && reuse ? 'similar_cases' : 'case_only',
            ...(!insufficient ? { expectedLabel: label } : {}),
            ...(corrected ? { reason: why } : {})
          }
        })
      )
      saved(result.data)
    } catch {
      onError('error')
    } finally {
      setBusy(false)
    }
  }
  async function openExecution() {
    try {
      const result = await request('invokeClientCommand', {
        commandKey: 'workbench.navigation.open',
        payload: {
          target: 'assistant.execution',
          conversationId: row.conversationId,
          executionId: row.executionId,
          threadId: row.threadId,
          preserveView: true
        }
      })
      if (!z.object({ success: z.literal(true) }).safeParse(result).success) onError('openError')
    } catch {
      onError('openError')
    }
  }
  return (
    <article className="space-y-3 border-b py-4">
      <div className="flex flex-wrap justify-between gap-3">
        <div className="min-w-0 break-words">
          <small>{t.source}</small>
          <p className="mt-1 whitespace-pre-wrap font-medium">{row.sourceText ?? t.sourceMissing}</p>
        </div>
        <Button variant="ghost" onClick={() => void openExecution()}>
          {t.open}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {t.original} · {t[row.originalLabel]}　{t.version} · {row.versionId}
      </p>
      {row.receipt ? (
        <div className="text-sm">
          <strong>{t[row.receipt.disposition]}</strong>　{row.receipt.expectedLabel && t[row.receipt.expectedLabel]}　
          {row.receipt.reason && t[row.receipt.reason]}　{t[row.receipt.use]}
          <p>
            {t.receipt} · {row.receipt.receiptId}
          </p>
          <p>
            {t.when} · {new Date(row.receipt.reviewedAt).toLocaleString()}
          </p>
          {row.receipt.learningEventId && (
            <p>
              {t.event} · {row.receipt.learningEventId}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {row.sourceText !== null && (
            <>
              <Select value={label} onValueChange={(v) => setLabel(intent.parse(v))}>
                <SelectTrigger aria-label={t.expected} className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {intent.options.map((v) => (
                    <SelectItem key={v} value={v}>
                      {t[v]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {label !== row.originalLabel && (
                <>
                  <Select value={why} onValueChange={(v) => setWhy(reason.parse(v))}>
                    <SelectTrigger aria-label={t.reason} className="w-44">
                      <SelectValue placeholder={t.reason} />
                    </SelectTrigger>
                    <SelectContent>
                      {reason.options.map((v) => (
                        <SelectItem key={v} value={v}>
                          {t[v]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={reuse} onCheckedChange={(v) => setReuse(v === true)} />
                    {t.use}
                  </label>
                </>
              )}
              <Button disabled={busy || (label !== row.originalLabel && !why)} onClick={() => void submit()}>
                {label === row.originalLabel ? t.confirm : t.correct}
              </Button>
            </>
          )}
          <Button variant="outline" disabled={busy} onClick={() => void submit(true)}>
            {t.insufficientAction}
          </Button>
        </div>
      )}
    </article>
  )
}
function App({ locale }: { locale: string }) {
  const t = locale.startsWith('zh') ? zh : en
  const [tab, setTab] = useState<z.infer<typeof queue>>('pending'),
    [page, setPage] = useState(1),
    [data, setData] = useState<z.infer<typeof pageData>>(),
    [reload, setReload] = useState(0),
    [error, setError] = useState<ReviewError>(),
    [last, setLast] = useState('')
  const generation = useRef(0)
  useEffect(() => {
    const id = ++generation.current
    setData(undefined)
    setError(undefined)
    request('requestData', { query: { parameters: { queue: tab }, page, pageSize: 10 } })
      .then((raw) => {
        if (id === generation.current) {
          const d = pageData.parse(raw)
          if (page > 1 && !d.items.length) setPage(page - 1)
          else setData(d)
        }
      })
      .catch(() => {
        if (id === generation.current) setError('error')
      })
    return () => {
      generation.current++
    }
  }, [tab, page, reload])
  return (
    <main className="mx-auto max-w-5xl p-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t.title}</h1>
        <Button variant="ghost" onClick={() => setReload((v) => v + 1)}>
          {t.refresh}
        </Button>
      </div>
      <nav aria-label={t.title} className="mt-4 flex flex-wrap gap-2 border-b pb-3">
        {queue.options.map((v) => (
          <Button
            variant={tab === v ? 'secondary' : 'ghost'}
            aria-pressed={tab === v}
            key={v}
            onClick={() => {
              setTab(v)
              setPage(1)
            }}
          >
            {t[v]}
          </Button>
        ))}
      </nav>
      {last && (
        <p role="status" className="pt-3 text-sm">
          {t.receipt} · {last}
        </p>
      )}
      {error && <p role="alert">{t[error]}</p>}
      {!data && !error && <p role="status">{t.loading}</p>}
      {data && (
        <>
          <p className="mt-3 text-sm text-muted-foreground">
            {data.total} {t.cases}
          </p>
          {!data.items.length && <p className="py-8">{t.empty}</p>}
          {data.items.map((row) => (
            <RowReview
              key={row.executionId}
              row={row}
              t={t}
              onError={setError}
              saved={(r) => {
                setLast(r.receiptId)
                setReload((v) => v + 1)
              }}
            />
          ))}
          {data.total > 10 && (
            <footer className="my-4 flex items-center gap-3">
              <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
                {t.prev}
              </Button>
              {page}
              <Button disabled={page * 10 >= data.total} onClick={() => setPage(page + 1)}>
                {t.next}
              </Button>
            </footer>
          )}
        </>
      )}
    </main>
  )
}
const root = createRoot(document.getElementById('root')!)
let revision = 0
connect(
  ({ locale, theme }, changed) => {
    applyRemoteComponentTheme(locale, theme)
    if (changed) revision++
    root.render(<App key={revision} locale={locale} />)
  },
  () => {
    revision++
    root.render(null)
  }
)
