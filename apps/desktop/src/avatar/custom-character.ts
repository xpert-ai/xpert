import type {
  TAssistantAppearance as AssistantAppearance,
  TAssistantCharacterConfig as AssistantCharacterConfig
} from '@xpert-ai/contracts'

// Portable rendering contract: keep this renderer in sync in Desktop and ChatKit.
export const defaultCharacterConfig: AssistantCharacterConfig = {
  shape: 'round',
  eyes: 'oval',
  mouth: 'smile',
  motion: 'float',
  eyeSize: 1,
  eyeSpacing: 1,
  brows: 'none',
  ink: 'auto',
  tilt: 0,
  speed: 1,
  blink: true
}

const shapes: Record<AssistantCharacterConfig['shape'], string> = {
  round: '<circle cx="100" cy="100" r="65"/>',
  pebble: '<path d="M34 96 C37 49 77 28 114 38 C161 42 177 84 163 128 C155 164 109 176 68 157 C43 149 30 121 34 96Z"/>',
  pill: '<rect x="26" y="51" width="148" height="99" rx="49"/>',
  drop: '<path d="M100 24 C87 46 39 72 39 111 C39 174 161 174 161 111 C161 72 113 46 100 24Z"/>',
  flame:
    '<path d="M114 22 C108 59 159 57 164 109 C174 179 35 187 35 118 C34 94 45 79 62 64 C59 89 71 92 74 75 C76 48 96 30 114 22Z"/>',
  triangle: '<path d="M86 35 Q100 13 114 35 L177 142 Q188 165 161 167 L39 167 Q12 165 24 142Z"/>',
  square: '<rect x="37" y="37" width="126" height="126" rx="34"/>',
  bag: '<path d="M78 56 V37 Q78 30 86 30 H114 Q122 30 122 37 V56" fill="none" stroke="currentColor" stroke-width="8"/><rect x="29" y="52" width="142" height="111" rx="22"/>',
  star: '<path d="M92 30 Q100 14 108 30 L126 64 L166 70 Q185 72 171 87 L143 113 L149 152 Q153 172 135 164 L100 144 L65 164 Q47 172 51 152 L57 113 L29 87 Q15 72 34 70 L74 64Z"/>',
  heart: '<path d="M100 60 C58 2 6 49 32 101 C45 129 71 151 100 171 C129 151 155 129 168 101 C194 49 142 2 100 60Z"/>',
  cloud:
    '<path d="M48 153 C3 152 15 92 45 87 C42 40 93 30 114 58 C150 27 182 68 168 99 C199 139 163 165 133 152 C108 174 75 168 65 152Z"/>',
  clover: '<path d="M100 49 C143 -1 200 63 151 100 C201 141 140 200 100 151 C60 200 -1 141 49 100 C0 60 60 0 100 49Z"/>'
}
/** Shape-only thumbnails for the editor orbit; shared geometry with the live character. */
export function characterShapeSvg(shape: AssistantCharacterConfig['shape'], color: string): string {
  const safeColor = /^#[0-9a-f]{6}$/i.test(color) ? color : '#7c6ee6'
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><g fill="${safeColor}" color="${safeColor}">${shapes[shape] ?? shapes.round}</g></svg>`)}`
}

