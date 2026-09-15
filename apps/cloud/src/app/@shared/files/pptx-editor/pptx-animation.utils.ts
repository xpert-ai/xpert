import type { PptxAnimationEffect, PptxAnimationTrigger, PptxShape, PptxShapeAnimation } from './pptx-file.utils'

const TIMING_RE = /<p:timing\b[^>]*\/>|<p:timing\b[^>]*>[\s\S]*?<\/p:timing>/i
const PRESET: Record<PptxAnimationEffect, { id: number; cls: 'entr' | 'emph' | 'exit'; sub: number }> = {
  appear: { id: 1, cls: 'entr', sub: 0 },
  fade: { id: 10, cls: 'entr', sub: 0 },
  flyIn: { id: 2, cls: 'entr', sub: 4 },
  wipe: { id: 22, cls: 'entr', sub: 1 },
  zoom: { id: 23, cls: 'entr', sub: 16 },
  pulse: { id: 26, cls: 'emph', sub: 0 },
  spin: { id: 8, cls: 'emph', sub: 0 },
  disappear: { id: 1, cls: 'exit', sub: 0 },
  fadeOut: { id: 10, cls: 'exit', sub: 0 }
}
const NODE_TYPE: Record<PptxAnimationTrigger, string> = {
  onClick: 'clickEffect',
  withPrev: 'withEffect',
  afterPrev: 'afterEffect'
}

export function readSlideAnimations(xml: string) {
  const timing = TIMING_RE.exec(xml)?.[0]
  const result = new Map<string, PptxShapeAnimation>()
  if (!timing) return result
  const effect = /<p:cTn\b([^>]*\bpresetClass="[^"]*"[^>]*)>/gi
  let match: RegExpExecArray | null
  while ((match = effect.exec(timing))) {
    const attributes = match[1]
    const bodyEnd = findTimingNodeEnd(timing, effect.lastIndex)
    const body = timing.slice(effect.lastIndex, bodyEnd)
    effect.lastIndex = bodyEnd + '</p:cTn>'.length
    const sourceId = /<p:spTgt\b[^>]*\bspid="(\d+)"/i.exec(body)?.[1]
    if (!sourceId || result.has(sourceId)) continue
    const animationEffect = effectFromPreset(
      /\bpresetClass="([^"]*)"/i.exec(attributes)?.[1] ?? 'entr',
      Number(/\bpresetID="(\d+)"/i.exec(attributes)?.[1] ?? 0)
    )
    const triggerName = /\bnodeType="([^"]*)"/i.exec(attributes)?.[1]
    const trigger: PptxAnimationTrigger =
      triggerName === 'withEffect' ? 'withPrev' : triggerName === 'afterEffect' ? 'afterPrev' : 'onClick'
    const durations = Array.from(body.matchAll(/\bdur="(\d+)"/gi), (duration) => Number(duration[1]))
    const durationMs = animationEffect === 'appear' || animationEffect === 'disappear' ? 0 : Math.max(500, ...durations)
    const delayMs = Number(/<p:stCondLst><p:cond delay="(\d+)"/i.exec(body)?.[1] ?? 0)
    result.set(sourceId, { effect: animationEffect, trigger, durationMs, delayMs })
  }
  return result
}

function findTimingNodeEnd(xml: string, openEnd: number) {
  const node = /<p:cTn\b[^>]*?(\/?)>|<\/p:cTn>/gi
  node.lastIndex = openEnd
  let depth = 1
  let match: RegExpExecArray | null
  while ((match = node.exec(xml))) {
    if (match[0].toLowerCase() === '</p:ctn>') {
      if (--depth === 0) return match.index
    } else if (match[1] !== '/') depth++
  }
  return xml.length
}

export function patchSlideAnimations(xml: string, shapes: PptxShape[], dirty: boolean) {
  if (!dirty) return xml
  const withoutTiming = xml.replace(TIMING_RE, '')
  const animated = shapes.filter((shape) => !shape.deleted && shape.animation)
  if (!animated.length) return withoutTiming
  const timing = buildTimingXml(animated)
  const transition = /<p:transition\b[^>]*\/>|<p:transition\b[^>]*>[\s\S]*?<\/p:transition>/i.exec(withoutTiming)
  if (transition) {
    const index = transition.index + transition[0].length
    return `${withoutTiming.slice(0, index)}${timing}${withoutTiming.slice(index)}`
  }
  const colorMap = /<p:clrMapOvr\b[^>]*\/>|<p:clrMapOvr\b[^>]*>[\s\S]*?<\/p:clrMapOvr>/i.exec(withoutTiming)
  if (colorMap) {
    const index = colorMap.index + colorMap[0].length
    return `${withoutTiming.slice(0, index)}${timing}${withoutTiming.slice(index)}`
  }
  return withoutTiming.replace(/<\/p:sld>/i, `${timing}</p:sld>`)
}

