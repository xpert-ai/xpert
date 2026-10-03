import { useRef, useState } from 'react'
import { ArrowRight, Coins } from 'lucide-react'
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui'
import { invoke } from '../host'
import { t } from '../i18n'
import { formatDate, formatNumber, periodStatus, UsageState, useUsageResource } from './shared'
import type { UsageTab } from './types'

export function UsageOverview({
  refresh,
  onRefresh,
  onTab
}: {
  refresh: number
  onRefresh: () => void
  onTab: (tab: UsageTab) => void
}) {
  const membership = useUsageResource(`membership:${refresh}`, () => invoke('usageMembership'))
  const periods = useUsageResource(`periods:${refresh}`, () => invoke('usagePeriods'))
  const [rights, setRights] = useState(false)
  const benefitsButton = useRef<HTMLButtonElement>(null)
  const me = membership.data
  const remaining =
    me?.pointsGranted != null && me.pointsGranted > 0 && me.pointsRemaining != null
      ? Math.max(0, Math.min(100, (me.pointsRemaining / me.pointsGranted) * 100))
      : 0
  return (
    <div className="space-y-9">
      <UsageState {...membership} onRetry={onRefresh}>
        {me ? (
          <>
            {!me.personalPointsOnly && (
              <section aria-labelledby="usage-plan">
                <h3 id="usage-plan" className="mb-4 text-lg font-semibold">
                  {t('Current plan')}
                </h3>
                <div className="rounded-2xl border p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h4 className="text-xl font-semibold">{me.planName}</h4>
                        <span className="rounded-md bg-muted px-2 py-1 text-xs">{periodStatus(me.status)}</span>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {formatDate(me.currentPeriodStart)} – {formatDate(me.currentPeriodEnd)}
                      </p>
                    </div>
                    <Button ref={benefitsButton} type="button" variant="outline" onClick={() => setRights(true)}>
                      {t('View benefits')}
                    </Button>
                  </div>
                  <div className="mt-5 border-t pt-5">
                    <p className="text-sm text-muted-foreground">{t('Remaining plan points')}</p>
                    <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
                      <strong className="text-4xl font-semibold tabular-nums">
                        {me.pointsGranted === null ? t('Unlimited') : formatNumber(me.pointsRemaining)}
                      </strong>
                      <span className="text-sm text-muted-foreground">
                        {t('Deducted {{used}} / {{total}} points', {
                          used: formatNumber(me.pointsUsed),
                          total: me.pointsGranted === null ? t('Unlimited') : formatNumber(me.pointsGranted)
                        })}
                      </span>
                    </div>
                    {me.pointsGranted !== null && (
                      <>
                        <div
                          role="progressbar"
                          aria-label={t('Remaining plan points')}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={remaining}
                          className="mt-4 h-2.5 overflow-hidden rounded-full bg-muted"
                        >
                          <div className="h-full rounded-full bg-primary" style={{ width: `${remaining}%` }} />
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {t('{{percent}}% remaining', { percent: formatNumber(remaining, 2) })}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </section>
            )}
            <section aria-labelledby="usage-personal">
              <h3 id="usage-personal" className="mb-4 text-lg font-semibold">
                {t('Personal points')}
              </h3>
              <div className="flex flex-wrap items-center gap-4 rounded-2xl border p-5">
                <Coins className="size-6 text-muted-foreground" />
                <strong className="text-3xl font-semibold tabular-nums">
                  {formatNumber(me.personalPointsBalance)}
                </strong>
                <p className="min-w-40 flex-1 text-sm text-muted-foreground">
                  {t('Shared across your account, separate from plan points.')}
                </p>
                <Button type="button" variant="outline" onClick={() => onTab('details')}>
                  {t('View deductions')}
                </Button>
              </div>
            </section>
            <Dialog open={rights} onOpenChange={setRights}>
              <DialogContent
                className="max-h-[80vh] overflow-y-auto sm:max-w-lg"
                onCloseAutoFocus={(event) => {
                  event.preventDefault()
                  benefitsButton.current?.focus()
                }}
              >
                <DialogHeader>
                  <DialogTitle>{me.planName}</DialogTitle>
                  <DialogDescription>{me.description || t('Your current membership benefits.')}</DialogDescription>
                </DialogHeader>
                <dl className="space-y-4 text-sm">
                  <div>
                    <dt className="text-muted-foreground">{t('Effective period')}</dt>
                    <dd className="mt-1">
                      {formatDate(me.currentPeriodStart)} – {formatDate(me.currentPeriodEnd)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t('Plan allowance')}</dt>
                    <dd className="mt-1">
                      {me.pointsGranted === null ? t('Unlimited') : formatNumber(me.pointsGranted)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t('Allowed models')}</dt>
                    <dd className="mt-1 whitespace-pre-line break-words">
                      {me.allowedModels.length ? me.allowedModels.join('\n') : t('All models')}
                    </dd>
                  </div>
                </dl>
              </DialogContent>
            </Dialog>
          </>
        ) : (
          <p className="rounded-xl border px-5 py-8 text-sm text-muted-foreground">
            {t(
              'No membership information is available in this organization. You can still check existing usage records.'
            )}
          </p>
        )}
      </UsageState>
      <section aria-labelledby="usage-periods">
        <h3 id="usage-periods" className="mb-4 text-lg font-semibold">
          {t('Plan periods')}
        </h3>
        <UsageState {...periods} onRetry={onRefresh}>
          <div className="overflow-x-auto rounded-2xl border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  {['Period', 'Plan', 'Deducted / allowance', 'Status'].map((key) => (
                    <th key={key} className="whitespace-nowrap px-5 py-3 font-normal">
                      {t(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periods.data?.map((period) => (
                  <tr key={period.id} className="border-t">
                    <td className="whitespace-nowrap px-5 py-4">
                      {formatDate(period.periodStart)} – {formatDate(period.periodEnd)}
                    </td>
                    <td className="px-5 py-4">{period.planName}</td>
                    <td className="whitespace-nowrap px-5 py-4 tabular-nums">
                      {formatNumber(period.pointsUsed)} /{' '}
                      {period.pointsGranted === null ? t('Unlimited') : formatNumber(period.pointsGranted)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4">{periodStatus(period.status)}</td>
                  </tr>
                ))}
                {!periods.data?.length && (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-muted-foreground">
                      {t('No plan periods yet.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </UsageState>
      </section>
      <Button type="button" variant="ghost" className="px-0 text-accent-foreground" onClick={() => onTab('analytics')}>
        {t('View usage analytics')}
        <ArrowRight className="size-4" />
      </Button>
    </div>
  )
}
