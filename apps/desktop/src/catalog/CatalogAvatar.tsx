import { useEffect, useRef, useState } from 'react'
import { BotAvatar } from '../avatar'
import { invoke } from '../host'
import type { CatalogItem } from '../catalog-types'

/** Fetch protected images only as cards enter view; credentials remain in the host. */
export function CatalogAvatar({ item }: { item: CatalogItem }) {
  const element = useRef<HTMLSpanElement>(null)
  const [url, setUrl] = useState<string | null>(null)
  const id = item.kind === 'templates' ? item.catalogAvatarId : undefined
  useEffect(() => {
    setUrl(null)
    if (!id || !element.current) return
    let active = true
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        void invoke('catalogAvatar', id)
          .then((value) => {
            if (active) setUrl(value)
          })
          .catch(() => {})
      },
      { rootMargin: '100px' }
    )
    observer.observe(element.current)
    return () => {
      active = false
      observer.disconnect()
    }
  }, [id])
  return (
    <span ref={element}>
      <BotAvatar bot={url ? { ...item, avatarUrl: url } : item} />
    </span>
  )
}
