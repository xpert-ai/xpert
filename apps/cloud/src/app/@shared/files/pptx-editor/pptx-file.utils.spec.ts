import JSZip from 'jszip'
import { parsePptx, savePptx } from './pptx-file.utils'

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
