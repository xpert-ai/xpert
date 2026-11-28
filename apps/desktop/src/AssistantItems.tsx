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
import { AssistantPreview } from './AssistantPreview'
import { BotAvatar } from './avatar'
import { AssistantItemLayout } from './AssistantItemLayout'
import { t } from './i18n'
import type { AssistantRow } from './assistant-list-model'
import type { SidebarState } from './assistant-list-types'

export type AssistantAction = 'pin' | 'unread' | 'edit' | 'duplicate' | 'copy' | 'section'
interface ItemProps {
  row: AssistantRow
  selected: string | null
  sidebar: SidebarState
  busy: boolean
  preview?: boolean
  onSelect: (row: AssistantRow, threadId?: string | null) => void
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
            <ContextMenuCheckboxItem
              checked={!sidebar.sections.some((section) => section.id === row.preference?.sectionId)}
              onSelect={() => onMove(row, null)}
            >
              <Folder />
              {t('Group by business domain')}
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
  const { row, selected, onSelect, onAction, mode = 'list' } = props
  return (
    <AssistantMenu {...props}>
      <AssistantItemLayout
        name={row.bot.name}
        subtitle={row.subtitle}
        unread={row.unread}
        active={selected === row.bot.id}
        mode={mode}
        onSelect={() => onSelect(row)}
        avatar={<BotAvatar bot={row.bot} size="fill" status={row.activity?.latestConversationStatus} />}
        preview={
          props.preview === false
            ? undefined
            : (avatar, anchorRef) => (
                <AssistantPreview
                  row={row}
                  anchorRef={anchorRef}
                  onSelect={(threadId) => onSelect(row, threadId)}
                  onEdit={() => onAction(row, 'edit')}
                >
                  {avatar}
                </AssistantPreview>
              )
        }
      />
    </AssistantMenu>
  )
}
