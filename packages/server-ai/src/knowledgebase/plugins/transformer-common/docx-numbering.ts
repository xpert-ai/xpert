import { DOMParser } from 'xmldom'

// Why this exists: Word stores list and heading numbers in numbering.xml and w:numPr.
// Paragraph text (w:t) does not include those generated numbers.
// Invariants:
// - numId 0 turns numbering off
// - each numId has its own counter, so a new numbering instance restarts
// - a shallower level resets deeper levels of the same numId unless lvlRestart is 0

export interface DocxNumPr {
    readonly numId?: string
    readonly ilvl?: number
}

export interface DocxStyleNumbering {
    readonly basedOn?: string
    readonly numPr?: DocxNumPr
}

export interface DocxNumberingMarker {
    readonly numId: string
    readonly level: number
    readonly label: string
    readonly kind: 'ordered' | 'bullet'
}

export interface DocxNumberingState {
    readonly applied: boolean
    mark(input: {
        styles: ReadonlyMap<string, DocxStyleNumbering>
        styleId?: string
        paragraphNumPr?: DocxNumPr
    }): DocxNumberingMarker | null
}

interface NumberingLevel {
    readonly ilvl: number
    readonly start: number
    readonly numFmt: string
    readonly lvlText: string
    readonly isLgl: boolean
    readonly restart?: number
    readonly paragraphStyleId?: string
}

interface NumberingInstance {
    readonly levels: ReadonlyMap<number, NumberingLevel>
    readonly startOverrides: ReadonlyMap<number, number>
}

interface NumberingModel {
    readonly instances: ReadonlyMap<string, NumberingInstance>
    readonly styleLinks: ReadonlyMap<string, { readonly numId: string; readonly ilvl: number }>
}

const MAX_NUMBERING_LEVEL = 8
const MAX_ROMAN_VALUE = 3999
const ROMAN_DIGITS: ReadonlyArray<readonly [number, string]> = [
    [1000, 'm'],
    [900, 'cm'],
    [500, 'd'],
    [400, 'cd'],
    [100, 'c'],
    [90, 'xc'],
    [50, 'l'],
    [40, 'xl'],
    [10, 'x'],
    [9, 'ix'],
    [5, 'v'],
    [4, 'iv'],
    [1, 'i']
]

export function toDocxNumPr(input: { numId?: string; ilvl?: string }): DocxNumPr | undefined {
    const numId = input.numId?.trim() ? input.numId.trim() : undefined
    const ilvl = parseLevelIndex(input.ilvl)
    if (numId === undefined && ilvl === undefined) {
        return undefined
    }
    return {
        ...(numId !== undefined ? { numId } : {}),
        ...(ilvl !== undefined ? { ilvl } : {})
    }
}

export function createDocxNumberingState(numberingXml: string | undefined): DocxNumberingState {
    const model = parseNumberingModel(numberingXml)
    const counters = new Map<string, Map<number, number>>()
    let applied = false
    return {
        get applied() {
            return applied
        },
        mark(input) {
            const marker = markParagraph(model, counters, input)
            if (marker) {
                applied = true
            }
            return marker
        }
    }
}

export function toMarkdownListMarker(marker: DocxNumberingMarker): string {
    if (marker.kind === 'bullet') {
        return '-'
    }
    if (/^\d{1,9}[.)]$/.test(marker.label)) {
        return marker.label
    }
    if (/^\d{1,9}$/.test(marker.label)) {
        return `${marker.label}.`
    }
    return '-'
}

export function joinNumberLabel(label: string, text: string): string {
    const trimmed = label.trim()
    if (!trimmed) {
        return text
    }
    if (!text) {
        return trimmed
    }
    return `${trimmed} ${text}`
}

