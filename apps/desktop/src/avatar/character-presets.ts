import type { TAssistantAppearance } from '@xpert-ai/contracts'
import { customCharacterSvg } from './custom-character'

export const characterColors = ['#7c6ee6', '#5297d8', '#59ae94', '#ecb94b', '#e58fa5', '#a0a7ba']
// Original vector characters. A stored PNG preview also works in older avatar clients.
export function characterSvg(appearance: Extract<TAssistantAppearance, { kind: 'character' }>) {
  if (appearance.config) return customCharacterSvg(appearance)
  const color = /^#[0-9a-f]{6}$/i.test(appearance.color) ? appearance.color : characterColors[0]
  const eyes =
    '<ellipse cx="84" cy="107" rx="5" ry="8" fill="#25263c"/><ellipse cx="116" cy="107" rx="5" ry="8" fill="#25263c"/><path d="M90 130 Q100 138 110 130" fill="none" stroke="#25263c" stroke-width="4" stroke-linecap="round"/>'
  const forms: Partial<Record<string, string>> = {
    bosi: `<g transform="scale(2)" fill="none" stroke="${color}" stroke-linecap="round" stroke-linejoin="round"><path d="M23 31 L39 46 L23 60" stroke-width="7.5"/><path d="M78 35 L64 46 L78 59" stroke-width="3.3"/><path d="M39 70 Q50 78 61 70" stroke-width="4.4"/></g>`,
    orbit: `<ellipse cx="100" cy="172" rx="49" ry="7" fill="#25263c" opacity=".07"/><circle cx="100" cy="101" r="62" fill="${color}"/><ellipse cx="100" cy="109" rx="88" ry="26" transform="rotate(-24 100 109)" fill="none" stroke="${color}" stroke-width="10"/><path d="M72 60 Q90 48 108 51" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="9" stroke-linecap="round"/>${eyes}<circle cx="165" cy="50" r="9" fill="${color}"/>`,
    cat: `<path d="M44 90 L37 28 Q64 26 79 56 Q100 47 121 56 Q146 24 163 28 L157 93 Q175 164 101 174 Q28 164 44 90" fill="${color}"/><path d="M50 43 L55 76 L72 62 M149 43 L145 76 L128 62" fill="#fff" opacity=".45"/>${eyes}<path d="M47 116 L68 121 M45 130 L67 131 M134 121 L155 116 M134 131 L157 130" stroke="#25263c" stroke-opacity=".5" stroke-width="3" stroke-linecap="round"/>`,
    sprout: `<path d="M100 64 Q68 20 42 37 Q48 74 100 71 Q102 27 149 26 Q157 66 100 73" fill="${color}"/><path d="M43 124 Q38 67 100 65 Q162 67 157 124 Q162 178 100 175 Q38 178 43 124" fill="${color}"/>${eyes}<ellipse cx="65" cy="127" rx="11" ry="5" fill="#fff" opacity=".35"/><ellipse cx="135" cy="127" rx="11" ry="5" fill="#fff" opacity=".35"/>`,
    robot: `<path d="M100 38 L100 25" stroke="${color}" stroke-width="8"/><circle cx="100" cy="22" r="10" fill="${color}"/><rect x="35" y="44" width="130" height="116" rx="34" fill="${color}"/><rect x="52" y="69" width="96" height="69" rx="24" fill="#fff" opacity=".82"/>${eyes}<path d="M25 93 L25 117 M175 93 L175 117 M68 163 L68 182 M132 163 L132 182" stroke="${color}" stroke-width="13" stroke-linecap="round"/>`
  }
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">${forms[appearance.id] ?? forms.bosi}</svg>`)}`
}

export function loadAvatarImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not load the image.'))
    image.src = src
  })
}

export async function avatarPng(
  src: string,
  options: { pet?: boolean; zoom?: number; x?: number; y?: number; fit?: 'contain' | 'cover' } = {}
) {
  const image = await loadAvatarImage(src)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 512
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not prepare the image.')
  if (options.pet) {
    context.drawImage(image, 0, 0, 192, 208, 20, 0, 472, 512)
  } else {
    const edge =
      (options.fit === 'contain' ? Math.max(image.width, image.height) : Math.min(image.width, image.height)) /
      (options.zoom ?? 1)
    const x = (image.width - edge) * ((options.x ?? 50) / 100)
    const y = (image.height - edge) * ((options.y ?? 50) / 100)
    context.drawImage(image, x, y, edge, edge, 0, 0, 512, 512)
  }
  return canvas.toDataURL('image/png')
}
