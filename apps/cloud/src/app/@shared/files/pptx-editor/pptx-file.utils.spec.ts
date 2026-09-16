import JSZip from 'jszip'
import { parsePptx, savePptx } from './pptx-file.utils'
import { renderPptxChart } from './pptx-chart.utils'
import { createTableShape } from './pptx-editor-model.utils'
import { pptxConnectorPath, pptxPolygonPoints } from './pptx-editor-view.utils'
import type { PptxShape } from './pptx-file.utils'

describe('PPTX file utilities', () => {
  it('keeps text color separate from shape fill and resolves embedded images', async () => {
    const source = await createPresentation()

    const deck = await parsePptx(source)

    expect(deck).toMatchObject({ width: 12192000, height: 6858000 })
    expect(deck.slides).toHaveLength(1)
    expect(deck.slides[0].shapes).toHaveLength(2)
    expect(deck.slides[0].shapes[0]).toMatchObject({
      id: '2',
      kind: 'shape',
      text: 'Visible title',
      fill: null,
      textColor: '#112233',
      fontSizePt: 32,
      fontScale: 1,
      fontFamily: 'Aptos Display',
      bold: true,
      textAlign: 'center'
    })
    expect(deck.slides[0].shapes[1]).toMatchObject({ kind: 'image' })
    expect(deck.slides[0].shapes[1].imageSrc).toMatch(/^data:image\/png;base64,/)
  })

  it('resolves package-root relationships for images and charts', async () => {
    const zip = await JSZip.loadAsync(await createPresentation())
    const slide = await zip.file('ppt/slides/slide1.xml')!.async('text')
    const rels = await zip.file('ppt/slides/_rels/slide1.xml.rels')!.async('text')
    zip.file(
      'ppt/slides/slide1.xml',
      slide.replace(
        '</p:spTree>',
        `<p:graphicFrame>
          <p:nvGraphicFramePr><p:cNvPr id="4" name="Chart"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>
          <p:xfrm><a:off x="3000000" y="3000000"/><a:ext cx="5000000" cy="2500000"/></p:xfrm>
          <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rChart"/></a:graphicData></a:graphic>
        </p:graphicFrame></p:spTree>`
      )
    )
    zip.file(
      'ppt/slides/_rels/slide1.xml.rels',
      rels
        .replace('../media/image1.png', '/ppt/media/image1.png')
        .replace(
          '</Relationships>',
          '<Relationship Id="rChart" Target="/ppt/slides/charts/chart1.xml"/></Relationships>'
        )
    )
    zip.file(
      'ppt/slides/charts/chart1.xml',
      `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart">
        <c:chart><c:plotArea><c:barChart><c:grouping val="clustered"/>
          <c:ser><c:tx><c:v>Sales</c:v></c:tx><c:cat><c:strCache><c:pt idx="0"><c:v>Q1</c:v></c:pt><c:pt idx="1"><c:v>Q2</c:v></c:pt></c:strCache></c:cat>
            <c:val><c:numCache><c:pt idx="0"><c:v>10</c:v></c:pt><c:pt idx="1"><c:v>20</c:v></c:pt></c:numCache></c:val>
          </c:ser>
        </c:barChart><c:valAx><c:scaling><c:min val="0"/><c:max val="20"/></c:scaling></c:valAx></c:plotArea></c:chart>
      </c:chartSpace>`
    )

    const deck = await parsePptx(await zip.generateAsync({ type: 'arraybuffer' }))
    expect(deck.slides[0].shapes.find((shape) => shape.name === 'Photo')?.imageSrc).toMatch(/^data:image\/png;base64,/)
    expect(deck.slides[0].shapes.find((shape) => shape.name === 'Chart')).toMatchObject({
      kind: 'image',
      imageSrc: expect.stringMatching(/^data:image\/svg\+xml;base64,/)
    })
  })

  it('preserves narrow percentage ranges and percentage labels in chart previews', async () => {
    const zip = new JSZip()
    zip.file(
      'ppt/charts/percent.xml',
      `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart">
        <c:chart><c:plotArea><c:lineChart><c:ser>
          <c:spPr><a:ln xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:solidFill><a:srgbClr val="277565"/></a:solidFill></a:ln></c:spPr>
          <c:cat><c:strCache><c:pt idx="0"><c:v>Q1</c:v></c:pt><c:pt idx="1"><c:v>Q2</c:v></c:pt></c:strCache></c:cat>
          <c:val><c:numRef><c:numCache><c:formatCode>0.0%</c:formatCode><c:pt idx="0"><c:v>0.905</c:v></c:pt><c:pt idx="1"><c:v>0.932</c:v></c:pt></c:numCache></c:numRef></c:val>
        </c:ser><c:dLbls><c:showVal val="1"/><c:txPr><a:p xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:pPr><a:defRPr sz="1725"><a:solidFill><a:srgbClr val="123D37"/></a:solidFill></a:defRPr></a:pPr></a:p></c:txPr></c:dLbls></c:lineChart>
          <c:catAx/><c:valAx><c:scaling><c:min val="0.88"/><c:max val="0.96"/></c:scaling><c:numFmt formatCode="0%"/></c:valAx>
        </c:plotArea></c:chart>
      </c:chartSpace>`
    )
    const chart = await renderPptxChart(zip, 'ppt/charts/percent.xml')
    expect(chart).toMatch(/^data:image\/svg\+xml;base64,/)
    const svg = Buffer.from(chart!.split(',')[1]!, 'base64').toString('utf8')
    expect(svg).toContain('90.5%')
    expect(svg).toContain('93.2%')
    expect(svg).toContain('stroke="#277565"')
    expect(svg).toContain('y1="24"')
    expect(svg).toContain('y2="526"')
  })

  it('renders horizontal bars with inferred axes and PowerPoint category order', async () => {
    const zip = new JSZip()
    zip.file(
      'ppt/charts/horizontal.xml',
      `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart">
        <c:chart><c:plotArea><c:barChart><c:barDir val="bar"/><c:grouping val="clustered"/><c:ser>
          <c:tx><c:v>Revenue</c:v></c:tx>
          <c:cat><c:strCache><c:pt idx="0"><c:v>Professional</c:v></c:pt><c:pt idx="1"><c:v>Solutions</c:v></c:pt><c:pt idx="2"><c:v>Subscription</c:v></c:pt></c:strCache></c:cat>
          <c:val><c:numCache><c:pt idx="0"><c:v>14</c:v></c:pt><c:pt idx="1"><c:v>41</c:v></c:pt><c:pt idx="2"><c:v>72</c:v></c:pt></c:numCache></c:val>
        </c:ser></c:barChart><c:catAx><c:scaling><c:orientation val="minMax"/></c:scaling></c:catAx><c:valAx><c:scaling/></c:valAx></c:plotArea></c:chart>
      </c:chartSpace>`
    )
    const chart = await renderPptxChart(zip, 'ppt/charts/horizontal.xml')
    const svg = Buffer.from(chart!.split(',')[1]!, 'base64').toString('utf8')
    const rows = [...svg.matchAll(/<rect x="154" y="([^\"]+)" width="([^\"]+)"/g)]
      .map((match) => ({ y: Number(match[1]), width: Number(match[2]) }))
      .filter((row) => row.y > 24)

    expect(rows).toHaveLength(3)
    expect(rows[0]!.y).toBeGreaterThan(rows[2]!.y)
    expect(rows[0]!.width).toBeLessThan(1000)
    expect(rows[2]!.width).toBeGreaterThan(rows[0]!.width)
    expect(svg).not.toContain('e+')
  })

  it('uses the cached value format for chart data labels', async () => {
    const zip = new JSZip()
    zip.file(
      'ppt/charts/formats.xml',
      `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart">
        <c:chart><c:plotArea><c:lineChart><c:ser>
          <c:cat><c:strCache><c:pt idx="0"><c:v>Q1</c:v></c:pt></c:strCache></c:cat>
          <c:val><c:numRef><c:numCache><c:formatCode>0.0%</c:formatCode><c:pt idx="0"><c:v>0.905</c:v></c:pt></c:numCache></c:numRef></c:val>
        </c:ser><c:dLbls><c:showVal val="1"/></c:dLbls><c:catAx/><c:valAx><c:scaling><c:min val="0.88"/><c:max val="0.96"/></c:scaling></c:valAx></c:lineChart></c:plotArea></c:chart>
      </c:chartSpace>`
    )

    const chart = await renderPptxChart(zip, 'ppt/charts/formats.xml')
    const svg = Buffer.from(chart!.split(',')[1]!, 'base64').toString('utf8')
    expect(svg).toContain('90.5%')
    expect(svg).not.toContain('0.905</text>')
  })

  it('renders scatter charts from xVal/yVal caches with their marker shapes', async () => {
    const zip = new JSZip()
    zip.file(
      'ppt/charts/scatter.xml',
      `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart">
        <c:chart><c:plotArea><c:scatterChart><c:scatterStyle val="marker"/><c:ser>
          <c:tx><c:v>Delivery</c:v></c:tx>
          <c:spPr><a:solidFill xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:srgbClr val="2869A4"/></a:solidFill></c:spPr>
          <c:marker><c:symbol val="diamond"/><c:size val="12"/></c:marker>
          <c:xVal><c:numRef><c:numCache><c:pt idx="0"><c:v>0.91</c:v></c:pt><c:pt idx="1"><c:v>0.96</c:v></c:pt></c:numCache></c:numRef></c:xVal>
          <c:yVal><c:numRef><c:numCache><c:formatCode>0%</c:formatCode><c:pt idx="0"><c:v>0.87</c:v></c:pt><c:pt idx="1"><c:v>0.94</c:v></c:pt></c:numCache></c:numRef></c:yVal>
        </c:ser><c:dLbls><c:showVal val="1"/></c:dLbls><c:valAx><c:axPos val="l"/><c:scaling><c:min val="0.8"/><c:max val="1"/></c:scaling></c:valAx>
        <c:valAx><c:axPos val="b"/><c:scaling><c:min val="0.8"/><c:max val="1"/></c:scaling></c:valAx></c:scatterChart></c:plotArea></c:chart>
      </c:chartSpace>`
    )

    const chart = await renderPptxChart(zip, 'ppt/charts/scatter.xml')
    const svg = Buffer.from(chart!.split(',')[1]!, 'base64').toString('utf8')
    expect(chart).toMatch(/^data:image\/svg\+xml;base64,/)
    expect(svg).toContain('polygon points=')
    expect(svg).toContain('fill="#2869A4"')
    expect(svg).toContain('87%')
  })

  it('renders radar charts with polygon grids, categories, and series lines', async () => {
    const zip = new JSZip()
    zip.file(
      'ppt/charts/radar.xml',
      `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart">
        <c:chart><c:plotArea><c:radarChart><c:radarStyle val="standard"/><c:ser>
          <c:tx><c:v>2025</c:v></c:tx>
          <c:spPr><a:noFill xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/><a:ln xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:solidFill><a:srgbClr val="147D83"/></a:solidFill></a:ln></c:spPr>
          <c:marker><c:symbol val="circle"/></c:marker>
          <c:cat><c:strRef><c:strCache><c:pt idx="0"><c:v>Quality</c:v></c:pt><c:pt idx="1"><c:v>Safety</c:v></c:pt><c:pt idx="2"><c:v>Supply</c:v></c:pt></c:strCache></c:strRef></c:cat>
          <c:val><c:numRef><c:numCache><c:pt idx="0"><c:v>3</c:v></c:pt><c:pt idx="1"><c:v>4</c:v></c:pt><c:pt idx="2"><c:v>2</c:v></c:pt></c:numCache></c:numRef></c:val>
        </c:ser><c:valAx><c:scaling><c:min val="0"/><c:max val="5"/></c:scaling><c:majorGridlines/></c:valAx></c:radarChart></c:plotArea></c:chart>
      </c:chartSpace>`
    )

    const chart = await renderPptxChart(zip, 'ppt/charts/radar.xml')
    const svg = Buffer.from(chart!.split(',')[1]!, 'base64').toString('utf8')
    expect(chart).toMatch(/^data:image\/svg\+xml;base64,/)
    expect(svg).toContain('Quality')
    expect(svg).toContain('Safety')
    expect(svg).toContain('polygon points=')
    expect(svg).toContain('stroke="#147D83"')
  })

  it('keeps a slide gradient background visible in the editor model', async () => {
    const deck = await parsePptx(await createGradientPresentation())

    expect(deck.slides[0].background).toBeNull()
    expect(deck.slides[0].backgroundCss).toContain('linear-gradient')
    expect(deck.slides[0].backgroundCss).toContain('#112233')
    expect(deck.slides[0].backgroundCss).toContain('#ddeeff')
  })

  it('writes edited text back to the original slide package', async () => {
    const source = await createPresentation()
    const deck = await parsePptx(source)
    deck.slides[0].shapes[0].text = 'Updated title'

    const saved = await savePptx(deck, source)
    const zip = await JSZip.loadAsync(saved)
    const slide = await zip.file('ppt/slides/slide1.xml')?.async('text')

    expect(slide).toContain('<a:t>Updated title</a:t>')
    expect(slide).not.toContain('<a:t>Visible title</a:t>')
  })

  it('writes edited line breaks as separate PowerPoint paragraphs', async () => {
    const source = await createPresentation()
    const deck = await parsePptx(source)
    const shape = deck.slides[0].shapes[0]
    const firstRun = shape.paragraphs[0].runs[0]
    shape.text = 'First line\n第二行\n'
    shape.paragraphs = shape.text.split('\n').map((text) => ({
      text,
      align: shape.textAlign,
      level: 0,
      runs: [{ ...firstRun, text }]
    }))

    const saved = await savePptx(deck, source)
    const zip = await JSZip.loadAsync(saved)
    const slide = await zip.file('ppt/slides/slide1.xml')?.async('text')
    const reparsed = await parsePptx(saved)

    expect(slide?.match(/<a:p\b/g)).toHaveLength(3)
    expect(slide).toContain('<a:t>First line</a:t>')
    expect(slide).toContain('<a:t>第二行</a:t>')
    expect(reparsed.slides[0].shapes[0].text).toBe(shape.text)
  })

  it('persists inserted and deleted shapes', async () => {
    const source = await createPresentation()
    const deck = await parsePptx(source)
    const inserted = structuredClone(deck.slides[0].shapes[0])
    inserted.id = '9001'
    inserted.sourceId = undefined
    inserted.created = true
    inserted.text = 'Inserted text box'
    inserted.paragraphs[0].text = inserted.text
    inserted.paragraphs[0].runs[0].text = inserted.text
    deck.slides[0].shapes[0].deleted = true
    deck.slides[0].shapes.push(inserted)

    const saved = await savePptx(deck, source)
    const zip = await JSZip.loadAsync(saved)
    const slide = await zip.file('ppt/slides/slide1.xml')?.async('text')

    expect(slide).not.toContain('Visible title')
    expect(slide).toContain('<a:t>Inserted text box</a:t>')
    expect(new DOMParser().parseFromString(slide ?? '', 'application/xml').querySelector('parsererror')).toBeNull()
  })

  it('persists shape appearance and layer order', async () => {
    const source = await createPresentation()
    const deck = await parsePptx(source)
    const [text, image] = deck.slides[0].shapes
    text.fill = '#445566'
    text.stroke = '#778899'
    text.strokeWidth = 2
    text.shapeStyleDirty = true
    deck.slides[0].shapes = [image, text]

    const saved = await savePptx(deck, source)
    const zip = await JSZip.loadAsync(saved)
    const slide = await zip.file('ppt/slides/slide1.xml')?.async('text')
    const reparsed = await parsePptx(saved)

    expect(slide?.indexOf('<p:pic')).toBeLessThan(slide?.indexOf('<p:sp>') ?? 0)
    expect(reparsed.slides[0].shapes[1]).toMatchObject({ fill: '#445566', stroke: '#778899' })
  })

  it('persists edits to existing table cells', async () => {
    const source = await createPresentationWithTable()
    const deck = await parsePptx(source)
    const table = deck.slides[0].shapes.find((shape) => shape.kind === 'table')
    expect(table?.table?.rows[0][0].text).toBe('Before')
    table!.table!.rows[0][0].text = 'After'
    table!.tableDirty = true

    const saved = await savePptx(deck, source)
    const reparsed = await parsePptx(saved)
    const reparsedTable = reparsed.slides[0].shapes.find((shape) => shape.kind === 'table')

    expect(reparsedTable?.table?.rows[0][0].text).toBe('After')
  })

  it('serializes borders for newly inserted table cells', async () => {
    const source = await createPresentation()
    const deck = await parsePptx(source)
    const table = createTableShape(deck, 2, 2)
    deck.slides[0]!.shapes.push(table)

    const saved = await savePptx(deck, source)
    const zip = await JSZip.loadAsync(saved)
    const slide = await zip.file('ppt/slides/slide1.xml')?.async('text')
    const reparsed = await parsePptx(saved)
    const reparsedTable = reparsed.slides[0]?.shapes.find((shape) => shape.kind === 'table')

    expect(slide).toContain('<a:lnL')
    expect(slide).toContain('<a:lnT')
    expect(reparsedTable?.table?.rows[0]?.[0]?.borderTopWidth).toBeGreaterThan(0)
    expect(reparsedTable?.table?.rows[0]?.[0]?.borderRightWidth).toBeGreaterThan(0)
  })

  it('stores editor ink as a reusable SVG picture', async () => {
    const source = await createPresentation()
    const deck = await parsePptx(source)
    const ink = structuredClone(deck.slides[0].shapes[1])
    ink.id = 'ink-9002'
    ink.sourceId = undefined
    ink.name = 'Ink 9002'
    ink.created = true
    ink.editorKind = 'ink'
    ink.imageSrc = `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L1 1"/></svg>')}`
    deck.slides[0].shapes.push(ink)

    const saved = await savePptx(deck, source)
    const zip = await JSZip.loadAsync(saved)
    const contentTypes = await zip.file('[Content_Types].xml')?.async('text')
    const reparsed = await parsePptx(saved)

    expect(Object.keys(zip.files).some((path) => path.endsWith('.svg'))).toBe(true)
    expect(contentTypes).toContain('image/svg+xml')
    expect(reparsed.slides[0].shapes.some((shape) => shape.editorKind === 'ink')).toBe(true)
  })

  it('adds a duplicated slide to the presentation package', async () => {
    const source = await createPresentation()
    const deck = await parsePptx(source)
    const copy = structuredClone(deck.slides[0])
    copy.path = 'ppt/slides/editor-slide-2.xml'
    copy.sourcePath = deck.slides[0].path
    copy.created = true
    deck.slides.push(copy)

    const saved = await savePptx(deck, source)
    const zip = await JSZip.loadAsync(saved)
    const presentation = await zip.file('ppt/presentation.xml')?.async('text')
    const relationships = await zip.file('ppt/_rels/presentation.xml.rels')?.async('text')

    expect(zip.file(copy.path)).toBeTruthy()
    expect(presentation).toContain('r:id="rId2"')
    expect(relationships).toContain('Target="slides/editor-slide-2.xml"')
  })

  it('persists slide deletion and ordering across the package', async () => {
    const source = await createThreeSlidePresentation()
    const deck = await parsePptx(source)
    const [first, removed, third] = deck.slides
    deck.slides = [third, first]

    const saved = await savePptx(deck, source)
    const zip = await JSZip.loadAsync(saved)
    const relationships = await zip.file('ppt/_rels/presentation.xml.rels')?.async('text')
    const contentTypes = await zip.file('[Content_Types].xml')?.async('text')
    const reparsed = await parsePptx(saved)

    expect(reparsed.slides.map((slide) => slide.shapes[0].text)).toEqual(['Third slide', 'Visible title'])
    expect(zip.file(removed.path)).toBeNull()
    expect(relationships).not.toContain('slides/slide2.xml')
    expect(contentTypes).not.toContain('/ppt/slides/slide2.xml')
  })

  it('round-trips slide size, visibility, transitions, and shape animation', async () => {
    const source = await createPresentation()
    const deck = await parsePptx(source)
    const slide = deck.slides[0]
    const shape = slide.shapes[0]
    deck.width = 9144000
    deck.height = 6858000
    slide.hidden = true
    slide.hiddenDirty = true
    slide.transition = 'wipe'
    slide.transitionDirty = true
    slide.animationDirty = true
    shape.animation = { effect: 'fade', trigger: 'withPrev', durationMs: 800, delayMs: 200 }

    const saved = await savePptx(deck, source)
    const zip = await JSZip.loadAsync(saved)
    const slideXml = await zip.file('ppt/slides/slide1.xml')?.async('text')
    const presentationXml = await zip.file('ppt/presentation.xml')?.async('text')
    const reparsed = await parsePptx(saved)

    expect(presentationXml).toContain('cx="9144000" cy="6858000"')
    expect(slideXml).toContain('show="0"')
    expect(slideXml).toContain('<p:wipe dir="l"/>')
    expect(slideXml).toContain('<p:timing>')
    expect(slideXml).toContain('<p:spTgt spid="2"/>')
    expect(reparsed.slides[0]).toMatchObject({ hidden: true, transition: 'wipe' })
    expect(reparsed.slides[0].shapes[0].animation).toMatchObject({
      effect: 'fade',
      trigger: 'withPrev',
      durationMs: 800,
      delayMs: 200
    })
  })

  it('keeps connector orientation, elbows, and endpoint direction in the view model', () => {
    const base = {
      id: 'connector',
      geometryAdjust: { adj1: 0, adj2: 50000 },
      kind: 'line',
      width: 100,
      height: 100,
      geometry: 'bentConnector4'
    } as PptxShape
    expect(pptxConnectorPath(base)).toBe('M 0 0 L 0 0 L 0 50 L 100 50 L 100 100')
    expect(pptxConnectorPath({ ...base, geometry: 'straightConnector1', width: 0, height: 100 })).toBe('M 0 0 L 0 100')
    expect(pptxConnectorPath({ ...base, geometry: 'straightConnector1', width: 100, height: 0 })).toBe('M 0 0 L 100 0')
  })

  it('uses the real shape box when calculating wide arrow and chevron geometry', () => {
    const chevron = pptxPolygonPoints('chevron', undefined, 2876550, 1028700)
    expect(chevron).toBe('0,0 82.12,0 100,50 82.12,100 0,100 17.88,50')

    const rightArrow = pptxPolygonPoints('rightArrow', undefined, 2876550, 1028700)
    expect(rightArrow).toContain('100,50')
    expect(rightArrow).not.toContain('99,50')
  })

  it('keeps picture alpha and GDI hatch fills when parsing the slide', async () => {
    const zip = await JSZip.loadAsync(await createPresentation())
    const slidePath = 'ppt/slides/slide1.xml'
    const slide = await zip.file(slidePath)!.async('text')
    const updated = slide
      .replace(
        '<a:noFill/>',
        '<a:pattFill prst="ltDnDiag"><a:fgClr><a:srgbClr val="112233"/></a:fgClr><a:bgClr><a:srgbClr val="ddeeff"/></a:bgClr></a:pattFill>'
      )
      .replace('<a:blip r:embed="rImg"/>', '<a:blip r:embed="rImg"><a:alphaModFix amt="50000"/></a:blip>')
    zip.file(slidePath, updated)

    const deck = await parsePptx(await zip.generateAsync({ type: 'arraybuffer' }))
    expect(deck.slides[0].shapes[0]?.fillCss).toMatch(/^url\("data:image\/svg\+xml,/)
    expect(deck.slides[0].shapes[1]?.opacity).toBe(0.5)
  })
})

async function createPresentation() {
  const zip = new JSZip()
  zip.file(
    'ppt/presentation.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
      <p:presentation xmlns:p="p" xmlns:r="r">
        <p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst>
        <p:sldSz cx="12192000" cy="6858000"/>
      </p:presentation>`
  )
  zip.file(
    'ppt/_rels/presentation.xml.rels',
    `<Relationships><Relationship Id="rId1" Target="slides/slide1.xml"/></Relationships>`
  )
  zip.file(
    'ppt/slides/slide1.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
      <p:sld xmlns:p="p" xmlns:a="a" xmlns:r="r">
        <p:cSld><p:spTree>
          <p:sp>
            <p:nvSpPr><p:cNvPr id="2" name="Title"/></p:nvSpPr>
            <p:spPr><a:xfrm><a:off x="1000000" y="800000"/><a:ext cx="8000000" cy="1000000"/></a:xfrm><a:noFill/></p:spPr>
            <p:txBody><a:bodyPr/><a:p><a:pPr algn="ctr"/><a:r><a:rPr sz="3200" b="1"><a:solidFill><a:srgbClr val="112233"/></a:solidFill><a:latin typeface="Aptos Display"/></a:rPr><a:t>Visible title</a:t></a:r></a:p></p:txBody>
          </p:sp>
          <p:pic>
            <p:nvPicPr><p:cNvPr id="3" name="Photo"/></p:nvPicPr>
            <p:blipFill><a:blip r:embed="rImg"/></p:blipFill>
            <p:spPr><a:xfrm><a:off x="2000000" y="2500000"/><a:ext cx="2000000" cy="1500000"/></a:xfrm></p:spPr>
          </p:pic>
        </p:spTree></p:cSld>
      </p:sld>`
  )
  zip.file(
    'ppt/slides/_rels/slide1.xml.rels',
    `<Relationships><Relationship Id="rImg" Target="../media/image1.png"/></Relationships>`
  )
  zip.file('ppt/media/image1.png', Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]))
  zip.file(
    '[Content_Types].xml',
    '<Types><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>'
  )
  return zip.generateAsync({ type: 'arraybuffer' })
}

