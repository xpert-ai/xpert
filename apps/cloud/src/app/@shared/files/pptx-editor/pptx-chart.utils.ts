type XmlElement = Element
type ThemeColors = Record<string, string>

type ChartSeries = {
  name: string
  categories: string[]
  values: number[]
  xValues: number[]
  color: string | null
  pointColors: Map<number, string>
  valueFormat: string | null
  labelFormat: string | null
  marker: string | null
  markerSize: number | null
  lineWidth: number | null
  dash: string | null
}

const SVG_WIDTH = 1000
const SVG_HEIGHT = 600
const DEFAULT_SERIES_COLORS = [
  [68, 114, 196],
  [237, 125, 49],
  [165, 165, 165],
  [255, 192, 0],
  [91, 155, 213],
  [112, 173, 71]
] as const

/**
 * Builds a lightweight SVG preview for classic OOXML charts. The original chart
 * part remains in the package, so this preview is only a view representation.
 */
export async function renderPptxChart(
  zip: { file(path: string): { async(type: 'text'): Promise<string> } | null },
  path: string,
  theme: ThemeColors = {}
) {
  const file = zip.file(path)
  if (!file) return null
  const xml = await file.async('text')
  const root = parseXml(xml)
  const plotArea = descendant(root, 'plotArea')
  if (!plotArea) return null

  const chartType = [
    'barChart',
    'lineChart',
    'areaChart',
    'pieChart',
    'doughnutChart',
    'scatterChart',
    'radarChart'
  ].find((type) => directChild(plotArea, type))
  if (!chartType) return null
  const chart = directChild(plotArea, chartType)
  if (!chart) return null
  const chartSpace = directChild(root, 'chart')
  const title = readChartTitle(directChild(chartSpace, 'title'))
  const scatter = chartType === 'scatterChart'
  const series = directChildren(chart, 'ser')
    .map((item) => readSeries(item, theme, scatter))
    .filter((item): item is ChartSeries => !!item)
  if (!series.length) return null

  if (scatter) return renderScatterChart(root, chartSpace, chart, series, theme)
  if (chartType === 'radarChart') return renderRadarChart(root, chartSpace, chart, series, theme)

  const categories = series.find((item) => item.categories.length)?.categories ?? []
  const values = series.flatMap((item) => item.values).filter(Number.isFinite)
  if (!categories.length || !values.length) return null
  const firstSeries = series[0]
  if (!firstSeries) return null

  const isLine = chartType === 'lineChart' || chartType === 'areaChart'
  const isPie = chartType === 'pieChart' || chartType === 'doughnutChart'
  const horizontalBars = chartType === 'barChart' && attr(directChild(chart, 'barDir'), 'val') === 'bar'
  const grouping = attr(chart, 'grouping') ?? 'clustered'
  const background = colorFrom(directChild(directChild(root, 'spPr'), 'solidFill'), theme) ?? 'transparent'
  const plotBackground = colorFrom(directChild(directChild(plotArea, 'spPr'), 'solidFill'), theme) ?? background
  const axis = directChild(plotArea, 'valAx')
  const scaling = directChild(axis, 'scaling')
  const dataMin = Math.min(...values)
  const dataMax = Math.max(...values)
  const authoredMinimum = optionalNumber(directChild(scaling, 'min'))
  const minimum = authoredMinimum ?? (dataMin >= 0 ? 0 : dataMin * 1.12)
  const majorUnit = numberValue(directChild(axis, 'majorUnit'), 0)
  // Do not add one unit to an explicitly authored range. Percentage charts commonly
  // use a range such as 0.88–0.96, where that old fallback flattened the whole line.
  const authoredMaximum = optionalNumber(directChild(scaling, 'max'))
  const rawMaximum =
    authoredMaximum ??
    (dataMax === minimum
      ? minimum + Math.max(Math.abs(minimum) * 0.1, 1)
      : dataMax + Math.abs(dataMax - minimum) * 0.05)
  const automaticStep = majorUnit > 0 ? majorUnit : niceStep(rawMaximum - minimum)
  const maximum = authoredMaximum ?? Math.ceil(rawMaximum / automaticStep) * automaticStep
  const range = Math.max(Math.abs(maximum - minimum), Number.EPSILON)
  const axisFormat = attr(directChild(axis, 'numFmt'), 'formatCode') ?? textOf(directChild(axis, 'numFmt'))
  const ticks = tickValues(minimum, maximum, majorUnit)
  const left = horizontalBars ? 154 : 72
  const right = 24
  const top = title ? 58 : 24
  const bottom = horizontalBars ? 62 : 74
  const plotWidth = SVG_WIDTH - left - right
  const plotHeight = SVG_HEIGHT - top - bottom
  const valueY = (value: number) => roundCoordinate(top + plotHeight - ((value - minimum) / range) * plotHeight)
  const valueX = (value: number) => roundCoordinate(left + ((value - minimum) / range) * plotWidth)
  const axisStyle = directChild(axis, 'spPr')
  const gridlines = directChild(axis, 'majorGridlines')
  const gridColor =
    colorFrom(descendant(gridlines, 'solidFill'), theme) ??
    colorFrom(descendant(axisStyle, 'solidFill'), theme) ??
    rgbColor(215, 221, 213)
  const textColor = colorFrom(descendant(directChild(axis, 'txPr'), 'solidFill'), theme) ?? rgbColor(104, 123, 117)
  const labels = directChild(chart, 'dLbls')
  const showValues = flag(labels, 'showVal')
  const labelColor = colorFrom(descendant(directChild(labels, 'txPr'), 'solidFill'), theme) ?? rgbColor(18, 61, 55)
  const labelSize = textRunSize(directChild(labels, 'txPr'), 16)
  const categoryAxis = directChild(plotArea, 'catAx')
  const categoryAxisReversed =
    attr(directChild(directChild(categoryAxis, 'scaling'), 'orientation'), 'val') === 'maxMin'
  const categoryTextColor = colorFrom(descendant(directChild(categoryAxis, 'txPr'), 'solidFill'), theme) ?? textColor
  const categorySize = textRunSize(directChild(categoryAxis, 'txPr'), 13.5)
  // PowerPoint resolves a data label's format from the series cache first, then
  // from the value axis.  A `General` label format means "use the source
  // value format" and must not hide a cache format such as `#,##0` or `0.0%`.
  const dataFormat =
    series.find((item) => item.labelFormat && !isGeneralFormat(item.labelFormat))?.labelFormat ??
    series.find((item) => item.valueFormat && !isGeneralFormat(item.valueFormat))?.valueFormat ??
    (axisFormat && !isGeneralFormat(axisFormat) ? axisFormat : null)
  const tickFormat =
    axisFormat?.includes('%') && !axisFormat.includes('.') && dataFormat?.includes('.') ? dataFormat : axisFormat
  const svg: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" preserveAspectRatio="none">`,
    `<rect width="${SVG_WIDTH}" height="${SVG_HEIGHT}" fill="${escapeAttribute(background)}"/>`,
    `<rect x="${left}" y="${top}" width="${plotWidth}" height="${plotHeight}" fill="${escapeAttribute(plotBackground)}"/>`
  ]
  if (title) {
    svg.push(
      `<text x="${SVG_WIDTH / 2}" y="30" text-anchor="middle" fill="${escapeAttribute(textColor)}" font-size="26" font-weight="600">${escapeXml(title)}</text>`
    )
  }

  for (const tick of isPie ? [] : ticks) {
    if (horizontalBars) {
      const x = valueX(tick)
      svg.push(
        `<line x1="${x}" y1="${top}" x2="${x}" y2="${top + plotHeight}" stroke="${escapeAttribute(gridColor)}" stroke-width="2"/>`
      )
      svg.push(
        `<text x="${x}" y="${top + plotHeight + 28}" text-anchor="middle" fill="${escapeAttribute(textColor)}" font-size="${categorySize}">${escapeXml(formatValue(tick, tickFormat))}</text>`
      )
    } else {
      const y = valueY(tick)
      svg.push(
        `<line x1="${left}" y1="${y}" x2="${left + plotWidth}" y2="${y}" stroke="${escapeAttribute(gridColor)}" stroke-width="2"/>`
      )
      svg.push(
        `<text x="${left - 10}" y="${y + 5}" text-anchor="end" fill="${escapeAttribute(textColor)}" font-size="${categorySize}">${escapeXml(formatValue(tick, tickFormat))}</text>`
      )
    }
  }

  if (isPie) {
    renderPie(
      svg,
      firstSeries,
      left,
      top,
      plotWidth,
      plotHeight,
      chartType === 'doughnutChart',
      showValues,
      flag(labels, 'showPercent'),
      labelColor,
      labelSize,
      dataFormat
    )
  } else if (horizontalBars) {
    renderHorizontalBars(
      svg,
      series,
      categories.length,
      left,
      top,
      plotWidth,
      plotHeight,
      valueX,
      grouping,
      showValues,
      labelColor,
      labelSize,
      dataFormat,
      categoryAxisReversed
    )
  } else if (isLine) {
    renderLines(
      svg,
      series,
      categories.length,
      left,
      top,
      plotWidth,
      plotHeight,
      valueY,
      showValues,
      labelColor,
      labelSize,
      dataFormat
    )
  } else {
    renderBars(
      svg,
      series,
      categories.length,
      left,
      top,
      plotWidth,
      plotHeight,
      valueY,
      grouping,
      showValues,
      labelColor,
      labelSize,
      dataFormat
    )
  }

  const categoryStep = plotHeight / Math.max(categories.length, 1)
  categories.forEach((category, index) => {
    if (isPie) return
    if (horizontalBars) {
      const rowIndex = categoryAxisReversed ? index : categories.length - 1 - index
      const y = top + categoryStep * (rowIndex + 0.5)
      svg.push(
        `<text x="${left - 12}" y="${y + 5}" text-anchor="end" fill="${escapeAttribute(categoryTextColor)}" font-size="${categorySize}">${escapeXml(category)}</text>`
      )
    } else {
      const x = left + (plotWidth / Math.max(categories.length, 1)) * (index + 0.5)
      svg.push(
        `<text x="${x}" y="${top + plotHeight + 30}" text-anchor="middle" fill="${escapeAttribute(categoryTextColor)}" font-size="${categorySize}">${escapeXml(category)}</text>`
      )
    }
  })
  if (!isPie) {
    svg.push(
      `<line x1="${left}" y1="${top + plotHeight}" x2="${left + plotWidth}" y2="${top + plotHeight}" stroke="${escapeAttribute(gridColor)}" stroke-width="2"/>`
    )
  }
  renderLegend(svg, chartSpace, series, categoryTextColor, categorySize, top + plotHeight + (horizontalBars ? 48 : 54))
  svg.push('</svg>')
  return svgDataUrl(svg.join(''))
}

