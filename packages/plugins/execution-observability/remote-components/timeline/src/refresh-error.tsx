import { Button } from '@xpert-ai/shadcn-ui'
import { useI18n } from './i18n'

/** A failed background read must not replace the last successful rows. */
export function RefreshError({ retry }: { retry: () => void }) {
  const { t } = useI18n()
  return (
    <div role="alert" className="sticky left-0 flex w-fit items-center gap-2 px-4 py-1 text-xs text-destructive">
      {t('failed')}
      <Button variant="ghost" size="sm" onClick={retry}>
        {t('retry')}
      </Button>
    </div>
  )
}