const finite = (value: number | undefined, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback

export function customCharacterSvg(
  appearance: Extract<AssistantAppearance, { kind: 'character' }>,
  state = 'idle',
  animate = false
): string {
  const config = { ...defaultCharacterConfig, ...appearance.config }
  const color = /^#[0-9a-f]{6}$/i.test(appearance.color) ? appearance.color : '#7c6ee6'
  const luminance = [1, 3, 5].map((start) => {
    const channel = parseInt(color.slice(start, start + 2), 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  const darkBackground = luminance[0] * 0.2126 + luminance[1] * 0.7152 + luminance[2] * 0.0722 < 0.18
  const ink =
    config.ink === 'light' ? '#ffffff' : config.ink === 'dark' ? '#20212c' : darkBackground ? '#ffffff' : '#20212c'
  const speed = finite(config.speed, 1, 0.5, 2)
  const tilt = finite(config.tilt, 0, -15, 15)
  const eyeSize = finite(config.eyeSize, 1, 0.6, 1.5)
  const gap = finite(config.eyeSpacing, 1, 0.55, 1.6) * 18
  const moving = animate && config.motion !== 'none'
  const thinking = state === 'review'
  const working = state === 'running' || state === 'running-right' || state === 'running-left'
  const success = state === 'waving' || state === 'jumping'
  const sleeping = state === 'sleeping'
  const alarm = state === 'waiting'
  const faceScale = ['drop', 'flame', 'triangle', 'star', 'heart', 'clover'].includes(config.shape) ? 0.78 : 1
  const faceY = ['drop', 'triangle', 'flame'].includes(config.shape) ? 10 : 0
  const eyes = sleeping ? 'sleepy' : success ? 'happy' : config.eyes
  const brows = alarm || state === 'failed' ? 'worried' : config.brows
  const blink =
    moving && config.blink !== false && !sleeping
      ? `<animateTransform attributeName="transform" type="scale" values="1 1;1 1;1 .1;1 1;1 1" keyTimes="0;.83;.87;.91;1" dur="${4.5 / speed}s" repeatCount="indefinite"/>`
      : ''
  const eye = (x: number, right: boolean) => {
    let drawing: string
    switch (eyes) {
      case 'happy':
        drawing = '<path d="M-7 1 Q0 -11 7 1"/>'
        break
      case 'sleepy':
        drawing = '<path d="M-7 0 Q0 4 7 0"/>'
        break
      case 'plus':
        drawing = '<path d="M-7 0 H7 M0 -7 V7"/>'
        break
      case 'slash':
        drawing = '<path d="M-5 7 L5 -7"/>'
        break
      case 'squint':
        drawing = `<path d="${right ? 'M5 -7 L-3 0 L5 7' : 'M-5 -7 L3 0 L-5 7'}"/>`
        break
      case 'ring':
        drawing = '<ellipse rx="6" ry="8" stroke-width="3"/>'
        break
      case 'dot':
        drawing = `<circle r="4.5" fill="${ink}" stroke="none"/>`
        break
      case 'pill':
        drawing = `<rect x="-3" y="-9" width="6" height="18" rx="3" fill="${ink}" stroke="none"/>`
        break
      case 'wink':
        if (right) {
          drawing = '<path d="M-6 -5 L3 0 L-6 5"/>'
          break
        }
      // The open eye in a wink uses the same high-contrast pupil as toon eyes.
      case 'toon':
        drawing = `<ellipse rx="9" ry="11" fill="#ffffff" stroke="#20212c" stroke-width="1"/><ellipse cx="${thinking ? 2 : 0}" cy="${thinking ? -3 : working ? 3 : 1}" rx="4" ry="6" fill="#20212c" stroke="none"/>`
        break
      default:
        drawing = `<ellipse rx="5" ry="8" fill="${ink}" stroke="none"/>`
    }
    return `<g transform="translate(${x} 97)"><g>${['oval', 'toon', 'dot', 'ring', 'pill', 'wink'].includes(eyes) ? blink : ''}${drawing}</g></g>`
  }
  const brow = (x: number, right: boolean) => {
    const lift = right ? -1 : 1
    const path =
      brows === 'flat'
        ? 'M-8 -17 H8'
        : brows === 'angry'
          ? `M-8 ${-21 - 4 * lift} L8 ${-21 + 4 * lift}`
          : brows === 'worried'
            ? `M-8 ${-21 + 4 * lift} L8 ${-21 - 4 * lift}`
            : brows === 'raised'
              ? right
                ? 'M-8 -21 Q0 -30 8 -21'
                : 'M-8 -18 H8'
              : ''
    return path ? `<path transform="translate(${x} 97)" d="${path}" stroke-width="3"/>` : ''
  }
  const mouth =
    state === 'failed'
      ? '<path d="M88 130 Q100 116 112 130"/>'
      : alarm || thinking
        ? '<ellipse cx="100" cy="127" rx="4" ry="5"/>'
        : success || config.mouth === 'open'
          ? `<path d="M87 123 Q100 128 113 123 Q111 144 100 144 Q89 144 87 123Z" fill="${ink}"/>`
          : config.mouth === 'none'
            ? ''
            : config.mouth === 'neutral' || sleeping
              ? '<path d="M91 127 H109"/>'
              : config.mouth === 'o'
                ? '<ellipse cx="100" cy="127" rx="5" ry="7"/>'
                : '<path d="M87 125 Q100 138 113 125"/>'
  const animation = !moving
    ? ''
    : state === 'failed'
      ? `<animateTransform attributeName="transform" type="translate" values="0 0;-3 0;3 0;0 0" dur="${0.4 / speed}s" repeatCount="2"/>`
      : config.motion === 'sway'
        ? `<animateTransform attributeName="transform" type="rotate" values="-5 100 130;5 100 130;-5 100 130" dur="${2.4 / speed}s" repeatCount="indefinite"/>`
        : `<animateTransform attributeName="transform" type="translate" values="0 0;0 ${success || config.motion === 'bounce' ? -12 : sleeping ? -2 : -5};0 0" dur="${(success || config.motion === 'bounce' ? 1.1 : sleeping ? 4 : 3) / speed}s" repeatCount="indefinite"/>`
  const pulse = moving
    ? `<animate attributeName="opacity" values=".35;1;.35" dur="${1.5 / speed}s" repeatCount="indefinite"/>`
    : ''
  const activity = thinking
    ? `<g fill="${ink}" opacity=".6"><circle cx="153" cy="49" r="3"/><circle cx="161" cy="39" r="5"/><circle cx="174" cy="26" r="7"/>${pulse}</g>`
    : working
      ? `<g fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round"><path d="M158 142 H175 M158 150 H183 M158 158 H171"/>${pulse}</g>`
      : alarm
        ? `<g fill="${ink}"><circle cx="161" cy="46" r="10"/><path d="M161 40 V47 M161 51 V52" stroke="${color}" stroke-width="2.5"/>${pulse}</g>`
        : sleeping
          ? `<path d="M150 60 H163 L151 72 H164 M169 35 H184 L170 48 H185" fill="none" stroke="${ink}" opacity=".5" stroke-width="3"/>`
          : state === 'listening'
            ? `<g fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round"><path d="M167 84 V108 M175 91 V101"/>${pulse}</g>`
            : ''
  const shift = thinking ? '3 -3' : working ? '1 3' : '0 0'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><ellipse cx="100" cy="186" rx="42" ry="5" fill="${color}" opacity=".12"/><g>${animation}<g transform="rotate(${tilt} 100 100)"><g fill="${color}" color="${color}">${shapes[config.shape] ?? shapes.round}</g><g transform="translate(100 ${100 + faceY}) scale(${faceScale}) translate(-100 -100)"><g transform="translate(${shift})" fill="none" stroke="${ink}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><g transform="translate(100 97) scale(${eyeSize}) translate(-100 -97)">${eye(100 - gap, false)}${eye(100 + gap, true)}${brow(100 - gap, false)}${brow(100 + gap, true)}</g>${mouth}</g></g></g></g>${activity}</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