function effectFromPreset(cls: string, id: number): PptxAnimationEffect {
  if (cls === 'exit') return id === 1 ? 'disappear' : 'fadeOut'
  if (cls === 'emph') return id === 8 ? 'spin' : 'pulse'
  if (id === 1) return 'appear'
  if (id === 2) return 'flyIn'
  if (id === 22) return 'wipe'
  if (id === 23) return 'zoom'
  return 'fade'
}

function buildTimingXml(shapes: PptxShape[]) {
  let id = 2
  const nextId = () => ++id
  const effects = shapes
    .map((shape, index) => {
      const animation = shape.animation as PptxShapeAnimation
      const preset = PRESET[animation.effect]
      const target = `<p:tgtEl><p:spTgt spid="${shapeXmlId(shape)}"/></p:tgtEl>`
      const duration = Math.max(1, Math.round(animation.durationMs))
      const behavior = animationBehavior(animation.effect, duration, target, nextId)
      return (
        '<p:par>' +
        `<p:cTn id="${nextId()}" presetID="${preset.id}" presetClass="${preset.cls}" presetSubtype="${preset.sub}" fill="hold" grpId="0" nodeType="${NODE_TYPE[animation.trigger]}">` +
        `<p:stCondLst><p:cond delay="${Math.max(0, Math.round(animation.delayMs))}"/></p:stCondLst>` +
        `<p:childTnLst>${behavior}</p:childTnLst></p:cTn></p:par>` +
        `<p:bldP spid="${shapeXmlId(shape)}" grpId="${index}"/>`
      )
    })
    .join('')
  const builds = effects.replace(/[\s\S]*?(<p:bldP\b[^>]*\/>)/g, '$1')
  const bodies = effects.replace(/<p:bldP\b[^>]*\/>/g, '')
  return (
    '<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>' +
    '<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>' +
    bodies +
    '</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>' +
    '<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst>' +
    `</p:seq></p:childTnLst></p:cTn></p:par></p:tnLst><p:bldLst>${builds}</p:bldLst></p:timing>`
  )
}

function animationBehavior(effect: PptxAnimationEffect, duration: number, target: string, nextId: () => number) {
  const visibility = (visible: boolean, delay = 0) =>
    `<p:set><p:cBhvr><p:cTn id="${nextId()}" dur="1" fill="hold"><p:stCondLst><p:cond delay="${delay}"/></p:stCondLst></p:cTn>${target}<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="${visible ? 'visible' : 'hidden'}"/></p:to></p:set>`
  if (effect === 'appear') return visibility(true)
  if (effect === 'disappear') return visibility(false)
  if (effect === 'fade' || effect === 'fadeOut') {
    const transition = effect === 'fade' ? 'in' : 'out'
    return `${effect === 'fade' ? visibility(true) : ''}<p:animEffect transition="${transition}" filter="fade"><p:cBhvr><p:cTn id="${nextId()}" dur="${duration}"/>${target}</p:cBhvr></p:animEffect>${effect === 'fadeOut' ? visibility(false, duration - 1) : ''}`
  }
  if (effect === 'zoom' || effect === 'pulse') {
    const autoReverse = effect === 'pulse' ? ' autoRev="1"' : ''
    const scale =
      effect === 'pulse' ? '<p:by x="106000" y="106000"/>' : '<p:from x="0" y="0"/><p:to x="100000" y="100000"/>'
    return `${effect === 'zoom' ? visibility(true) : ''}<p:animScale><p:cBhvr><p:cTn id="${nextId()}" dur="${duration}" fill="hold"${autoReverse}/>${target}</p:cBhvr>${scale}</p:animScale>`
  }
  if (effect === 'spin')
    return `<p:animRot by="21600000"><p:cBhvr><p:cTn id="${nextId()}" dur="${duration}" fill="hold"/>${target}<p:attrNameLst><p:attrName>r</p:attrName></p:attrNameLst></p:cBhvr></p:animRot>`
  if (effect === 'wipe')
    return `${visibility(true)}<p:animEffect transition="in" filter="wipe(up)"><p:cBhvr><p:cTn id="${nextId()}" dur="${duration}"/>${target}</p:cBhvr></p:animEffect>`
  return `${visibility(true)}<p:anim calcmode="lin" valueType="num"><p:cBhvr additive="base"><p:cTn id="${nextId()}" dur="${duration}" fill="hold"/>${target}<p:attrNameLst><p:attrName>ppt_y</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="1+#ppt_h/2"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="#ppt_y"/></p:val></p:tav></p:tavLst></p:anim>`
}

function shapeXmlId(shape: PptxShape) {
  if (shape.sourceId) return shape.sourceId
  const numeric = Number(shape.id.replace(/\D/g, '').slice(-8))
  return String(Number.isFinite(numeric) && numeric > 1 ? numeric : Math.floor(Date.now() / 1000) % 100000000)
}
