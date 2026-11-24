import { useEffect, useRef, useState } from 'react'
import { invoke } from '../host'
import type { CatalogItem } from '../catalog-types'
import type { CatalogCache } from './catalog-cache'

export function useCardImages(item: CatalogItem, cache: CatalogCache) {
  const element = useRef<HTMLElement>(null)
  const [images, setImages] = useState<Awaited<ReturnType<CatalogCache['images']>>>()
  const template = item.kind === 'templates' && item.catalogAvatarId
  const expert = item.kind === 'experts' && item.hasCardAvatar && item.id
  const plugin = item.kind === 'applications' && item.hasCardImages && item.pluginName
  const app = item.kind === 'applications' && item.appName
  const revision = item.imageRevision
  useEffect(() => {
    setImages(undefined)
    if (!element.current || !(template || expert || (plugin && app))) return
    let active = true
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        const key = JSON.stringify([template, expert, plugin, app, revision])
        void cache
          .images(key, async () => {
            if (template) return { avatar: await invoke('catalogAvatar', template) }
            if (expert) return invoke('cardImages', { kind: 'experts', id: expert })
            if (plugin && app) return invoke('cardImages', { kind: 'applications', pluginName: plugin, appName: app })
            return {}
          })
          .then((value) => {
            if (active) setImages(value)
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
  }, [cache, template, expert, plugin, app, revision])
  return { element, images }
}
