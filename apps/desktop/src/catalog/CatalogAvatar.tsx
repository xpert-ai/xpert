import { useCardImages } from './use-card-images'
import type { CatalogCache } from './catalog-cache'
import { BotAvatar } from '../avatar'
import type { CatalogItem } from '../catalog-types'

/** Fetch protected images only as cards enter view; credentials remain in the host. */
export function CatalogAvatar({ item, cache }: { item: CatalogItem; cache: CatalogCache }) {
  const { element, images } = useCardImages(item, cache)
  const url = images?.avatar
  return (
    <span ref={element}>
      <BotAvatar bot={url ? { ...item, avatarUrl: url } : item} />
    </span>
  )
}
