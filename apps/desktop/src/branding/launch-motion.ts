const palette = { gold: '#f4c280', teal: '#90eadb', lilac: '#c9a9f5' }
const duration = 3440
const clamp = (value: number) => Math.min(1, Math.max(0, value))
const ease = (t: number) => t * t * (3 - 2 * t)

const beats = [
  { from: 0, to: 340, paths: ['arrive'] },
  { from: 340, to: 950, paths: ['out0', 'out2'] },
  { from: 1190, to: 1640, paths: ['in0', 'in2'] },
  { from: 1640, to: 1830, paths: ['join'] },
  { from: 1830, to: 2360, paths: ['return'] },
  { from: 2360, to: 2690, paths: ['in2'] },
  { from: 2690, to: 2850, paths: ['join'] },
  { from: 2850, to: 3200, paths: ['deliver'] }
]
const rings = [
  { x: 130, y: 113, at: 275, ms: 365, from: 4, to: 24, color: palette.gold },
  { x: 280, y: 63, at: 880, ms: 470, from: 18, to: 33, color: palette.teal },
  { x: 280, y: 163, at: 880, ms: 470, from: 18, to: 33, color: palette.lilac },
  { x: 430, y: 113, at: 1460, ms: 350, from: 24, to: 4, color: palette.gold },
  { x: 483, y: 113, at: 1660, ms: 380, from: 10, to: 22, color: palette.gold },
  { x: 280, y: 163, at: 2280, ms: 330, from: 17, to: 31, color: palette.lilac },
  { x: 578, y: 113, at: 3115, ms: 360, from: 21, to: 48, color: palette.gold },
  { x: 578, y: 113, at: 3195, ms: 295, from: 21, to: 36, color: palette.gold }
]

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string> = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag)
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value)
  return el
}

