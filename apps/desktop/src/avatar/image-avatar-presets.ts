export type ImageAvatarPreset = { id: string; src: string; number: number }

// Every file is an independent choice, including PNG conversions and the original WebPs.
const assets = import.meta.glob<string>('./images/portraits/*.webp', {
  eager: true,
  import: 'default',
  query: '?url'
})

export const imageAvatarPresets: ImageAvatarPreset[] = Object.entries(assets)
  .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
  .map(([path, src], index) => ({
    id: path.slice(path.lastIndexOf('/') + 1, -'.webp'.length),
    src,
    number: index + 1
  }))

export function isImageAvatarPreset(src: string) {
  return imageAvatarPresets.some((preset) => preset.src === src)
}
