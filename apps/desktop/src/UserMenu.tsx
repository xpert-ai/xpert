import { t } from './i18n'
import { useState } from 'react'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@xpert-ai/shadcn-ui'
import { ExternalLink, LogOut, MoreHorizontal, Settings2 } from 'lucide-react'
import { openWorkspace } from './host'
import type { Profile } from './types'

export function UserMenu({
  profile,
  webUrl,
  compact = false,
  onSettings,
  onLogout
}: {
  profile: Profile
  webUrl: string
  compact?: boolean
  onSettings: () => void
  onLogout: () => void
}) {
  const [failedUrl, setFailedUrl] = useState('')
  const { user } = profile
  const name = user.name || t('Xpert user')
  const organization = profile.organizations.find((item) => item.id === profile.organizationId)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={compact ? 'size-12 shrink-0 rounded-full p-1' : 'h-11 w-full justify-start gap-3 px-2'}
          aria-label={t('User menu: {{name}}', { name })}
          title={name}
        >
          <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-foreground text-sm font-medium text-background">
            {user.avatarUrl && failedUrl !== user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt=""
                className="size-full object-cover"
                onError={() => setFailedUrl(user.avatarUrl!)}
              />
            ) : (
              name.slice(0, 1)
            )}
          </span>
          {!compact && (
            <>
              <span className="min-w-0 flex-1 truncate text-left font-normal">{name}</span>
              <MoreHorizontal className="size-4 text-muted-foreground" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={compact ? 'right' : 'top'} align="end" sideOffset={12} className="w-64 p-2">
        <DropdownMenuLabel className="px-3 py-2">
          <span className="block truncate">{name}</span>
          <span className="mt-1 block truncate text-xs font-normal text-muted-foreground">{organization?.name}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="rounded-lg px-3 py-2.5" onSelect={() => openWorkspace(webUrl)}>
          <ExternalLink />
          {t('Open Xpert workspace')}
        </DropdownMenuItem>
        <DropdownMenuItem className="rounded-lg px-3 py-2.5" onSelect={onSettings}>
          <Settings2 />
          {t('Connection & appearance')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" className="rounded-lg px-3 py-2.5" onSelect={onLogout}>
          <LogOut />
          {t('Sign out')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
