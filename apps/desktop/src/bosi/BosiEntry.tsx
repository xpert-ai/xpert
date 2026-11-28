import { AssistantItemLayout } from '../AssistantItemLayout'
import { AnimatedAssistantAvatar } from '../avatar/AnimatedAssistantAvatar'
import { BotAvatar } from '../avatar'
import type { Bot } from '../types'
import { t } from '../i18n'

export interface BosiNavigationEntry {
  bot: Bot | null
  initialized: boolean
  selected: boolean
  onSelect: () => void
}

export function BosiEntry({ entry, compact = false }: { entry: BosiNavigationEntry; compact?: boolean }) {
  return (
    <AssistantItemLayout
      name={entry.bot?.name ?? 'Bosi'}
      subtitle={
        entry.bot?.description ?? t('Your personal assistant in this organization, ready to help with ongoing work.')
      }
      active={entry.selected}
      mode={compact ? 'compact' : 'list'}
      onSelect={entry.onSelect}
      avatar={
        entry.bot ? (
          <BotAvatar bot={entry.bot} size="fill" />
        ) : (
          <span className="flex size-full items-center justify-center overflow-hidden rounded-lg bg-muted text-foreground">
            <AnimatedAssistantAvatar />
          </span>
        )
      }
    />
  )
}