function renderScatterChart(
  root: XmlElement | null,
  chartSpace: XmlElement | null,
  chart: XmlElement,
  series: ChartSeries[],
  theme: ThemeColors
) {
  const plotArea = descendant(root, 'plotArea')
  const title = readChartTitle(directChild(chartSpace, 'title'))
  const valAxes = directChildren(plotArea, 'valAx')
  const xAxis =
    valAxes.find((axis) => ['b', 't'].includes(attr(directChild(axis, 'axPos'), 'val') ?? '')) ?? valAxes[1] ?? null
  const yAxis =
    valAxes.find((axis) => ['l', 'r'].includes(attr(directChild(axis, 'axPos'), 'val') ?? '')) ?? valAxes[0] ?? null
  const points = series.map((item) =>
    item.values
      .map((value, index) => ({ x: item.xValues[index] ?? index + 1, y: value, index }))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
  )
  const allX = points.flatMap((item) => item.map((point) => point.x))
  const allY = points.flatMap((item) => item.map((point) => point.y))
  if (!allX.length || !allY.length) return null

  const xRange = chartAxisRange(xAxis, allX, false)
  const yRange = chartAxisRange(yAxis, allY, false)
  const background = colorFrom(directChild(directChild(root, 'spPr'), 'solidFill'), theme) ?? 'transparent'
  const plotBackground = colorFrom(directChild(directChild(plotArea, 'spPr'), 'solidFill'), theme) ?? background
  const xLabelSize = textRunSize(directChild(xAxis, 'txPr'), 13.5)
  const yLabelSize = textRunSize(directChild(yAxis, 'txPr'), 13.5)
  const xTextColor = colorFrom(descendant(directChild(xAxis, 'txPr'), 'solidFill'), theme) ?? rgbColor(104, 123, 117)
  const yTextColor = colorFrom(descendant(directChild(yAxis, 'txPr'), 'solidFill'), theme) ?? xTextColor
  const xTitle = readChartTitle(directChild(xAxis, 'title'))
  const yTitle = readChartTitle(directChild(yAxis, 'title'))
  const labels = directChild(chart, 'dLbls')
  const showValues = flag(labels, 'showVal')
  const labelColor = colorFrom(descendant(directChild(labels, 'txPr'), 'solidFill'), theme) ?? yTextColor
  const labelSize = textRunSize(directChild(labels, 'txPr'), 13.5)
  const xFormat = attr(directChild(xAxis, 'numFmt'), 'formatCode') ?? textOf(directChild(xAxis, 'numFmt'))
  const yFormat = attr(directChild(yAxis, 'numFmt'), 'formatCode') ?? textOf(directChild(yAxis, 'numFmt'))
  const dataFormat =
    series.find((item) => item.valueFormat && !isGeneralFormat(item.valueFormat))?.valueFormat ?? yFormat
  const left = 98
  const right = 34
  const top = title ? 58 : 28
  const bottom = 88 + (xTitle ? 18 : 0)
  const plotWidth = SVG_WIDTH - left - right
  const plotHeight = SVG_HEIGHT - top - bottom
  const xOf = (value: number) => roundCoordinate(left + ((value - xRange.minimum) / xRange.range) * plotWidth)
  const yOf = (value: number) =>
    roundCoordinate(top + plotHeight - ((value - yRange.minimum) / yRange.range) * plotHeight)
  const xTicks = tickValues(xRange.minimum, xRange.maximum, xRange.majorUnit)
  const yTicks = tickValues(yRange.minimum, yRange.maximum, yRange.majorUnit)
  const xGridColor =
    colorFrom(descendant(directChild(xAxis, 'majorGridlines'), 'solidFill'), theme) ?? rgbColor(215, 221, 213)
  const yGridColor = colorFrom(descendant(directChild(yAxis, 'majorGridlines'), 'solidFill'), theme) ?? xGridColor
  const axisColor = colorFrom(descendant(directChild(yAxis, 'spPr'), 'solidFill'), theme) ?? xGridColor
  const svg: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" preserveAspectRatio="none">`,
    `<rect width="${SVG_WIDTH}" height="${SVG_HEIGHT}" fill="${escapeAttribute(background)}"/>`,
    `<rect x="${left}" y="${top}" width="${plotWidth}" height="${plotHeight}" fill="${escapeAttribute(plotBackground)}"/>`
  ]
  if (title)
    svg.push(
      `<text x="${SVG_WIDTH / 2}" y="30" text-anchor="middle" fill="${escapeAttribute(yTextColor)}" font-size="26" font-weight="600">${escapeXml(title)}</text>`
    )
  for (const tick of yTicks) {
    const y = yOf(tick)
    svg.push(
      `<line x1="${left}" y1="${y}" x2="${left + plotWidth}" y2="${y}" stroke="${escapeAttribute(yGridColor)}" stroke-width="2"/>`
    )
    svg.push(
      `<text x="${left - 10}" y="${y + 5}" text-anchor="end" fill="${escapeAttribute(yTextColor)}" font-size="${yLabelSize}">${escapeXml(formatValue(tick, yFormat))}</text>`
    )
  }
  for (const tick of xTicks) {
    const x = xOf(tick)
    svg.push(
      `<line x1="${x}" y1="${top}" x2="${x}" y2="${top + plotHeight}" stroke="${escapeAttribute(xGridColor)}" stroke-width="2"/>`
    )
    svg.push(
      `<text x="${x}" y="${top + plotHeight + 28}" text-anchor="middle" fill="${escapeAttribute(xTextColor)}" font-size="${xLabelSize}">${escapeXml(formatValue(tick, xFormat))}</text>`
    )
  }
  svg.push(
    `<line x1="${left}" y1="${top + plotHeight}" x2="${left + plotWidth}" y2="${top + plotHeight}" stroke="${escapeAttribute(axisColor)}" stroke-width="2"/>`
  )
  svg.push(
    `<line x1="${left}" y1="${top}" x2="${left}" y2="${top + plotHeight}" stroke="${escapeAttribute(axisColor)}" stroke-width="2"/>`
  )
  if (xTitle)
    svg.push(
      `<text x="${left + plotWidth / 2}" y="${SVG_HEIGHT - 18}" text-anchor="middle" fill="${escapeAttribute(xTextColor)}" font-size="${xLabelSize}">${escapeXml(xTitle)}</text>`
    )
  if (yTitle)
    svg.push(
      `<text x="18" y="${top + plotHeight / 2}" text-anchor="middle" fill="${escapeAttribute(yTextColor)}" font-size="${yLabelSize}" transform="rotate(-90 18 ${top + plotHeight / 2})">${escapeXml(yTitle)}</text>`
    )

  const scatterStyle = attr(directChild(chart, 'scatterStyle'), 'val') ?? 'lineMarker'
  const hasLine = scatterStyle.startsWith('line') || scatterStyle.startsWith('smooth')
  const defaultMarker = scatterStyle !== 'line' && scatterStyle !== 'smooth' && scatterStyle !== 'none'
  series.forEach((item, seriesIndex) => {
    const color = item.color ?? fallbackSeriesColor(seriesIndex)
    const itemPoints = points[seriesIndex] ?? []
    const orderedPoints = hasLine ? [...itemPoints].sort((a, b) => a.x - b.x) : itemPoints
    if (hasLine && orderedPoints.length > 1) {
      const path = orderedPoints.map((point) => `${xOf(point.x)},${yOf(point.y)}`).join(' ')
      const width = Math.max(2, (item.lineWidth ?? 1.5) * 2)
      const dash = svgDash(item.dash)
      svg.push(
        `<polyline points="${path}" fill="none" stroke="${escapeAttribute(color)}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`
      )
    }
    const showMarker = item.marker ? item.marker !== 'none' : defaultMarker
    orderedPoints.forEach((point) => {
      const x = xOf(point.x)
      const y = yOf(point.y)
      if (showMarker)
        renderMarker(svg, x, y, Math.max(4, Math.min(12, (item.markerSize ?? 8) * 0.6)), color, item.marker)
      if (showValues)
        svg.push(
          `<text x="${x}" y="${Math.max(labelSize + 2, y - 12)}" text-anchor="middle" fill="${escapeAttribute(labelColor)}" font-size="${labelSize}">${escapeXml(formatValue(point.y, dataFormat))}</text>`
        )
    })
  })
  renderLegend(svg, chartSpace, series, xTextColor, xLabelSize, top + plotHeight + 54)
  svg.push('</svg>')
  return svgDataUrl(svg.join(''))
}

