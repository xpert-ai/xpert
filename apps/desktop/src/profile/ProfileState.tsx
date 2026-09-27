import { LoaderCircle, RefreshCw } from 'lucide-react'
import { Button } from '../ui'
import { t } from '../i18n'

export function ProfileLoading() {
  return (
    <div role="status" className="flex min-h-24 items-center justify-center gap-2 text-xs text-muted-foreground">
      <LoaderCircle className="size-4 animate-spin" />
      {t('Loading…')}
    </div>
  )
}
export function ProfileError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div role="alert" className="flex items-center gap-2 rounded-lg bg-destructive/5 p-3 text-xs text-destructive">
      <span className="flex-1">{message}</span>
      <Button variant="ghost" size="icon" aria-label={t('Retry')} onClick={retry}>
        <RefreshCw className="size-4" />
      </Button>
    </div>
  )
}
