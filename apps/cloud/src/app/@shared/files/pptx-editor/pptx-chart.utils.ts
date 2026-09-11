type XmlElement = Element

type ChartSeries = {
  name: string
  categories: string[]
  values: number[]
  color: string | null
  pointColors: Map<number, string>
}

const SVG_WIDTH = 1000
const SVG_HEIGHT = 600

/**
 * Builds a lightweight SVG preview for classic OOXML charts. The original chart
 * part remains in the package, so this preview is only a view representation.
 */
export async function renderPptxChart(
  zip: { file(path: string): { async(type: 'text'): Promise<string> } | null },
  path: string
) {
  const file = zip.file(path)
  if (!file) return null
  const xml = await file.async('text')
  const root = parseXml(xml)
  const plotArea = descendant(root, 'plotArea')
  if (!plotArea) return null

  const chartType = ['barChart', 'lineChart', 'areaChart'].find((type) => directChild(plotArea, type))
  if (!chartType) return null
  const chart = directChild(plotArea, chartType)
  if (!chart) return null
  const series = directChildren(chart, 'ser')
    .map(readSeries)
    .filter((item): item is ChartSeries => !!item)
  if (!series.length) return null

  const categories = series.find((item) => item.categories.length)?.categories ?? []
  const values = series.flatMap((item) => item.values).filter(Number.isFinite)
  if (!categories.length || !values.length) return null

  const isLine = chartType === 'lineChart' || chartType === 'areaChart'
  const grouping = attr(chart, 'grouping') ?? 'clustered'
  const background = colorFrom(directChild(directChild(root, 'spPr'), 'solidFill')) ?? 'transparent'
  const plotBackground = colorFrom(directChild(directChild(plotArea, 'spPr'), 'solidFill')) ?? background
  const axis = directChild(plotArea, 'valAx')
  const minimum = numberValue(directChild(directChild(axis, 'scaling'), 'min'), 0)
  const maximum = Math.max(
    minimum + 1,
    numberValue(directChild(directChild(axis, 'scaling'), 'max'), Math.max(...values) * 1.12)
  )
  const ticks = tickValues(minimum, maximum, numberValue(directChild(axis, 'majorUnit'), 0))
  const left = 72
  const right = 24
  const top = 24
  const bottom = 74
  const plotWidth = SVG_WIDTH - left - right
  const plotHeight = SVG_HEIGHT - top - bottom
  const valueY = (value: number) => top + plotHeight - ((value - minimum) / (maximum - minimum)) * plotHeight
  const gridColor =
    colorFrom(descendant(directChild(directChild(plotArea, 'valAx'), 'spPr'), 'solidFill')) ?? 'currentColor'
  const textColor =
    colorFrom(descendant(directChild(directChild(plotArea, 'valAx'), 'txPr'), 'solidFill')) ?? 'currentColor'
  const showValues = directChild(chart, 'dLbls')
    ? attr(directChild(chart, 'dLbls'), 'showVal') === '1'
    : series.some((item) => item.values.length > 0)
  const svg: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" preserveAspectRatio="none">`,
    `<rect width="${SVG_WIDTH}" height="${SVG_HEIGHT}" fill="${escapeAttribute(background)}"/>`,
    `<rect x="${left}" y="${top}" width="${plotWidth}" height="${plotHeight}" fill="${escapeAttribute(plotBackground)}"/>`
  ]

  for (const tick of ticks) {
    const y = valueY(tick)
    svg.push(
      `<line x1="${left}" y1="${y}" x2="${left + plotWidth}" y2="${y}" stroke="${escapeAttribute(gridColor)}" stroke-width="1"/>`
    )
    svg.push(
      `<text x="${left - 10}" y="${y + 5}" text-anchor="end" fill="${escapeAttribute(textColor)}" font-size="18">${escapeXml(formatValue(tick))}</text>`
    )
  }

  if (isLine) {
    renderLines(svg, series, categories.length, left, top, plotWidth, plotHeight, valueY, showValues)
  } else {
    renderBars(svg, series, categories.length, left, top, plotWidth, plotHeight, valueY, grouping, showValues)
  }

  const categoryStep = plotWidth / Math.max(categories.length, 1)
  categories.forEach((category, index) => {
    const x = left + categoryStep * (index + 0.5)
    svg.push(
      `<text x="${x}" y="${top + plotHeight + 30}" text-anchor="middle" fill="${escapeAttribute(textColor)}" font-size="18">${escapeXml(category)}</text>`
    )
  })
  svg.push(
    `<line x1="${left}" y1="${top + plotHeight}" x2="${left + plotWidth}" y2="${top + plotHeight}" stroke="${escapeAttribute(gridColor)}" stroke-width="1"/>`
  )
  svg.push('</svg>')
  return svgDataUrl(svg.join(''))
}

