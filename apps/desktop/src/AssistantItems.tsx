import type { ComponentProps } from 'react'
import { BellDot, BellOff, Copy, Folder, FolderPlus, Pencil, Pin, PinOff } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuCheckboxItem,
  ContextMenuSeparator
} from '@xpert-ai/shadcn-ui'
import { BotAvatar } from './BotAvatar'
import { t } from './i18n'
import type { AssistantRow } from './assistant-list-model'
import type { SidebarState } from './assistant-list-types'

export type AssistantAction = 'pin' | 'unread' | 'edit' | 'duplicate' | 'copy' | 'section'
interface ItemProps {
  row: AssistantRow
  selected: string | null
  sidebar: SidebarState
  busy: boolean
  onSelect: (row: AssistantRow) => void
  onAction: (row: AssistantRow, action: AssistantAction) => void
  onMove: (row: AssistantRow, sectionId: string | null) => void
}
function AssistantMenu({
  children,
  row,
  sidebar,
  busy,
  onAction,
  onMove
}: ItemProps & { children: ComponentProps<typeof ContextMenuTrigger>['children'] }) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent aria-label={t('Assistant menu')}>
        <ContextMenuItem disabled={busy} onSelect={() => onAction(row, 'pin')}>
          {row.preference?.pinnedAt ? <PinOff /> : <Pin />}
          {t(row.preference?.pinnedAt ? 'Unpin' : 'Pin')}
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger disabled={busy}>
            <Folder />
            {t('Move to')}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {sidebar.sections.map((section) => (
              <ContextMenuCheckboxItem
                key={section.id}
                checked={row.preference?.sectionId === section.id}
                onSelect={() => onMove(row, section.id)}
              >
                <Folder />
                {section.name}
              </ContextMenuCheckboxItem>
            ))}
            <ContextMenuCheckboxItem checked={!row.preference?.sectionId} onSelect={() => onMove(row, null)}>
              <Folder />
              {t('Unassigned')}
            </ContextMenuCheckboxItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => onAction(row, 'section')}>
              <FolderPlus />
              {t('New section')}
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuItem disabled={busy} onSelect={() => onAction(row, 'unread')}>
          {row.unread ? <BellOff /> : <BellDot />}
          {t(row.unread ? 'Mark as read' : 'Mark as unread')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={busy} onSelect={() => onAction(row, 'edit')}>
          <Pencil />
          {t('Edit profile')}
        </ContextMenuItem>
        <ContextMenuItem disabled={busy} onSelect={() => onAction(row, 'duplicate')}>
          <Copy />
          {t('Duplicate')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={busy || !row.activity?.latestConversationId} onSelect={() => onAction(row, 'copy')}>
          <Copy />
          {t('Copy conversation ID')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
export function AssistantItem(props: ItemProps & { mode?: 'list' | 'pinned' | 'compact' }) {
  const { row, selected, onSelect, mode = 'list' } = props
  const active = selected === row.bot.id
  const compact = mode === 'compact'
  const pinned = mode === 'pinned'
  return (
    <AssistantMenu {...props}>
      <button
        aria-label={row.bot.name}
        title={`${row.bot.name}${row.subtitle ? ` · ${row.subtitle}` : ''}${row.unread ? ` · ${t('Unread')}` : ''}`}
        aria-current={active ? 'page' : undefined}
        onClick={() => onSelect(row)}
        className={`relative flex shrink-0 items-center rounded-xl text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${compact ? 'size-12 justify-center' : pinned ? 'min-w-0 flex-col gap-2 px-2 py-3' : 'w-full gap-[var(--desktop-avatar-gap)] px-2 py-[var(--desktop-row-padding)]'} ${active ? 'bg-primary/10' : 'hover:bg-muted'}`}
      >
        <span className="relative shrink-0">
          <BotAvatar bot={row.bot} size={compact ? 'compact' : pinned ? 'large' : 'default'} />
          {row.unread && (
            <span
              aria-label={t('Unread')}
              className={`absolute right-0 bottom-0 rounded-full border-background bg-primary ${compact ? 'size-2 border' : 'size-3 border-2'}`}
            />
          )}
        </span>
        {!compact && (
          <span className={`min-w-0 ${pinned ? 'w-full text-center' : 'flex-1'}`}>
            <span
              className={`block truncate leading-5 ${pinned ? 'text-xs' : 'text-sm'} ${active || row.unread ? 'font-semibold' : 'font-medium'}`}
            >
              {row.bot.name}
            </span>
            {!pinned && (
              <span className="mt-0.5 block truncate text-[0.8125rem] leading-5 text-muted-foreground">
                {row.subtitle || t('Start a chat with this Bot')}
              </span>
            )}
          </span>
        )}
      </button>
    </AssistantMenu>
  )
}