function renderRadarChart(
  root: XmlElement | null,
  chartSpace: XmlElement | null,
  chart: XmlElement,
  series: ChartSeries[],
  theme: ThemeColors
) {
  const plotArea = descendant(root, 'plotArea')
  const categories = series.find((item) => item.categories.length)?.categories ?? []
  const n = categories.length
  if (n < 3) return null
  const values = series.flatMap((item) => item.values).filter(Number.isFinite)
  if (!values.length) return null
  const axis = directChild(plotArea, 'valAx')
  const range = chartAxisRange(axis, values, true)
  const title = readChartTitle(directChild(chartSpace, 'title'))
  const background = colorFrom(directChild(directChild(root, 'spPr'), 'solidFill'), theme) ?? 'transparent'
  const plotBackground = colorFrom(directChild(directChild(plotArea, 'spPr'), 'solidFill'), theme) ?? background
  const labelSize = textRunSize(directChild(axis, 'txPr'), 13.5)
  const labelColor = colorFrom(descendant(directChild(axis, 'txPr'), 'solidFill'), theme) ?? rgbColor(104, 123, 117)
  const catAxis = directChild(plotArea, 'catAx')
  const categoryColor = colorFrom(descendant(directChild(catAxis, 'txPr'), 'solidFill'), theme) ?? labelColor
  const gridColor =
    colorFrom(descendant(directChild(axis, 'majorGridlines'), 'solidFill'), theme) ?? rgbColor(215, 221, 213)
  const left = 112
  const right = 112
  const top = title ? 58 : 28
  const bottom = 82
  const cx = left + (SVG_WIDTH - left - right) / 2
  const cy = top + (SVG_HEIGHT - top - bottom) / 2
  const radius = Math.max(24, Math.min((SVG_WIDTH - left - right) / 2, (SVG_HEIGHT - top - bottom) / 2))
  const angleOf = (index: number) => -Math.PI / 2 + (index / n) * Math.PI * 2
  const radiusOf = (value: number) => radius * Math.max(0, Math.min(1, (value - range.minimum) / range.range))
  const pointAt = (index: number, value: number) => {
    const angle = angleOf(index)
    const distance = radiusOf(value)
    return { x: roundCoordinate(cx + Math.cos(angle) * distance), y: roundCoordinate(cy + Math.sin(angle) * distance) }
  }
  const svg: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" preserveAspectRatio="none">`,
    `<rect width="${SVG_WIDTH}" height="${SVG_HEIGHT}" fill="${escapeAttribute(background)}"/>`,
    `<rect x="${left}" y="${top}" width="${SVG_WIDTH - left - right}" height="${SVG_HEIGHT - top - bottom}" fill="${escapeAttribute(plotBackground)}"/>`
  ]
  if (title)
    svg.push(
      `<text x="${SVG_WIDTH / 2}" y="30" text-anchor="middle" fill="${escapeAttribute(labelColor)}" font-size="26" font-weight="600">${escapeXml(title)}</text>`
    )
  for (const tick of tickValues(range.minimum, range.maximum, range.majorUnit)) {
    if (tick === range.minimum) continue
    const points = categories
      .map((_, index) => {
        const point = pointAt(index, tick)
        return `${point.x},${point.y}`
      })
      .join(' ')
    svg.push(`<polygon points="${points}" fill="none" stroke="${escapeAttribute(gridColor)}" stroke-width="2"/>`)
    const topPoint = pointAt(0, tick)
    svg.push(
      `<text x="${topPoint.x - 8}" y="${topPoint.y + 5}" text-anchor="end" fill="${escapeAttribute(labelColor)}" font-size="${labelSize}">${escapeXml(formatValue(tick, attr(directChild(axis, 'numFmt'), 'formatCode')))}</text>`
    )
  }
  categories.forEach((category, index) => {
    const outer = pointAt(index, range.maximum)
    svg.push(
      `<line x1="${cx}" y1="${cy}" x2="${outer.x}" y2="${outer.y}" stroke="${escapeAttribute(gridColor)}" stroke-width="2"/>`
    )
    const angle = angleOf(index)
    const x = cx + Math.cos(angle) * (radius + labelSize * 0.8)
    const y = cy + Math.sin(angle) * (radius + labelSize * 0.8)
    const anchor = Math.cos(angle) > 0.25 ? 'start' : Math.cos(angle) < -0.25 ? 'end' : 'middle'
    const baseline = Math.sin(angle) > 0.35 ? labelSize * 0.35 : Math.sin(angle) < -0.35 ? 0 : labelSize * 0.12
    svg.push(
      `<text x="${x}" y="${y + baseline}" text-anchor="${anchor}" fill="${escapeAttribute(categoryColor)}" font-size="${labelSize}">${escapeXml(category)}</text>`
    )
  })
  const radarStyle = attr(directChild(chart, 'radarStyle'), 'val') ?? 'standard'
  series.forEach((item, seriesIndex) => {
    const color = item.color ?? fallbackSeriesColor(seriesIndex)
    const points = categories
      .map((_, index) => {
        const value = item.values[index] ?? range.minimum
        const point = pointAt(index, value)
        return `${point.x},${point.y}`
      })
      .join(' ')
    const width = Math.max(2, (item.lineWidth ?? 1.5) * 2)
    const dash = svgDash(item.dash)
    svg.push(
      `<polygon points="${points}" fill="${escapeAttribute(color)}" fill-opacity="${radarStyle === 'filled' ? '0.28' : '0'}" stroke="${escapeAttribute(color)}" stroke-width="${width}" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`
    )
    const showMarker = item.marker ? item.marker !== 'none' : radarStyle === 'marker'
    if (showMarker)
      categories.forEach((_, index) => {
        const point = pointAt(index, item.values[index] ?? range.minimum)
        renderMarker(svg, point.x, point.y, Math.max(4, Math.min(10, (item.markerSize ?? 7) * 0.6)), color, item.marker)
      })
  })
  renderLegend(svg, chartSpace, series, categoryColor, labelSize, SVG_HEIGHT - 24)
  svg.push('</svg>')
  return svgDataUrl(svg.join(''))
}