function renderBars(
  svg: string[],
  series: ChartSeries[],
  categoryCount: number,
  left: number,
  top: number,
  width: number,
  height: number,
  valueY: (value: number) => number,
  grouping: string,
  showValues: boolean
) {
  const step = width / Math.max(categoryCount, 1)
  const groupWidth = step * 0.7
  const barWidth = grouping === 'stacked' || grouping === 'percentStacked' ? groupWidth : groupWidth / series.length
  const colors = series.map((item, index) => item.color ?? fallbackSeriesColor(index))
  for (let categoryIndex = 0; categoryIndex < categoryCount; categoryIndex++) {
    let stackedBase = 0
    series.forEach((item, seriesIndex) => {
      const value = item.values[categoryIndex] ?? 0
      const x =
        left +
        step * categoryIndex +
        (step - groupWidth) / 2 +
        (grouping === 'stacked' || grouping === 'percentStacked' ? 0 : seriesIndex * barWidth)
      const base = grouping === 'stacked' || grouping === 'percentStacked' ? stackedBase : 0
      const y = valueY(base + value)
      const bottom = valueY(base)
      const color = item.pointColors.get(categoryIndex) ?? colors[seriesIndex]
      svg.push(
        `<rect x="${x}" y="${Math.min(y, bottom)}" width="${Math.max(1, barWidth - 3)}" height="${Math.max(1, Math.abs(bottom - y))}" fill="${escapeAttribute(color)}"/>`
      )
      if (showValues)
        svg.push(
          `<text x="${x + barWidth / 2 - 1.5}" y="${Math.min(y, bottom) - 7}" text-anchor="middle" fill="${escapeAttribute(color)}" font-size="16">${escapeXml(formatValue(value))}</text>`
        )
      if (grouping === 'stacked' || grouping === 'percentStacked') stackedBase += value
    })
  }
}

function renderLines(
  svg: string[],
  series: ChartSeries[],
  categoryCount: number,
  left: number,
  top: number,
  width: number,
  height: number,
  valueY: (value: number) => number,
  showValues: boolean
) {
  const step = width / Math.max(categoryCount, 1)
  series.forEach((item, seriesIndex) => {
    const color = item.color ?? fallbackSeriesColor(seriesIndex)
    const points = item.values
      .slice(0, categoryCount)
      .map((value, index) => `${left + step * (index + 0.5)},${valueY(value)}`)
      .join(' ')
    svg.push(
      `<polyline points="${points}" fill="none" stroke="${escapeAttribute(color)}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`
    )
    item.values.slice(0, categoryCount).forEach((value, index) => {
      const x = left + step * (index + 0.5)
      const y = valueY(value)
      svg.push(`<circle cx="${x}" cy="${y}" r="6" fill="${escapeAttribute(color)}"/>`)
      if (showValues)
        svg.push(
          `<text x="${x}" y="${y - 11}" text-anchor="middle" fill="${escapeAttribute(color)}" font-size="16">${escapeXml(formatValue(value))}</text>`
        )
    })
  })
}

