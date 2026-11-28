import { Button } from '@xpert-ai/shadcn-ui'
import { Users } from 'lucide-react'
import { t } from '../i18n'

export function GroupMembershipNotice({ compact = false, onRefresh }: { compact?: boolean; onRefresh: () => void }) {
  const message = t(
    'You have not joined this organization. Ask an organization administrator to add you as a member to use group conversations.'
  )
  const refresh = t('Refresh after joining')
  if (compact)
    return (
      <Button
        variant="ghost"
        size="icon"
        className="size-12 shrink-0 text-muted-foreground"
        title={`${message} ${refresh}`}
        aria-label={`${message} ${refresh}`}
        onClick={onRefresh}
      >
        <Users className="size-5" aria-hidden="true" />
      </Button>
    )
  return (
    <div role="status" className="space-y-1 px-2 py-2 text-xs leading-relaxed text-muted-foreground">
      <p>{message}</p>
      <button
        type="button"
        className="rounded-sm underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onRefresh}
      >
        {refresh}
      </button>
    </div>
  )
}
