import { useRef, type ComponentProps, type JSX, type ReactNode, type RefObject } from 'react'
import { SidebarAvatar } from './avatar/SidebarAvatar'
import { t } from './i18n'

// Navigation-only entries share the assistant row without inventing a server Bot identity.
export function AssistantItemLayout({
  name,
  subtitle,
  unread = false,
  active,
  mode = 'list',
  avatar,
  preview,
  onSelect,
  ref: forwardedRef,
  ...containerProps
}: Omit<ComponentProps<'div'>, 'children' | 'onSelect'> & {
  name: string
  subtitle?: string
  unread?: boolean
  active: boolean
  mode?: 'list' | 'pinned' | 'compact'
  avatar: ReactNode
  preview?: (avatar: JSX.Element, anchorRef: RefObject<HTMLDivElement | null>) => ReactNode
  onSelect: () => void
}) {
  const rowRef = useRef<HTMLDivElement>(null)
  const compact = mode === 'compact'
  const pinned = mode === 'pinned'
  const avatarButton = (
    <button
      aria-label={compact ? name : t('{{name}} avatar', { name })}
      aria-current={active ? 'page' : undefined}
      onClick={onSelect}
      className={`relative flex shrink-0 cursor-default items-center justify-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${compact ? 'size-12' : ''}`}
    >
      <SidebarAvatar mode={mode} unread={unread}>
        {avatar}
      </SidebarAvatar>
    </button>
  )
  return (
    <div
      {...containerProps}
      ref={(node) => {
        rowRef.current = node
        if (typeof forwardedRef === 'function') return forwardedRef(node)
        if (forwardedRef) forwardedRef.current = node
      }}
      onClick={(event) => {
        containerProps.onClick?.(event)
        if (!event.defaultPrevented && event.target === event.currentTarget) onSelect()
      }}
      className={`relative flex shrink-0 cursor-pointer items-center rounded-xl transition-colors ${compact ? 'size-12 justify-center' : pinned ? 'min-w-0 flex-col gap-2 px-2 py-3' : 'w-full gap-[var(--desktop-avatar-gap)] px-2 py-[var(--desktop-row-padding)]'} ${active ? 'bg-primary/10' : 'hover:bg-muted'}`}
    >
      {preview ? preview(avatarButton, rowRef) : avatarButton}
      {!compact && (
        <button
          aria-label={name}
          aria-current={active ? 'page' : undefined}
          title={`${name}${subtitle ? ` · ${subtitle}` : ''}${unread ? ` · ${t('Unread')}` : ''}`}
          onClick={onSelect}
          className={`min-w-0 cursor-pointer self-stretch rounded-md outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${pinned ? 'w-full text-center' : 'flex-1 text-left'}`}
        >
          <span
            className={`block truncate leading-5 ${pinned ? 'text-xs' : 'text-sm'} ${active || unread ? 'font-semibold' : 'font-medium'}`}
          >
            {name}
          </span>
          {!pinned && (
            <span className="mt-0.5 block truncate text-[0.8125rem] leading-5 text-muted-foreground">
              {subtitle || t('Start a chat with this Bot')}
            </span>
          )}
        </button>
      )}
    </div>
  )
}
