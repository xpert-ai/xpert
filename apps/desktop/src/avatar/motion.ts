import { avatarGaze, easeGaze, gazeTransforms, restingGaze } from './gaze'
import type { AvatarGaze, AvatarPointer } from './gaze'

interface Face {
  node: SVGSVGElement
  left: SVGGElement
  right: SVGGElement
  mouth: SVGGElement
  current: AvatarGaze
  visible: boolean
  active: boolean
  transforms?: ReturnType<typeof gazeTransforms>
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
  // Radix hides the page behind a modal without changing viewport intersection.
  private interaction = new MutationObserver(() => this.updateTracking())
  private observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!(entry.target instanceof SVGSVGElement)) continue
      const face = this.faces.get(entry.target)
      if (!face) continue
      face.visible = entry.isIntersecting
    }
    this.updateTracking()
    this.schedule()
  })

  constructor() {
    this.interaction.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-hidden', 'inert']
    })
    this.reduced.addEventListener('change', this.updateTracking)
    this.fine.addEventListener('change', this.updateTracking)
    document.addEventListener('visibilitychange', this.updateTracking)
    window.addEventListener('scroll', this.schedule, { capture: true, passive: true })
    window.addEventListener('resize', this.schedule)
  }

  add(node: SVGSVGElement, left: SVGGElement, right: SVGGElement, mouth: SVGGElement) {
    this.faces.set(node, { node, left, right, mouth, current: { ...restingGaze }, visible: false, active: false })
    this.observer.observe(node)
    return () => {
      this.observer.unobserve(node)
      this.faces.delete(node)
      this.updateTracking()
      if (!this.faces.size) {
        this.observer.disconnect()
        this.interaction.disconnect()
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
    if (transforms.left !== face.transforms?.left) face.left.setAttribute('transform', transforms.left)
    if (transforms.right !== face.transforms?.right) face.right.setAttribute('transform', transforms.right)
    if (transforms.mouth !== face.transforms?.mouth) face.mouth.setAttribute('transform', transforms.mouth)
    face.transforms = transforms
  }

  private updateTracking = () => {
    for (const face of this.faces.values()) {
      // The SVG itself is decorative (aria-hidden); only an ancestor can block interaction.
      face.active = face.visible && !face.node.parentElement?.closest('[aria-hidden="true"], [inert]')
    }
    const enabled =
      !document.hidden &&
      !this.reduced.matches &&
      this.fine.matches &&
      [...this.faces.values()].some((face) => face.active)
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
      // Freeze covered/background faces in place instead of snapping them back under the blur.
      if (this.reduced.matches || !this.fine.matches) {
        for (const face of this.faces.values()) this.reset(face)
      }
    }
    if (enabled) this.schedule()
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
      .filter((face) => face.active)
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
