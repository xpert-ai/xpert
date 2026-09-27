import { useEffect, useId, useRef, useState, type ComponentProps, type RefObject } from 'react'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@xpert-ai/shadcn-ui'
import type { AssistantRow } from './assistant-list-model'
import { usePreviewScope } from './profile/PreviewScope'
import { ProfilePanel } from './profile/ProfilePanel'
import { t } from './i18n'

export function AssistantPreview({
  row,
  anchorRef,
  children,
  onSelect,
  onEdit
}: {
  row: AssistantRow
  anchorRef: RefObject<HTMLDivElement | null>
  children: ComponentProps<typeof HoverCardTrigger>['children']
  onSelect: (threadId?: string | null) => void
  onEdit: () => void
}) {
  const scope = usePreviewScope()
  const triggerId = useId()
  const [pinned, setPinned] = useState(false)
  const [sideOffset, setSideOffset] = useState(10)
  const pinnedRef = useRef(false)
  const held = useRef(false)
  const content = useRef<HTMLDivElement>(null)
  const open = scope.active === triggerId
  const dismiss = scope.close
  useEffect(() => () => dismiss(triggerId), [dismiss, triggerId])
  const close = () => {
    if (held.current) return
    pinnedRef.current = false
    setPinned(false)
    scope.close(triggerId)
  }
  const change = (next: boolean) => {
    if (next) {
      scope.open(triggerId)
    } else if (open && !pinned && !held.current && !content.current?.contains(document.activeElement)) close()
  }
  const alignToRow = (trigger: HTMLElement) => {
    const edge = anchorRef.current?.getBoundingClientRect().right ?? trigger.getBoundingClientRect().right
    setSideOffset(Math.max(10, edge - trigger.getBoundingClientRect().right + 10))
  }
  return (
    <HoverCard open={open} onOpenChange={change} openDelay={300} closeDelay={250}>
      <HoverCardTrigger
        asChild
        onPointerEnter={(event) => alignToRow(event.currentTarget)}
        onFocus={(event) => alignToRow(event.currentTarget)}
        onKeyDown={(event) => {
          if (event.altKey && event.key === 'ArrowDown' && (!scope.locked || open)) {
            event.preventDefault()
            scope.open(triggerId)
            pinnedRef.current = true
            setPinned(true)
            scope.lock(triggerId, true)
            requestAnimationFrame(() => content.current?.querySelector<HTMLButtonElement>('button')?.focus())
          }
        }}
      >
        {children}
      </HoverCardTrigger>
      <HoverCardContent
        ref={content}
        side="right"
        align="center"
        sideOffset={sideOffset}
        collisionPadding={12}
        role="dialog"
        aria-label={t('Assistant profile')}
        onEscapeKeyDown={(event) => {
          event.preventDefault()
          close()
        }}
        onPointerDownOutside={(event) => {
          if (pinned || held.current) event.preventDefault()
          else close()
        }}
        className="flex h-[600px] max-h-[var(--radix-hover-card-content-available-height)] w-[420px] max-w-[calc(100vw-96px)] flex-col overflow-hidden rounded-2xl border bg-popover p-0 text-popover-foreground shadow-xl"
      >
        {open && (
          <ProfilePanel
            key={row.bot.id}
            row={row}
            pinned={pinned}
            onPin={() => {
              pinnedRef.current = !pinnedRef.current
              setPinned(pinnedRef.current)
              scope.lock(triggerId, pinnedRef.current || held.current)
            }}
            onClose={close}
            onBusy={(busy) => {
              held.current = busy
              scope.lock(triggerId, busy || pinnedRef.current)
            }}
            onSelect={(threadId) => {
              if (!held.current) {
                close()
                onSelect(threadId)
              }
            }}
            onEdit={() => {
              if (!held.current) {
                close()
                onEdit()
              }
            }}
          />
        )}
      </HoverCardContent>
    </HoverCard>
  )
}
