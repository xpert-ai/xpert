import { useEffect, useRef, useState } from 'react'
import type { TAssistantAppearance } from '@xpert-ai/contracts'
import { customCharacterSvg } from './custom-character'
import { AnimatedAssistantAvatar } from './AnimatedAssistantAvatar'
import { petLookFrame } from './pet-sprite'

export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const changed = () => setReduced(media.matches)
    media.addEventListener('change', changed)
    return () => media.removeEventListener('change', changed)
  }, [])
  return reduced
}
const rows: Record<string, [number, number]> = {
  idle: [0, 6],
  waving: [3, 4],
  failed: [5, 8],
  waiting: [6, 6],
  running: [7, 6],
  review: [8, 6]
}
export function AppearancePreview({
  appearance,
  preview,
  petSource,
  state,
  name,
  size = 176,
  animate = true
}: {
  appearance?: TAssistantAppearance
  preview: string
  petSource?: string
  state: string
  name: string
  size?: number
  animate?: boolean
}) {
  const prefersReduced = useReducedMotion()
  const reduced = prefersReduced || !animate
  const sprite = useRef<HTMLSpanElement>(null)
  const container = useRef<HTMLSpanElement>(null)
  const [look, setLook] = useState<ReturnType<typeof petLookFrame>>(null)
  const [row, frames] = rows[state] ?? rows.idle
  const isAtlas = appearance?.kind === 'pet' && appearance.asset?.type !== 'animated-image'
  const src = petSource || (appearance?.kind === 'pet' ? appearance.asset?.url : undefined)
  const spriteVersion = appearance?.kind === 'pet' ? (appearance.spriteVersionNumber ?? 1) : 1
  const canLook = isAtlas && spriteVersion === 2 && state === 'idle' && !reduced
  const pose = canLook ? look : null
  useEffect(() => {
    setLook(null)
    if (!canLook || !src) return
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      const rect = container.current?.getBoundingClientRect()
      if (!rect) return
      const next = petLookFrame(
        event.clientX - rect.left - rect.width / 2,
        event.clientY - rect.top - rect.height / 2,
        size * 0.15
      )
      setLook((current) => (current?.row === next?.row && current?.column === next?.column ? current : next))
    }
    const reset = () => setLook(null)
    window.addEventListener('pointermove', move)
    window.addEventListener('blur', reset)
    document.documentElement.addEventListener('pointerleave', reset)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('blur', reset)
      document.documentElement.removeEventListener('pointerleave', reset)
    }
  }, [canLook, src, size])
  useEffect(() => {
    if (!isAtlas || !src || reduced || pose || !sprite.current) return
    const animation = sprite.current.animate(
      [{ backgroundPositionX: '0px' }, { backgroundPositionX: `-${frames * 192}px` }],
      { duration: frames * 200, iterations: Infinity, easing: `steps(${frames})` }
    )
    return () => animation.cancel()
  }, [frames, isAtlas, src, reduced, pose])
  if (appearance?.kind === 'character' && appearance.config)
    return <img alt={name} src={customCharacterSvg(appearance, state, !reduced)} className="size-full object-contain" />
  if (isAtlas && src)
    return (
      <span
        ref={container}
        role="img"
        aria-label={name}
        className="relative block size-full overflow-hidden"
        data-sprite-version={spriteVersion}
      >
        <span
          ref={sprite}
          className="absolute left-1/2 top-1/2"
          style={{
            width: 192,
            height: 208,
            transform: `translate(-50%, -50%) scale(${size / 208})`,
            backgroundImage: `url(${JSON.stringify(src)})`,
            backgroundSize: `1536px ${spriteVersion === 2 ? 2288 : 1872}px`,
            backgroundPosition: `-${(pose?.column ?? 0) * 192}px -${(pose?.row ?? row) * 208}px`,
            backgroundRepeat: 'no-repeat'
          }}
        />
      </span>
    )
  if (appearance?.kind === 'pet' && appearance.asset?.type === 'animated-image' && !reduced)
    return <img alt={name} src={src} className="size-full object-contain" />
  return preview ? <img alt={name} src={preview} className="size-full object-contain" /> : <AnimatedAssistantAvatar />
}