function chartAxisRange(axis: XmlElement | null, values: number[], zeroBaseline: boolean) {
  const scaling = directChild(axis, 'scaling')
  const authoredMinimum = optionalNumber(directChild(scaling, 'min'))
  const authoredMaximum = optionalNumber(directChild(scaling, 'max'))
  const dataMin = Math.min(...values)
  const dataMax = Math.max(...values)
  const span = Math.max(Math.abs(dataMax - dataMin), Math.abs(dataMax) * 0.1, 1)
  const minimum = authoredMinimum ?? (zeroBaseline && dataMin >= 0 ? 0 : dataMin - span * 0.05)
  const rawMaximum = authoredMaximum ?? dataMax + span * 0.05
  const majorUnit = numberValue(directChild(axis, 'majorUnit'), 0)
  const step = majorUnit > 0 ? majorUnit : niceStep(Math.max(rawMaximum - minimum, Number.EPSILON))
  const maximum = authoredMaximum ?? Math.ceil(rawMaximum / step) * step
  return { minimum, maximum, range: Math.max(Math.abs(maximum - minimum), Number.EPSILON), majorUnit }
}

function renderMarker(svg: string[], x: number, y: number, radius: number, color: string, symbol: string | null) {
  switch (symbol) {
    case 'square':
      svg.push(
        `<rect x="${x - radius}" y="${y - radius}" width="${radius * 2}" height="${radius * 2}" fill="${escapeAttribute(color)}"/>`
      )
      break
    case 'diamond':
      svg.push(
        `<polygon points="${x},${y - radius} ${x + radius},${y} ${x},${y + radius} ${x - radius},${y}" fill="${escapeAttribute(color)}"/>`
      )
      break
    case 'triangle':
    case 'triangleUp':
      svg.push(
        `<polygon points="${x},${y - radius} ${x + radius},${y + radius} ${x - radius},${y + radius}" fill="${escapeAttribute(color)}"/>`
      )
      break
    case 'x':
      svg.push(
        `<path d="M ${x - radius} ${y - radius} L ${x + radius} ${y + radius} M ${x + radius} ${y - radius} L ${x - radius} ${y + radius}" stroke="${escapeAttribute(color)}" stroke-width="${Math.max(2, radius / 2)}"/>`
      )
      break
    default:
      svg.push(`<circle cx="${x}" cy="${y}" r="${radius}" fill="${escapeAttribute(color)}"/>`)
  }
}