function prepareDrawing(splash: HTMLElement) {
  const composition = splash.querySelector<HTMLElement>('.composition')!
  const gate = splash.querySelector('#launch-gate')!
  const aura = splash.querySelector<SVGCircleElement>('.aura')!
  const tile = splash.querySelector('.tile')!
  const agents = Array.from(splash.querySelectorAll('.agent'), (agent) => ({
    agent,
    orbit: agent.querySelector<SVGCircleElement>('.orbit')!,
    shell: agent.querySelector('.shell')!
  }))
  const waves = rings.map(({ x, y, color }) => {
    const ring = svg('circle', { cx: String(x), cy: String(y), stroke: color })
    splash.querySelector('#launch-waves')!.append(ring)
    return ring
  })
  const beams = Array.from({ length: 2 }, () => {
    const group = svg('g'),
      tail = svg('path'),
      head = svg('circle', { r: '2.8', class: 'head' })
    const glint = svg('path', { class: 'glint', d: 'M-6 0Q-1-.7 0-3Q.8-.7 6 0Q.8.7-6 0Z' })
    group.append(tail, head, glint)
    splash.querySelector('#launch-pulses')!.append(group)
    return { group, tail, head, glint }
  })
  const routes = new Map<string, { wire: SVGPathElement; length: number; trace: SVGPathElement; color: string }>()
  const pathColors: Record<string, string> = {
    out0: palette.teal,
    in0: palette.teal,
    out2: palette.lilac,
    in2: palette.lilac,
    return: palette.lilac
  }
  for (const wire of splash.querySelectorAll<SVGPathElement>('#launch-wires path')) {
    const id = wire.id.slice('launch-'.length)
    const color = pathColors[id] ?? palette.gold
    const trace = svg('path', { d: wire.getAttribute('d')!, pathLength: '1', 'stroke-dasharray': '1', stroke: color })
    splash.querySelector('#launch-traces')!.append(trace)
    routes.set(id, { wire, trace, length: wire.getTotalLength(), color })
  }
  return (time: number) => {
    const progress = new Map<string, number>()
    let beamCount = 0
    for (const beat of beats) {
      if (time < beat.from) break
      const part = ease(clamp((time - beat.from) / (beat.to - beat.from)))
      for (const id of beat.paths) {
        progress.set(id, part)
        if (part === 1) continue
        const { wire, length, color } = routes.get(id)!
        const distance = length * part,
          start = Math.max(0, distance - 28)
        const points = Array.from({ length: 8 }, (_, i) => {
          const point = wire.getPointAtLength(start + ((distance - start) * i) / 7)
          return point.x.toFixed(2) + ' ' + point.y.toFixed(2)
        })
        const end = wire.getPointAtLength(distance)
        const beam = beams[beamCount++]
        beam.tail.setAttribute('d', 'M' + points.join(' L'))
        beam.tail.setAttribute('stroke', color)
        beam.head.setAttribute('cx', String(end.x))
        beam.head.setAttribute('cy', String(end.y))
        beam.glint.setAttribute('transform', `translate(${end.x} ${end.y})`)
      }
    }
    beams.forEach(({ group }, i) => (group.style.visibility = i < beamCount ? 'visible' : 'hidden'))
    for (const [id, { trace }] of routes) {
      const part = progress.get(id) ?? 0
      trace.style.visibility = part > 0 ? 'visible' : 'hidden'
      trace.style.strokeDashoffset = String(1 - part)
    }
    for (const i of [0, 2]) {
      const { agent, orbit, shell } = agents[i]
      const lower = i === 2
      agent.classList.toggle('awake', time >= 915)
      const charge = ease(clamp((time - 820) / 390))
      const secondCharge = lower ? ease(clamp((time - 2330) / 180)) : 0
      orbit.setAttribute('transform', `rotate(${(lower ? -1 : 1) * (charge * 126 + secondCharge * 90)})`)
      orbit.style.opacity = String(0.55 + charge * 0.35)
      const bloom = Math.sin(Math.PI * clamp((time - 915) / 275))
      const returning = lower ? Math.sin(Math.PI * clamp((time - 2330) / 180)) : 0
      shell.setAttribute('r', String(17 + 2.5 * Math.max(bloom, returning)))
    }
    gate.classList.toggle('awake', time >= 1780)
    const turn = ease(clamp((time - 1710) / 220)) + ease(clamp((time - 2720) / 200))
    gate.setAttribute('transform', `translate(483 113) rotate(${turn * 90})`)
    rings.forEach(({ at, ms, from, to }, i) => {
      const t = clamp((time - at) / ms)
      waves[i].setAttribute('r', String(from + (to - from) * Math.sin((t * Math.PI) / 2)))
      waves[i].style.opacity = String(Math.sin(t * Math.PI) * (1 - t) * 0.95)
    })
    const end = clamp((time - 3115) / 325)
    const hit = Math.sin(Math.PI * end)
    composition.style.setProperty('--arrival', String(hit * 0.75 + ease(end) * 0.28))
    composition.style.setProperty('--drift', (ease(clamp(time / duration)) - 1) * 5 + 'px')
    aura.style.opacity = String(0.19 + hit * 0.75 + ease(end) * 0.25)
    tile.setAttribute('transform', `scale(${1 + hit * 0.14})`)
  }
}

export function startLaunch(root: HTMLElement, splash: HTMLElement) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')
  const draw = prepareDrawing(splash)
  const started = performance.now()
  let frame = 0
  let finished = false
  let dismissed = false
  let ready = false
  root.inert = true

  function reveal() {
    if (dismissed || !finished || !ready) return
    dismissed = true
    root.inert = false
    splash.dataset.leaving = ''
    splash.setAttribute('aria-hidden', 'true')
    cancelAnimationFrame(frame)
    window.removeEventListener('keydown', skip)
    splash.removeEventListener('pointerdown', finish)
    reduced.removeEventListener('change', preference)
    if (reduced.matches) splash.remove()
    else setTimeout(() => splash.remove(), 160)
  }
  function finish() {
    if (!finished) {
      finished = true
      cancelAnimationFrame(frame)
      draw(duration)
    }
    reveal()
  }
  function skip(event: KeyboardEvent) {
    if (event.key === 'Escape') finish()
  }
  function preference() {
    if (reduced.matches) finish()
  }
  function tick(now: number) {
    const time = now - started
    if (time >= duration) finish()
    else {
      draw(time)
      frame = requestAnimationFrame(tick)
    }
  }
  window.addEventListener('keydown', skip)
  splash.addEventListener('pointerdown', finish)
  reduced.addEventListener('change', preference)
  if (reduced.matches) finish()
  else tick(started)

  return (failed: boolean) => {
    ready = true
    // Recovery actions should be available immediately. Hidden windows do not receive animation frames.
    if (failed || document.hidden || performance.now() - started >= duration) finish()
    else reveal()
  }
}
