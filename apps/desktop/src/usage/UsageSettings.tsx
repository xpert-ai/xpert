import { useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button, Tabs, TabsList, TabsTrigger, TabsContent } from '../ui'
import { t } from '../i18n'
import { UsageOverview } from './UsageOverview'
import { UsageAnalytics } from './UsageAnalytics'
import { UsageDetails } from './UsageDetails'
import { formatDate, usageRange } from './shared'
import type { UsageQuery, UsageTab } from './types'

export function UsageSettings({ signedIn, organizationName }: { signedIn: boolean; organizationName?: string }) {
  const [tab, setTab] = useState<UsageTab>('overview')
  const [days, setDays] = useState<7 | 30>(7)
  const [refresh, setRefresh] = useState(0)
  const [filter, setFilter] = useState<Pick<UsageQuery, 'model' | 'threadId' | 'xpertId'>>({})
  const [filterLabel, setFilterLabel] = useState('')
  const range = useMemo(() => usageRange(days), [days, refresh])
  const retry = () => setRefresh((value) => value + 1)
  if (!signedIn)
    return (
      <p className="rounded-xl border p-8 text-sm text-muted-foreground">{t('Sign in to view your plan and usage.')}</p>
    )
  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        if (value === 'overview' || value === 'analytics' || value === 'details') setTab(value)
      }}
    >
      <div className="mb-6 flex min-w-0 items-center gap-4 border-b">
        <TabsList
          variant="line"
          className="min-w-0 justify-start gap-2 p-0 group-data-[orientation=horizontal]/tabs:h-12 sm:gap-5"
        >
          {(['overview', 'analytics', 'details'] as const).map((value) => (
            <TabsTrigger
              key={value}
              value={value}
              className="h-full flex-none rounded-none border-0 px-1 py-0 after:bg-primary group-data-[orientation=horizontal]/tabs:after:bottom-0 sm:px-2"
            >
              {t(value === 'overview' ? 'Overview' : value === 'analytics' ? 'Usage analytics' : 'Deduction details')}
            </TabsTrigger>
          ))}
        </TabsList>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="ml-auto shrink-0"
          aria-label={t('Refresh usage')}
          title={t('Refresh usage')}
          onClick={retry}
        >
          <RefreshCw className="size-4" />
        </Button>
      </div>
      <div className="mb-6 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <p>{t('My usage · {{organization}}', { organization: organizationName || t('Current organization') })}</p>
        {tab !== 'overview' && (
          <p>
            {formatDate(range.start, false, true)} – {formatDate(range.end, false, true)} UTC
          </p>
        )}
      </div>
      <TabsContent value="overview">
        <UsageOverview refresh={refresh} onRefresh={retry} onTab={setTab} />
      </TabsContent>
      <TabsContent value="analytics">
        <UsageAnalytics
          query={range}
          days={days}
          onDays={setDays}
          refresh={refresh}
          onRefresh={retry}
          onDrill={(next, label) => {
            setFilter(next)
            setFilterLabel(label)
            setTab('details')
          }}
        />
      </TabsContent>
      <TabsContent value="details">
        <UsageDetails
          key={JSON.stringify({ ...range, ...filter })}
          query={{ ...range, ...filter }}
          days={days}
          onDays={setDays}
          refresh={refresh}
          onRefresh={retry}
          filterLabel={filterLabel}
          onAnalytics={() => setTab('analytics')}
          onClear={() => {
            setFilter({})
            setFilterLabel('')
          }}
          onFilter={(model) => {
            setFilter({ model: model || undefined })
            setFilterLabel(model)
          }}
        />
      </TabsContent>
    </Tabs>
  )
}
