import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '../host'
import { t } from '../i18n'
import { avatarPng, loadAvatarImage } from './character-presets'
import { readPetImport } from './pet-import'
import { petSpriteVersion, validatePetSprite, type PetSpriteVersion } from './pet-sprite'

export function usePetCatalog(botId: string) {
  const [items, setItems] = useState<{ id: string; label: string }[]>([])
  const [previews, setPreviews] = useState<Partial<Record<string, string>>>({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  const cache = useRef(
    new Map<string, Promise<{ src: string; preview: string; spriteVersionNumber: PetSpriteVersion }>>()
  )
  const load = useCallback(
    (id: string) => {
      const key = `${botId}:${id}`
      let result = cache.current.get(key)
      if (!result) {
        result = invoke('assistantPetAsset', { botId, petId: id }).then(async ({ src }) => {
          const image = await loadAvatarImage(src)
          return {
            src,
            spriteVersionNumber: validatePetSprite(image.width, image.height),
            preview: await avatarPng(src, { pet: true })
          }
        })
        cache.current.set(key, result)
        void result.catch(() => cache.current.delete(key))
      }
      return result
    },
    [botId]
  )
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    setItems([])
    setPreviews({})
    void (async () => {
      try {
        const result = await invoke('assistantPetCatalog', { botId })
        if (!active) return
        setItems(result)
        setLoading(false)
        for (const item of result) {
          if (!active) return
          try {
            const asset = await load(item.id)
            if (active) setPreviews((current) => ({ ...current, [item.id]: asset.preview }))
          } catch {
            /* Selecting a failed preview retries and displays its error. */
          }
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? t(reason.message) : t('Could not load the image.'))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [botId, load, revision])
  return { items, previews, loading, error, load, retry: () => setRevision((value) => value + 1) }
}

export function readImageFile(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () =>
      typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not load the image.'))
    reader.onerror = () => reject(new Error('Could not load the image.'))
    reader.readAsDataURL(file)
  })
}
export async function preparePet(file: File, type: 'animated-image' | 'sprite-atlas') {
  const imported = await readPetImport(file)
  const src = await readImageFile(imported.image)
  const image = await loadAvatarImage(src)
  if (imported.packaged || petSpriteVersion(image.width, image.height)) type = 'sprite-atlas'
  const spriteVersionNumber =
    type === 'sprite-atlas' ? validatePetSprite(image.width, image.height, imported.spriteVersionNumber) : undefined
  if (image.width > 4096 || image.height > 4096) throw new Error('Pet images must be at most 4096 × 4096 pixels.')
  return {
    src,
    data: src.split(',')[1],
    type,
    spriteVersionNumber,
    displayName: imported.displayName,
    preview: await avatarPng(src, { pet: type === 'sprite-atlas' })
  }
}
