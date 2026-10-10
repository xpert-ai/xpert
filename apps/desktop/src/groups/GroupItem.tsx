import {
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@xpert-ai/shadcn-ui'
import { MoreHorizontal, Pin, Archive } from 'lucide-react'
import { t } from '../i18n'
import { GroupAvatar } from './GroupAvatar'
import type { GroupSummary } from './types'

export function GroupItem({
  group,
  selected,
  mode = 'list',
  onSelect,
  onChange
}: {
  group: GroupSummary
  selected: string | null
  mode?: 'list' | 'pinned' | 'compact'
  onSelect: (id: string) => void
  onChange: (group: GroupSummary, key: 'pinned' | 'archived') => Promise<void>
}) {
  const compact = mode === 'compact'
  const pinned = mode === 'pinned'
  const active = selected === group.id
  const actions = [
    { key: 'pinned' as const, label: t(group.pinned ? 'Unpin group' : 'Pin group'), icon: Pin },
    { key: 'archived' as const, label: t(group.archived ? 'Restore group' : 'Archive group'), icon: Archive }
  ]
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          data-conversation-kind={group.purpose}
          className={`group relative flex shrink-0 items-center rounded-xl transition-colors ${compact ? 'size-12 justify-center' : pinned ? 'min-w-0 flex-col gap-2 px-2 py-3' : 'w-full gap-[var(--desktop-avatar-gap)] px-2 py-[var(--desktop-row-padding)]'} ${active ? 'bg-primary/10' : 'hover:bg-muted'}`}
        >
          <button
            aria-label={compact ? group.title : t('{{name}} avatar', { name: group.title })}
            aria-current={active ? 'page' : undefined}
            title={group.title}
            onClick={() => onSelect(group.id)}
            className="relative shrink-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className={`block ${compact ? 'size-10' : pinned ? 'size-14' : 'size-12'}`}>
              <GroupAvatar members={group.members} memberCount={group.memberCount} />
            </span>
            {group.unread && (
              <span
                aria-label={t('Unread')}
                className="absolute bottom-0 right-0 size-2 rounded-full border border-background bg-primary"
              />
            )}
          </button>
          {!compact && (
            <button
              aria-label={group.title}
              aria-current={active ? 'page' : undefined}
              title={group.lastMessage || group.title}
              onClick={() => onSelect(group.id)}
              className={`min-w-0 self-stretch rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring ${pinned ? 'w-full text-center' : 'flex-1 text-left'}`}
            >
              <span
                className={`block truncate leading-5 ${pinned ? 'text-xs' : 'text-sm'} ${active || group.unread ? 'font-semibold' : 'font-medium'}`}
              >
                {group.title}
              </span>
              {!pinned && (
                <span className="mt-0.5 block truncate text-[0.8125rem] leading-5 text-muted-foreground">
                  {group.lastMessage || t('People & assistants')}
                </span>
              )}
            </button>
          )}
          {!compact && !pinned && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1 size-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                  aria-label={t('Group options')}
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {actions.map(({ key, label, icon: Icon }) => (
                  <DropdownMenuItem key={key} onSelect={() => void onChange(group, key)}>
                    <Icon />
                    {label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {actions.map(({ key, label, icon: Icon }) => (
          <ContextMenuItem key={key} onSelect={() => void onChange(group, key)}>
            <Icon />
            {label}
          </ContextMenuItem>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  )
}
