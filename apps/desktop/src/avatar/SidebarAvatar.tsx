import type { ReactNode } from 'react'
import { t } from '../i18n'

const sizes = {
  list: 'size-[var(--desktop-list-avatar-size,3rem)]',
  pinned: 'size-[calc(var(--desktop-list-avatar-size,3rem)+0.5rem)]',
  compact: 'size-[calc(var(--desktop-list-avatar-size,3rem)-0.5rem)]'
}

export function SidebarAvatar({
  mode,
  unread,
  children
}: {
  mode: keyof typeof sizes
  unread: boolean
  children: ReactNode
}) {
  return (
    <span className={`relative block shrink-0 [container-type:inline-size] ${sizes[mode]}`}>
      {children}
      {unread && (
        <span
          aria-label={t('Unread')}
          className="absolute right-0 bottom-0 size-1/4 rounded-full border-2 border-background bg-primary"
        />
      )}
    </span>
  )
}