function svgDash(dash: string | null) {
  switch (dash) {
    case 'dash':
    case 'sysDash':
      return '12 8'
    case 'dashDot':
    case 'sysDashDot':
      return '12 6 2 6'
    case 'dot':
    case 'sysDot':
      return '2 6'
    case 'longDash':
    case 'sysLongDash':
      return '20 8'
    default:
      return ''
  }
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
  showValues: boolean,
  labelColor: string,
  labelSize: number,
  valueFormat: string | null
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
          `<text x="${x + barWidth / 2 - 1.5}" y="${Math.max(labelSize + 2, Math.min(y, bottom) - 9)}" text-anchor="middle" fill="${escapeAttribute(labelColor)}" font-size="${labelSize}">${escapeXml(formatValue(value, valueFormat))}</text>`
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
  showValues: boolean,
  labelColor: string,
  labelSize: number,
  valueFormat: string | null
) {
  const step = width / Math.max(categoryCount, 1)
  series.forEach((item, seriesIndex) => {
    const color = item.color ?? fallbackSeriesColor(seriesIndex)
    const points = item.values
      .slice(0, categoryCount)
      .map((value, index) => `${left + step * (index + 0.5)},${valueY(value)}`)
      .join(' ')
    svg.push(
      `<polyline points="${points}" fill="none" stroke="${escapeAttribute(color)}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`
    )
    item.values.slice(0, categoryCount).forEach((value, index) => {
      const x = left + step * (index + 0.5)
      const y = valueY(value)
      svg.push(`<circle cx="${x}" cy="${y}" r="10" fill="${escapeAttribute(color)}"/>`)
      if (showValues)
        svg.push(
          `<text x="${x}" y="${Math.max(labelSize + 2, y - 14)}" text-anchor="middle" fill="${escapeAttribute(labelColor)}" font-size="${labelSize}">${escapeXml(formatValue(value, valueFormat))}</text>`
        )
    })
  })
}

