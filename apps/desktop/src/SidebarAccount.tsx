import { DesktopUpdate } from './DesktopUpdate'
import { UserMenu } from './UserMenu'
import type { Profile } from './types'

export function SidebarAccount({
  profile,
  webUrl,
  compact,
  onSettings,
  onLogout
}: {
  profile: Profile
  webUrl: string
  compact: boolean
  onSettings: () => void
  onLogout: () => void
}) {
  return (
    <div
      className={
        compact
          ? 'flex shrink-0 flex-col items-center gap-2 border-t py-3'
          : 'mx-4 flex shrink-0 items-center gap-2 border-t pt-2 pb-3'
      }
    >
      <div className={compact ? '' : 'min-w-0 flex-1'}>
        <UserMenu profile={profile} webUrl={webUrl} compact={compact} onSettings={onSettings} onLogout={onLogout} />
      </div>
      <DesktopUpdate compact={compact} />
    </div>
  )
}
