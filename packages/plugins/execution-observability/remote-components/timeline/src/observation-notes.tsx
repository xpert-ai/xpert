import { useId } from 'react'
import { Button, Popover, PopoverContent, PopoverTrigger } from '@xpert-ai/shadcn-ui'
import { Info } from 'lucide-react'
import type { ExecutionObservationOverview } from '@xpert-ai/contracts'
import { useI18n } from './i18n'

export function ObservationNotes({ data }: { data: ExecutionObservationOverview }) {
  const { t, date } = useI18n(),
    titleId = useId()
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t('dataNotes')} title={t('dataNotes')}>
          <Info />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        aria-labelledby={titleId}
        className="max-h-[var(--radix-popover-content-available-height)] w-96 max-w-[calc(100vw-2rem)] overflow-y-auto p-3"
      >
        <h2 id={titleId} className="text-sm font-medium">
          {t('dataNotes')}
        </h2>
        <p className="text-xs leading-relaxed text-muted-foreground">{t('timingNote')}</p>
        {data.summary.unknownEnds > 0 && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t(data.summary.unknownEnds === 1 ? 'unknownEndSingle' : 'unknownEnds', {
              count: data.summary.unknownEnds
            })}
          </p>
        )}
        <p className="border-t border-border pt-3 text-xs text-muted-foreground">
          {date(data.query.from, data.query.timeZone)} — {date(data.query.to, data.query.timeZone)}
        </p>
      </PopoverContent>
    </Popover>
  )
}
