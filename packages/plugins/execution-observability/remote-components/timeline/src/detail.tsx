import { useEffect, useRef, useState } from 'react'
import { z } from 'zod/v3'
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Button,
  Badge,
  Separator
} from '@xpert-ai/shadcn-ui'
import { ExternalLink, X } from 'lucide-react'
import {
  executionObservationDetailSchema,
  WORKBENCH_NAVIGATION_OPEN_COMMAND,
  type ExecutionObservationDetail
} from '@xpert-ai/contracts'
import { request, actionSchema, navigationActionSchema } from './bridge'
import { executionKind } from './timeline-layout'
import { useI18n } from './i18n'

export function ExecutionDetail({
  id,
  close,
  open,
  timeZone
}: {
  id: string | null
  close: () => void
  open: (id: string) => void
  timeZone: string
}) {
  const { t, date, number, currency } = useI18n()
  const [detail, setDetail] = useState<ExecutionObservationDetail | null>(null),
    [page, setPage] = useState(1),
    [error, setError] = useState(false),
    [busy, setBusy] = useState(false)
  const [canOpenConversation, setCanOpenConversation] = useState(false)
  const generation = useRef(0)
  useEffect(() => {
    setPage(1)
  }, [id])
  useEffect(() => {
    const version = ++generation.current
    setError(false)
    setDetail(null)
    setCanOpenConversation(false)
    if (!id) return
    request('requestData', { query: { selectionId: id, page } })
      .then((value) => {
        if (version === generation.current) {
          const result = z
            .object({ item: executionObservationDetailSchema, canOpenConversation: z.boolean().default(false) })
            .parse(value)
          setDetail(result.item)
          setCanOpenConversation(result.canOpenConversation)
        }
      })
      .catch(() => {
        if (version === generation.current) setError(true)
      })
    return () => {
      generation.current++
    }
  }, [id, page])
  const navigate = async () => {
    if (!id) return
    setBusy(true)
    setError(false)
    try {
      const target = navigationActionSchema.parse(
        await request('executeAction', { actionKey: 'execution-target', input: { executionId: id } })
      )
      const result = actionSchema.parse(
        await request('invokeClientCommand', { commandKey: WORKBENCH_NAVIGATION_OPEN_COMMAND, payload: target.data })
      )
      if (!result.success) throw Error('Navigation rejected')
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open={Boolean(id)}
      onOpenChange={(value) => {
        if (!value) close()
      }}
    >
      <DialogContent showCloseButton={false} className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogClose asChild>
          <Button variant="ghost" size="icon-sm" className="absolute right-2 top-2" aria-label={t('close')}>
            <X />
          </Button>
        </DialogClose>
        <DialogHeader>
          <DialogTitle>{detail?.item.title || t('details')}</DialogTitle>
          <DialogDescription>{t('timingNote')}</DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {t('actionFailed')}
          </p>
        )}
        {!detail && !error && <p role="status">{t('loading')}</p>}
        {detail && (
          <>
            <Badge variant="secondary" className="w-fit">
              {t(detail.item.status)}
            </Badge>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-3 text-sm">
              {[
                [t('id'), detail.item.id],
                [t('assistantColumn'), detail.item.assistantName ?? t('unknownAssistant')],
                [t('created'), date(detail.item.createdAt, timeZone)],
                [t('completed'), detail.item.completedAt ? date(detail.item.completedAt, timeZone) : t('unknownEnd')],
                [
                  t('elapsed'),
                  detail.item.elapsedTimeMs === null ? t('missing') : `${number(detail.item.elapsedTimeMs / 1000)} s`
                ],
                [t('source'), detail.item.source ?? t('unknownSource')],
                [t('recordCreator'), detail.item.recordedById ?? t('missing')],
                [t('thread'), detail.item.threadId ?? t('missing')],
                [t('executionType'), t(executionKind(detail.item))],
                [t('branchedFrom'), detail.item.parentThreadId ?? t('noRecordedBranch')]
              ].map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="break-all">{value}</dd>
                </div>
              ))}
            </dl>
            {detail.item.hasError && <p className="text-sm text-destructive">{t('errorRecorded')}</p>}
            {detail.item.parentId && (
              <Button variant="link" className="w-fit px-0" onClick={() => open(detail.item.parentId!)}>
                {t('parent')}
              </Button>
            )}
            <Separator />
            <div className="space-y-2">
              <h3 className="text-sm font-medium">{t('usage')}</h3>
              <p className="text-sm">
                {t('tokens')}: {detail.usage.totalTokens === null ? t('missing') : number(detail.usage.totalTokens)}
              </p>
              <p className="text-sm">
                {t('cost')}:{' '}
                {detail.usage.currencies.length
                  ? detail.usage.currencies.map((cost) => currency(cost.amount, cost.currency)).join(' · ')
                  : t('missing')}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('usageNote')} {t('unpriced', { count: detail.usage.unpricedRecords })}
              </p>
            </div>
            <Separator />
            <div className="space-y-2">
              <h3 className="text-sm font-medium">
                {t('children')} ({detail.childTotal})
              </h3>
              {!detail.childTotal && <p className="text-sm text-muted-foreground">{t('noChildren')}</p>}
              {detail.children.map((child) => (
                <Button
                  key={child.id}
                  variant="ghost"
                  className="w-full justify-between"
                  onClick={() => open(child.id)}
                >
                  <span className="truncate">{child.title || t('unknownTitle')}</span>
                  <span className="text-xs text-muted-foreground">{t(child.status)}</span>
                </Button>
              ))}
              {detail.childTotal > 20 && (
                <div className="flex justify-between">
                  <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
                    {t('previous')}
                  </Button>
                  <Button variant="outline" disabled={page * 20 >= detail.childTotal} onClick={() => setPage(page + 1)}>
                    {t('next')}
                  </Button>
                </div>
              )}
            </div>
            {canOpenConversation ? (
              <Button disabled={busy} onClick={() => void navigate()}>
                <ExternalLink />
                {t('open')}
              </Button>
            ) : (
              detail.item.conversationId && (
                <p className="text-sm text-muted-foreground">{t('originalAssistantAccess')}</p>
              )
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