function renderHorizontalBars(
  svg: string[],
  series: ChartSeries[],
  categoryCount: number,
  left: number,
  top: number,
  width: number,
  height: number,
  valueX: (value: number) => number,
  grouping: string,
  showValues: boolean,
  labelColor: string,
  labelSize: number,
  valueFormat: string | null,
  categoryAxisReversed: boolean
) {
  const step = height / Math.max(categoryCount, 1)
  const groupHeight = step * 0.7
  const barHeight = grouping === 'stacked' || grouping === 'percentStacked' ? groupHeight : groupHeight / series.length
  const colors = series.map((item, index) => item.color ?? fallbackSeriesColor(index))
  for (let categoryIndex = 0; categoryIndex < categoryCount; categoryIndex++) {
    let stackedBase = 0
    const rowIndex = categoryAxisReversed ? categoryIndex : categoryCount - 1 - categoryIndex
    series.forEach((item, seriesIndex) => {
      const value = item.values[categoryIndex] ?? 0
      const base = grouping === 'stacked' || grouping === 'percentStacked' ? stackedBase : 0
      const x = valueX(base)
      const end = valueX(base + value)
      const y =
        top +
        step * rowIndex +
        (step - groupHeight) / 2 +
        (grouping === 'stacked' || grouping === 'percentStacked' ? 0 : seriesIndex * barHeight)
      const color = item.pointColors.get(categoryIndex) ?? colors[seriesIndex]
      svg.push(
        `<rect x="${Math.min(x, end)}" y="${y}" width="${Math.max(1, Math.abs(end - x))}" height="${Math.max(1, barHeight - 3)}" fill="${escapeAttribute(color)}"/>`
      )
      if (showValues)
        svg.push(
          `<text x="${Math.max(left + 4, Math.max(x, end) + 8)}" y="${y + barHeight / 2 + labelSize / 3}" text-anchor="start" fill="${escapeAttribute(labelColor)}" font-size="${labelSize}">${escapeXml(formatValue(value, valueFormat))}</text>`
        )
      if (grouping === 'stacked' || grouping === 'percentStacked') stackedBase += value
    })
  }
}