function readSeries(series: XmlElement): ChartSeries | null {
  const name =
    textCache(directChild(directChild(series, 'tx'), 'strRef'))[0] ?? textCache(directChild(series, 'tx'))[0] ?? ''
  const categories = textCache(directChild(series, 'cat'))
  const values = numberCache(directChild(series, 'val'))
  if (!categories.length || !values.length) return null
  const pointColors = new Map<number, string>()
  directChildren(series, 'dPt').forEach((point) => {
    const index = Number(attr(directChild(point, 'idx'), 'val'))
    const color = colorFrom(directChild(directChild(point, 'spPr'), 'solidFill'))
    if (Number.isFinite(index) && color) pointColors.set(index, color)
  })
  return {
    name,
    categories,
    values,
    color: colorFrom(directChild(directChild(series, 'spPr'), 'solidFill')),
    pointColors
  }
}

function textCache(node: XmlElement | null): string[] {
  const cache = node ? descendant(node, 'strCache') : null
  return directChildren(cache, 'pt')
    .sort((a, b) => Number(attr(a, 'idx')) - Number(attr(b, 'idx')))
    .map((point) => textOf(directChild(point, 'v')))
}

function numberCache(node: XmlElement | null): number[] {
  const cache = node ? descendant(node, 'numCache') : null
  return directChildren(cache, 'pt')
    .sort((a, b) => Number(attr(a, 'idx')) - Number(attr(b, 'idx')))
    .map((point) => Number(textOf(directChild(point, 'v'))))
    .filter(Number.isFinite)
}

function tickValues(minimum: number, maximum: number, majorUnit: number) {
  const step = majorUnit > 0 ? majorUnit : niceStep((maximum - minimum) / 5)
  const values: number[] = []
  for (let value = minimum; value <= maximum + step * 0.01 && values.length < 10; value += step) values.push(value)
  if (values.length < 2) values.push(maximum)
  return values
}

function niceStep(value: number) {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(value, 1)))
  const normalized = value / magnitude
  const base = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return base * magnitude
}

function formatValue(value: number) {
  return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1).replace(/\.0$/, '')
}

function fallbackSeriesColor(index: number) {
  const palette = ['currentColor']
  return palette[index % palette.length]
}

function colorFrom(node: XmlElement | null): string | null {
  const color = node
    ? directChildren(node).find((child) => ['srgbClr', 'schemeClr', 'sysClr'].includes(localName(child)))
    : null
  if (!color) return null
  const value = attr(color, 'lastClr') ?? attr(color, 'val')
  return value && /^[0-9a-f]{6}$/i.test(value) ? `#${value}` : null
}

function parseXml(xml: string) {
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  if (document.getElementsByTagName('parsererror').length) return null
  return document.documentElement
}

function directChild(node: XmlElement | null | undefined, name: string) {
  return directChildren(node).find((child) => localName(child) === name) ?? null
}

function directChildren(node: XmlElement | null | undefined, name?: string) {
  return node ? Array.from(node.children).filter((child) => !name || localName(child) === name) : []
}

function descendant(node: XmlElement | null | undefined, name: string) {
  if (!node) return null
  if (localName(node) === name) return node
  return Array.from(node.getElementsByTagName('*')).find((child) => localName(child) === name) ?? null
}

function localName(node: Element | null | undefined) {
  return node?.localName || node?.tagName?.split(':').pop() || ''
}

function attr(node: XmlElement | null | undefined, name: string) {
  return node?.getAttribute(name) ?? null
}

function textOf(node: XmlElement | null) {
  return node?.textContent?.trim() ?? ''
}

function numberValue(node: XmlElement | null, fallback: number) {
  const value = Number(attr(node, 'val') ?? textOf(node))
  return Number.isFinite(value) ? value : fallback
}

function escapeXml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function escapeAttribute(value: string) {
  return escapeXml(value)
}

function svgDataUrl(svg: string) {
  const bytes = new TextEncoder().encode(svg)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `data:image/svg+xml;base64,${btoa(binary)}`
}
