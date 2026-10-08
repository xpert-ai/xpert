import { customCharacterSvg, defaultCharacterConfig } from './custom-character'
import { useReducedMotion } from './AppearancePreview'
import type { Character, CharacterConfig } from './character-options'

export function CharacterThumbnail({
  value,
  patch,
  animate = false,
  size = 48
}: {
  value: Character
  patch?: Partial<CharacterConfig>
  animate?: boolean
  size?: number
}) {
  const reduced = useReducedMotion()
  return (
    <img
      alt=""
      draggable={false}
      width={size}
      height={size}
      className="shrink-0 object-contain"
      src={customCharacterSvg(
        { ...value, config: { ...defaultCharacterConfig, ...value.config, ...patch } },
        'idle',
        animate && !reduced
      )}
    />
  )
}