async function createGradientPresentation() {
  const zip = await JSZip.loadAsync(await createPresentation())
  const slide = await zip.file('ppt/slides/slide1.xml')!.async('text')
  zip.file(
    'ppt/slides/slide1.xml',
    slide.replace(
      '<p:cSld><p:spTree>',
      '<p:cSld><p:bg><p:bgPr><a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="112233"/></a:gs><a:gs pos="100000"><a:srgbClr val="ddeeff"/></a:gs></a:gsLst><a:lin ang="0"/></a:gradFill></p:bgPr></p:bg><p:spTree>'
    )
  )
  return zip.generateAsync({ type: 'arraybuffer' })
}

async function createThreeSlidePresentation() {
  const zip = await JSZip.loadAsync(await createPresentation())
  const firstSlide = await zip.file('ppt/slides/slide1.xml')!.async('text')
  zip.file(
    'ppt/presentation.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
      <p:presentation xmlns:p="p" xmlns:r="r">
        <p:sldIdLst>
          <p:sldId id="256" r:id="rId1"/>
          <p:sldId id="257" r:id="rId2"/>
          <p:sldId id="258" r:id="rId3"/>
        </p:sldIdLst>
        <p:sldSz cx="12192000" cy="6858000"/>
      </p:presentation>`
  )
  zip.file(
    'ppt/_rels/presentation.xml.rels',
    '<Relationships><Relationship Id="rId1" Target="slides/slide1.xml"/><Relationship Id="rId2" Target="slides/slide2.xml"/><Relationship Id="rId3" Target="slides/slide3.xml"/></Relationships>'
  )
  zip.file('ppt/slides/slide2.xml', firstSlide.replace('Visible title', 'Second slide'))
  zip.file('ppt/slides/slide3.xml', firstSlide.replace('Visible title', 'Third slide'))
  zip.file(
    '[Content_Types].xml',
    '<Types><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slides/slide3.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>'
  )
  return zip.generateAsync({ type: 'arraybuffer' })
}

async function createPresentationWithTable() {
  const zip = await JSZip.loadAsync(await createPresentation())
  const slide = await zip.file('ppt/slides/slide1.xml')!.async('text')
  const table = `<p:graphicFrame>
    <p:nvGraphicFramePr><p:cNvPr id="4" name="Table"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>
    <p:xfrm><a:off x="1000000" y="4500000"/><a:ext cx="4000000" cy="1000000"/></p:xfrm>
    <a:graphic><a:graphicData><a:tbl><a:tblPr/><a:tblGrid><a:gridCol w="4000000"/></a:tblGrid>
      <a:tr h="1000000"><a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Before</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc></a:tr>
    </a:tbl></a:graphicData></a:graphic>
  </p:graphicFrame>`
  zip.file('ppt/slides/slide1.xml', slide.replace('</p:spTree>', `${table}</p:spTree>`))
  return zip.generateAsync({ type: 'arraybuffer' })
}