function markParagraph(
    model: NumberingModel,
    counters: Map<string, Map<number, number>>,
    input: {
        styles: ReadonlyMap<string, DocxStyleNumbering>
        styleId?: string
        paragraphNumPr?: DocxNumPr
    }
): DocxNumberingMarker | null {
    const ref = resolveNumberingRef(model, input)
    if (!ref) {
        return null
    }
    const instance = model.instances.get(ref.numId)
    const level = instance?.levels.get(ref.ilvl)
    if (!instance || !level || level.numFmt === 'none') {
        return null
    }
    const levelCounters = bumpCounter(instance, ref.numId, ref.ilvl, counters)
    if (level.numFmt === 'bullet') {
        return { numId: ref.numId, level: ref.ilvl, label: '-', kind: 'bullet' }
    }
    const label = renderLabel(instance, level, levelCounters).trim()
    if (!label) {
        return null
    }
    return { numId: ref.numId, level: ref.ilvl, label, kind: 'ordered' }
}

function resolveNumberingRef(
    model: NumberingModel,
    input: {
        styles: ReadonlyMap<string, DocxStyleNumbering>
        styleId?: string
        paragraphNumPr?: DocxNumPr
    }
): { numId: string; ilvl: number } | null {
    const merged = mergeNumPr(input.styles, input.styleId, input.paragraphNumPr)
    if (merged.numId === '0') {
        return null
    }
    const linked = input.styleId ? model.styleLinks.get(input.styleId) : undefined
    const numId = merged.numId ?? linked?.numId
    if (!numId || !model.instances.has(numId)) {
        return null
    }
    const ilvl = merged.ilvl ?? linked?.ilvl ?? 0
    if (!model.instances.get(numId)?.levels.has(ilvl)) {
        return null
    }
    return { numId, ilvl }
}

function mergeNumPr(
    styles: ReadonlyMap<string, DocxStyleNumbering>,
    styleId: string | undefined,
    paragraphNumPr: DocxNumPr | undefined
): DocxNumPr {
    const chain: DocxStyleNumbering[] = []
    const seen = new Set<string>()
    let current = styleId
    while (current && !seen.has(current)) {
        seen.add(current)
        const style = styles.get(current)
        if (style) {
            chain.push(style)
        }
        current = style?.basedOn
    }
    let numId: string | undefined
    let ilvl: number | undefined
    for (const style of chain.reverse()) {
        if (style.numPr?.numId !== undefined) {
            numId = style.numPr.numId
        }
        if (style.numPr?.ilvl !== undefined) {
            ilvl = style.numPr.ilvl
        }
    }
    if (paragraphNumPr?.numId !== undefined) {
        numId = paragraphNumPr.numId
    }
    if (paragraphNumPr?.ilvl !== undefined) {
        ilvl = paragraphNumPr.ilvl
    }
    return {
        ...(numId !== undefined ? { numId } : {}),
        ...(ilvl !== undefined ? { ilvl } : {})
    }
}

function bumpCounter(
    instance: NumberingInstance,
    numId: string,
    ilvl: number,
    counters: Map<string, Map<number, number>>
): Map<number, number> {
    let levelCounters = counters.get(numId)
    if (!levelCounters) {
        levelCounters = new Map<number, number>()
        counters.set(numId, levelCounters)
    }
    const previous = levelCounters.get(ilvl)
    const next = previous === undefined ? startValue(instance, ilvl) : previous + 1
    levelCounters.set(ilvl, next)
    for (const [deeper, deeperLevel] of instance.levels) {
        if (deeper > ilvl && resetsWhen(deeperLevel, ilvl)) {
            levelCounters.delete(deeper)
        }
    }
    return levelCounters
}

function resetsWhen(level: NumberingLevel, emittedLevel: number): boolean {
    if (level.restart === 0) {
        return false
    }
    if (level.restart === undefined) {
        return emittedLevel < level.ilvl
    }
    return emittedLevel === level.restart - 1
}

function startValue(instance: NumberingInstance, ilvl: number): number {
    return instance.startOverrides.get(ilvl) ?? instance.levels.get(ilvl)?.start ?? 0
}