function renderPie(
  svg: string[],
  series: ChartSeries,
  left: number,
  top: number,
  width: number,
  height: number,
  doughnut: boolean,
  showValues: boolean,
  showPercent: boolean,
  labelColor: string,
  labelSize: number,
  valueFormat: string | null
) {
  const values = series.values.map((value) => Math.max(0, value))
  const total = values.reduce((sum, value) => sum + value, 0)
  if (!total) return
  const cx = left + width / 2
  const cy = top + height / 2
  const radius = Math.max(20, Math.min(width, height) * 0.38)
  const innerRadius = doughnut ? radius * 0.52 : 0
  let angle = -Math.PI / 2
  values.forEach((value, index) => {
    const sweep = (value / total) * Math.PI * 2
    const nextAngle = angle + sweep
    const color = series.pointColors.get(index) ?? series.color ?? fallbackSeriesColor(index)
    const outerStart = polarPoint(cx, cy, radius, angle)
    const outerEnd = polarPoint(cx, cy, radius, nextAngle)
    const largeArc = sweep > Math.PI ? 1 : 0
    const path = innerRadius
      ? (() => {
          const innerEnd = polarPoint(cx, cy, innerRadius, nextAngle)
          const innerStart = polarPoint(cx, cy, innerRadius, angle)
          return `M ${outerStart.x} ${outerStart.y} A ${radius} ${radius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y} L ${innerEnd.x} ${innerEnd.y} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y} Z`
        })()
      : `M ${cx} ${cy} L ${outerStart.x} ${outerStart.y} A ${radius} ${radius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y} Z`
    svg.push(
      `<path d="${path}" fill="${escapeAttribute(color)}" stroke="${escapeAttribute(rgbColor(255, 255, 255))}" stroke-width="2"/>`
    )
    if (showValues || showPercent) {
      const mid = angle + sweep / 2
      const point = polarPoint(cx, cy, radius * 0.68, mid)
      const valueText = showPercent ? `${((value / total) * 100).toFixed(1)}%` : formatValue(value, valueFormat)
      svg.push(
        `<text x="${point.x}" y="${point.y}" text-anchor="middle" fill="${escapeAttribute(labelColor)}" font-size="${labelSize}">${escapeXml(valueText)}</text>`
      )
    }
    angle = nextAngle
  })
}

function polarPoint(cx: number, cy: number, radius: number, angle: number) {
  return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius }
}

function renderLegend(
  svg: string[],
  chart: XmlElement | null,
  series: ChartSeries[],
  color: string,
  size: number,
  y: number
) {
  const legend = directChild(chart, 'legend')
  if (!legend || series.length < 2) return
  const itemWidth = SVG_WIDTH / series.length
  series.forEach((item, index) => {
    const x = 120 + index * itemWidth
    const seriesColor = item.color ?? fallbackSeriesColor(index)
    svg.push(
      `<rect x="${x}" y="${y - size + 2}" width="${size}" height="${size}" fill="${escapeAttribute(seriesColor)}"/>`
    )
    svg.push(
      `<text x="${x + size + 8}" y="${y + 3}" fill="${escapeAttribute(color)}" font-size="${size}">${escapeXml(item.name || `Series ${index + 1}`)}</text>`
    )
  })
}

function readSeries(series: XmlElement, theme: ThemeColors, scatter = false): ChartSeries | null {
  const name =
    textCache(directChild(directChild(series, 'tx'), 'strRef'))[0] ??
    textOf(directChild(directChild(series, 'tx'), 'v'))
  const categories = scatter ? [] : textCache(directChild(series, 'cat'))
  const valuesNode = directChild(series, scatter ? 'yVal' : 'val')
  const rawValues = numberCache(valuesNode)
  const rawXValues = scatter ? numberCache(directChild(series, 'xVal')) : []
  const values =
    scatter && rawXValues.length ? rawValues.slice(0, Math.min(rawValues.length, rawXValues.length)) : rawValues
  const xValues = scatter && rawXValues.length ? rawXValues.slice(0, values.length) : []
  if ((!scatter && !categories.length) || !values.length) return null
  const pointColors = new Map<number, string>()
  directChildren(series, 'dPt').forEach((point) => {
    const index = Number(attr(directChild(point, 'idx'), 'val'))
    const color = colorFrom(directChild(directChild(point, 'spPr'), 'solidFill'), theme)
    if (Number.isFinite(index) && color) pointColors.set(index, color)
  })
  const valueFormat = textOf(descendant(directChild(series, 'val'), 'formatCode')) || null
  const scatterValueFormat = textOf(descendant(valuesNode, 'formatCode')) || null
  const labelFormat = attr(directChild(directChild(series, 'dLbls'), 'numFmt'), 'formatCode')
  const marker = attr(directChild(directChild(series, 'marker'), 'symbol'), 'val')
  const markerSizeRaw = Number(attr(directChild(directChild(series, 'marker'), 'size'), 'val'))
  const line = directChild(series, 'spPr') ? directChild(directChild(series, 'spPr'), 'ln') : null
  const lineWidthRaw = Number(attr(line, 'w'))
  const lineWidth = Number.isFinite(lineWidthRaw) ? lineWidthRaw : null
  const dash = attr(directChild(line, 'prstDash'), 'val')
  return {
    name,
    categories,
    values,
    xValues,
    color: seriesColor(series, theme),
    pointColors,
    valueFormat: scatterValueFormat || valueFormat,
    labelFormat,
    marker,
    markerSize: Number.isFinite(markerSizeRaw) ? markerSizeRaw : null,
    lineWidth: lineWidth != null ? lineWidth / 12700 : null,
    dash
  }
}

