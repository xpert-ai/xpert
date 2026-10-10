import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@xpert-ai/shadcn-ui'
import { Plus, Users, Compass, Archive } from 'lucide-react'
import { t } from '../i18n'
export function DesktopAddMenu({
  onCreateGroup,
  onBrowse,
  onArchivedGroups,
  archivedGroups,
  compact = false
}: {
  onCreateGroup: () => void
  onBrowse: () => void
  onArchivedGroups: () => void
  archivedGroups: boolean
  compact?: boolean
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className={compact ? 'my-1 size-12 shrink-0' : 'size-7'}
          aria-label={t('Add to workspace')}
          title={t('Add to workspace')}
        >
          <Plus />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side={compact ? 'right' : 'bottom'} className="w-56">
        <DropdownMenuItem onSelect={onCreateGroup}>
          <Users />
          {t('New group')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onArchivedGroups}>
          <Archive />
          {t(archivedGroups ? 'Active groups' : 'Archived groups')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onBrowse}>
          <Compass />
          {t('Discover & add')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