function renderLabel(
    instance: NumberingInstance,
    level: NumberingLevel,
    counters: ReadonlyMap<number, number>
): string {
    const values: string[] = []
    for (let index = 0; index <= MAX_NUMBERING_LEVEL; index += 1) {
        const sibling = instance.levels.get(index)
        const numeric = counters.get(index) ?? startValue(instance, index)
        const numFmt = level.isLgl ? 'decimal' : (sibling?.numFmt ?? 'decimal')
        values.push(formatNumber(numeric, numFmt === 'bullet' || numFmt === 'none' ? 'decimal' : numFmt))
    }
    return applyLvlText(level.lvlText, values)
}

function formatNumber(value: number, numFmt: string): string {
    switch (numFmt) {
        case 'decimalZero':
            return value >= 0 && value < 10 ? `0${value}` : String(value)
        case 'upperLetter':
            return toAlphabetic(value).toUpperCase()
        case 'lowerLetter':
            return toAlphabetic(value)
        case 'upperRoman':
            return toRoman(value).toUpperCase()
        case 'lowerRoman':
            return toRoman(value)
        case 'bullet':
        case 'none':
            return ''
        case 'decimal':
        default:
            // Unknown OOXML formats still expose the counter instead of dropping the number.
            return String(value)
    }
}

function toAlphabetic(value: number): string {
    if (!Number.isInteger(value) || value <= 0) {
        return String(value)
    }
    let current = value
    let result = ''
    while (current > 0) {
        current -= 1
        result = String.fromCharCode(97 + (current % 26)) + result
        current = Math.floor(current / 26)
    }
    return result
}

function toRoman(value: number): string {
    if (!Number.isInteger(value) || value <= 0 || value > MAX_ROMAN_VALUE) {
        return String(value)
    }
    let remaining = value
    let result = ''
    for (const [amount, glyph] of ROMAN_DIGITS) {
        while (remaining >= amount) {
            result += glyph
            remaining -= amount
        }
    }
    return result
}

function applyLvlText(template: string, values: readonly string[]): string {
    let result = ''
    for (let index = 0; index < template.length; index += 1) {
        const current = template[index]
        const next = template[index + 1]
        if (current === '%' && next === '%') {
            result += '%'
            index += 1
            continue
        }
        if (current === '%' && next !== undefined && next >= '1' && next <= '9') {
            result += values[Number(next) - 1] ?? ''
            index += 1
            continue
        }
        result += current ?? ''
    }
    return result
}

function parseNumberingModel(numberingXml: string | undefined): NumberingModel {
    if (!numberingXml?.trim()) {
        return { instances: new Map(), styleLinks: new Map() }
    }
    const root = new DOMParser().parseFromString(numberingXml, 'application/xml')
    const abstracts = new Map<string, Map<number, NumberingLevel>>()
    for (const element of elementsByLocalName(root, 'abstractNum')) {
        const abstractNumId = attribute(element, 'abstractNumId')
        if (!abstractNumId) {
            continue
        }
        abstracts.set(abstractNumId, readLevels(element))
    }
    const instances = new Map<string, NumberingInstance>()
    for (const element of elementsByLocalName(root, 'num')) {
        const numId = attribute(element, 'numId')
        const abstractNumId = attribute(directChild(element, 'abstractNumId'), 'val')
        if (!numId || !abstractNumId || numId === '0') {
            continue
        }
        instances.set(numId, buildInstance(abstracts.get(abstractNumId), element))
    }
    return { instances, styleLinks: buildStyleLinks(instances) }
}

function buildInstance(
    abstractLevels: ReadonlyMap<number, NumberingLevel> | undefined,
    element: Element
): NumberingInstance {
    const levels = new Map<number, NumberingLevel>()
    if (abstractLevels) {
        for (const [ilvl, level] of abstractLevels) {
            levels.set(ilvl, level)
        }
    }
    const startOverrides = new Map<number, number>()
    for (const override of elementChildren(element).filter((child) => localName(child) === 'lvlOverride')) {
        const ilvl = parseLevelIndex(attribute(override, 'ilvl'))
        if (ilvl === undefined) {
            continue
        }
        const startOverride = parseNonNegative(attribute(directChild(override, 'startOverride'), 'val'))
        if (startOverride !== undefined) {
            startOverrides.set(ilvl, startOverride)
        }
        const replacement = directChild(override, 'lvl')
        if (!replacement) {
            continue
        }
        const replaced = readLevel(replacement, ilvl)
        if (replaced) {
            levels.set(ilvl, replaced)
        }
    }
    return { levels, startOverrides }
}