function seriesColor(series: XmlElement, theme: ThemeColors) {
  const shapeProperties = directChild(series, 'spPr')
  return (
    colorFrom(directChild(shapeProperties, 'solidFill'), theme) ??
    colorFrom(descendant(shapeProperties, 'solidFill'), theme)
  )
}

function readChartTitle(title: XmlElement | null) {
  if (!title) return ''
  const tx = directChild(title, 'tx')
  const rich = directChild(tx, 'rich')
  const paragraphs = directChildren(rich, 'p')
  const text = paragraphs.length
    ? paragraphs
        .map((paragraph) =>
          directChildren(paragraph, 'r')
            .map((run) => textOf(directChild(run, 't')))
            .join('')
        )
        .join('\n')
    : textOf(directChild(tx, 'v'))
  return text.trim()
}

function textCache(node: XmlElement | null): string[] {
  // PptxGenJS also writes single-level categories as multiLvlStrCache. The
  // first level holds the leaf labels aligned with the series' value indexes.
  const cache = node ? (descendant(node, 'strCache') ?? directChild(descendant(node, 'multiLvlStrCache'), 'lvl')) : null
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
  const step = majorUnit > 0 ? majorUnit : niceStep(maximum - minimum)
  const values: number[] = []
  for (let value = minimum; value <= maximum + step * 0.01 && values.length < 10; value += step) values.push(value)
  if (values.length < 2) values.push(maximum)
  return values
}

function niceStep(value: number) {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(value, Number.EPSILON)))
  const normalized = value / magnitude
  // PowerPoint's automatic vertical axis uses the 1/2/5 ladder against the
  // full range. For example, an 8,064 range resolves to 1,000-unit ticks and
  // an automatic maximum of 8,000.
  const base = normalized >= 5 ? 1 : normalized >= 2 ? 0.5 : 0.2
  return base * magnitude
}

function formatValue(value: number, formatCode: string | null = null) {
  if (formatCode?.includes('%')) {
    const decimals = (formatCode.split('.')[1]?.split('%')[0] ?? '').replace(/[^0#]/g, '').length
    return `${(value * 100).toFixed(decimals)}%`
  }
  const decimals = formatCode?.includes('.') ? (formatCode.split('.')[1] ?? '').replace(/[^0#]/g, '').length : 0
  return decimals > 0
    ? value.toFixed(decimals)
    : Number.isInteger(value)
      ? value.toLocaleString()
      : value.toFixed(1).replace(/\.0$/, '')
}

function isGeneralFormat(formatCode: string | null) {
  return !formatCode || formatCode.trim().toLowerCase() === 'general'
}

function fallbackSeriesColor(index: number) {
  const color = DEFAULT_SERIES_COLORS[index % DEFAULT_SERIES_COLORS.length]
  return rgbColor(color[0], color[1], color[2])
}

function colorFrom(node: XmlElement | null, theme: ThemeColors = {}): string | null {
  const color = node
    ? directChildren(node).find((child) => ['srgbClr', 'schemeClr', 'sysClr'].includes(localName(child)))
    : null
  if (!color) return null
  const rawValue = attr(color, 'lastClr') ?? attr(color, 'val')
  if (!rawValue) return null
  const value = /^[0-9a-f]{6}$/i.test(rawValue)
    ? rawValue
    : (theme[rawValue] ??
      theme[rawValue.toLowerCase()] ??
      theme[rawValue === 'tx1' ? 'dk1' : rawValue === 'bg1' ? 'lt1' : rawValue] ??
      theme[rawValue === 'tx2' ? 'dk2' : rawValue === 'bg2' ? 'lt2' : rawValue] ??
      null)
  if (!value) return null
  const hex = value.replace(/^#/, '')
  return /^[0-9a-f]{6}$/i.test(hex) ? `#${hex}` : null
}

function rgbColor(red: number, green: number, blue: number) {
  return `#${[red, green, blue]
    .map((channel) => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, '0'))
    .join('')}`
}

function roundCoordinate(value: number) {
  return Math.round(value * 1000) / 1000
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

function flag(node: XmlElement | null, name: string) {
  return attr(node, name) === '1' || attr(directChild(node, name), 'val') === '1'
}

function textOf(node: XmlElement | null) {
  return node?.textContent?.trim() ?? ''
}

function numberValue(node: XmlElement | null, fallback: number) {
  const value = Number(attr(node, 'val') ?? textOf(node))
  return Number.isFinite(value) ? value : fallback
}

function optionalNumber(node: XmlElement | null) {
  if (!node) return null
  const raw = attr(node, 'val') ?? textOf(node)
  if (!raw.trim()) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

function textRunSize(txPr: XmlElement | null, fallbackPt: number) {
  const size = Number(attr(descendant(txPr, 'defRPr'), 'sz'))
  // SVG uses the fixed 1000-unit viewBox. These values produce PowerPoint-sized
  // labels after the chart image is scaled to its slide frame.
  return Number.isFinite(size) && size > 0 ? Math.max(18, Math.min(48, (size / 100) * 1.65)) : fallbackPt * 1.65
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
