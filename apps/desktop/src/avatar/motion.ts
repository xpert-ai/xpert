import { avatarGaze, easeGaze, gazeTransforms, restingGaze } from './gaze'
import type { AvatarGaze, AvatarPointer } from './gaze'

interface Face {
  node: SVGSVGElement
  left: SVGGElement
  right: SVGGElement
  mouth: SVGGElement
  current: AvatarGaze
  visible: boolean
}

// One observer, pointer subscription and settling RAF for all visible fallback avatars.
class AvatarMotion {
  private faces = new Map<SVGSVGElement, Face>()
  private pointer: AvatarPointer | null = null
  private frame = 0
  private lastTime = 0
  private stopPointer: (() => void) | null = null
  private reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
  private fine = window.matchMedia('(any-pointer: fine)')
  private observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!(entry.target instanceof SVGSVGElement)) continue
      const face = this.faces.get(entry.target)
      if (!face) continue
      face.visible = entry.isIntersecting
      if (!face.visible) this.reset(face)
    }
    this.updateTracking()
    this.schedule()
  })

  constructor() {
    this.reduced.addEventListener('change', this.updateTracking)
    this.fine.addEventListener('change', this.updateTracking)
    document.addEventListener('visibilitychange', this.updateTracking)
    window.addEventListener('scroll', this.schedule, { capture: true, passive: true })
    window.addEventListener('resize', this.schedule)
  }

  add(node: SVGSVGElement, left: SVGGElement, right: SVGGElement, mouth: SVGGElement) {
    this.faces.set(node, { node, left, right, mouth, current: { ...restingGaze }, visible: false })
    this.observer.observe(node)
    return () => {
      this.observer.unobserve(node)
      this.faces.delete(node)
      this.updateTracking()
      if (!this.faces.size) {
        this.observer.disconnect()
        this.reduced.removeEventListener('change', this.updateTracking)
        this.fine.removeEventListener('change', this.updateTracking)
        document.removeEventListener('visibilitychange', this.updateTracking)
        window.removeEventListener('scroll', this.schedule, true)
        window.removeEventListener('resize', this.schedule)
        motion = null
      }
    }
  }

  private reset(face: Face) {
    face.current = { ...restingGaze }
    this.paint(face)
  }

  private paint(face: Face) {
    const transforms = gazeTransforms(face.current)
    face.left.setAttribute('transform', transforms.left)
    face.right.setAttribute('transform', transforms.right)
    face.mouth.setAttribute('transform', transforms.mouth)
  }

  private updateTracking = () => {
    const enabled =
      !document.hidden &&
      !this.reduced.matches &&
      this.fine.matches &&
      [...this.faces.values()].some((face) => face.visible)
    if (enabled && !this.stopPointer) {
      this.stopPointer = window.xpertDesktop?.onAvatarPointer
        ? window.xpertDesktop.onAvatarPointer(this.move)
        : this.browserPointer()
    } else if (!enabled) {
      this.stopPointer?.()
      this.stopPointer = null
      this.pointer = null
      cancelAnimationFrame(this.frame)
      this.frame = 0
      this.lastTime = 0
      for (const face of this.faces.values()) this.reset(face)
    }
  }

  private browserPointer() {
    const move = (event: PointerEvent) => {
      this.move(
        event.pointerType === 'mouse' || event.pointerType === 'pen' ? { x: event.clientX, y: event.clientY } : null
      )
    }
    const leave = () => this.move(null)
    window.addEventListener('pointermove', move, { passive: true })
    document.documentElement.addEventListener('pointerleave', leave)
    window.addEventListener('blur', leave)
    return () => {
      window.removeEventListener('pointermove', move)
      document.documentElement.removeEventListener('pointerleave', leave)
      window.removeEventListener('blur', leave)
    }
  }

  private move = (pointer: AvatarPointer | null) => {
    this.pointer = pointer
    this.schedule()
  }

  private schedule = () => {
    if (this.stopPointer && !this.frame) this.frame = requestAnimationFrame(this.tick)
  }

  private tick = (time: number) => {
    this.frame = 0
    const elapsed = this.lastTime ? time - this.lastTime : 16
    this.lastTime = time
    // Read every visible bound before writing SVG transforms; scroll and layout shifts stay accurate.
    const samples = [...this.faces.values()]
      .filter((face) => face.visible)
      .map((face) => ({
        face,
        target: avatarGaze(this.pointer, face.node.getBoundingClientRect())
      }))
    let settling = false
    for (const { face, target } of samples) {
      face.current = easeGaze(face.current, target, elapsed)
      this.paint(face)
      settling ||=
        face.current.x !== target.x || face.current.y !== target.y || face.current.proximity !== target.proximity
    }
    if (settling) this.schedule()
    else this.lastTime = 0
  }
}

let motion: AvatarMotion | null = null

export function followAvatarPointer(node: SVGSVGElement, left: SVGGElement, right: SVGGElement, mouth: SVGGElement) {
  motion ??= new AvatarMotion()
  return motion.add(node, left, right, mouth)
}