function buildStyleLinks(
    instances: ReadonlyMap<string, NumberingInstance>
): Map<string, { numId: string; ilvl: number }> {
    const candidates = new Map<string, { numId: string; ilvl: number }[]>()
    for (const [numId, instance] of instances) {
        for (const level of instance.levels.values()) {
            if (!level.paragraphStyleId) {
                continue
            }
            const links = candidates.get(level.paragraphStyleId) ?? []
            links.push({ numId, ilvl: level.ilvl })
            candidates.set(level.paragraphStyleId, links)
        }
    }
    const styleLinks = new Map<string, { numId: string; ilvl: number }>()
    for (const [styleId, links] of candidates) {
        const [link] = links
        if (links.length === 1 && link) {
            styleLinks.set(styleId, link)
        }
    }
    return styleLinks
}

function readLevels(element: Element): Map<number, NumberingLevel> {
    const levels = new Map<number, NumberingLevel>()
    for (const child of elementChildren(element)) {
        if (localName(child) !== 'lvl') {
            continue
        }
        const ilvl = parseLevelIndex(attribute(child, 'ilvl'))
        if (ilvl === undefined) {
            continue
        }
        const level = readLevel(child, ilvl)
        if (level) {
            levels.set(ilvl, level)
        }
    }
    return levels
}

function readLevel(element: Element, ilvl: number): NumberingLevel | undefined {
    const numFmt = attribute(directChild(element, 'numFmt'), 'val') ?? 'decimal'
    const lvlText = attribute(directChild(element, 'lvlText'), 'val') ?? `%${ilvl + 1}.`
    const start = parseNonNegative(attribute(directChild(element, 'start'), 'val')) ?? 0
    const restart = parseNonNegative(attribute(directChild(element, 'lvlRestart'), 'val'))
    const paragraphStyleId = attribute(directChild(element, 'pStyle'), 'val')
    return {
        ilvl,
        start,
        numFmt,
        lvlText,
        isLgl: readFlag(directChild(element, 'isLgl')),
        ...(restart !== undefined ? { restart } : {}),
        ...(paragraphStyleId ? { paragraphStyleId } : {})
    }
}

function readFlag(element: Element | undefined): boolean {
    if (!element) {
        return false
    }
    const value = attribute(element, 'val')
    return value === undefined || (value !== '0' && value !== 'false' && value !== 'off')
}

function parseLevelIndex(value: string | undefined): number | undefined {
    const parsed = parseNonNegative(value)
    if (parsed === undefined || parsed > MAX_NUMBERING_LEVEL) {
        return undefined
    }
    return parsed
}

function parseNonNegative(value: string | undefined): number | undefined {
    if (value === undefined || !/^\d+$/.test(value.trim())) {
        return undefined
    }
    return Number(value.trim())
}

function elementsByLocalName(node: Node, name: string): Element[] {
    const result: Element[] = []
    for (const child of childNodes(node)) {
        if (child.nodeType === 1) {
            const element = child as Element
            if (localName(element) === name) {
                result.push(element)
            }
        }
        result.push(...elementsByLocalName(child, name))
    }
    return result
}

function elementChildren(node: Node): Element[] {
    return childNodes(node).filter((child): child is Element => child.nodeType === 1)
}

function directChild(element: Element, name: string): Element | undefined {
    return elementChildren(element).find((child) => localName(child) === name)
}

function childNodes(node: Node): Node[] {
    return node.childNodes ? Array.from(node.childNodes) : []
}

function attribute(node: Element | null | undefined, name: string): string | undefined {
    if (!node) {
        return undefined
    }
    return node.getAttribute(`w:${name}`) ?? node.getAttribute(name) ?? undefined
}

function localName(node: Element): string {
    return node.localName || node.nodeName.split(':').pop() || node.nodeName
}
