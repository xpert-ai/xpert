import fsPromises from 'fs/promises'
import os from 'os'
import path from 'path'
import JSZip from 'jszip'
import { init } from 'i18next'
import { DefaultTransformerStrategy } from './transformer.strategy'
import { AutoTextSplitterStrategy } from '../textsplitter-common/auto.strategy'
import { StructureAwareStrategy } from '../textsplitter-common/structure-aware.strategy'
import { RecursiveCharacterStrategy } from '../textsplitter-common/recursive-character.strategy'
import { MarkdownRecursiveStrategy } from '../textsplitter-common/markdown-recursive.strategy'

const recursive = new RecursiveCharacterStrategy()
const auto = new AutoTextSplitterStrategy(
    new StructureAwareStrategy(recursive),
    new MarkdownRecursiveStrategy(),
    recursive
)

beforeAll(async () => {
    await init({ lng: 'en', resources: {} })
})

describe('processPPT table structure', () => {
    const transformer = new DefaultTransformerStrategy()

    it('keeps a graphicFrame table as markdown and preserves presentation slide order', async () => {
        const filePath = await writeDeckFixture()

        const documents = await transformer.processPPT(filePath)
        const markdown = documents[0]?.pageContent ?? ''

        expect(documents).toHaveLength(1)
        expect(documents[0]?.metadata.contentFormat).toBe('markdown')
        expect(markdown).toContain('开场说明')
        expect(markdown).toContain('| 设备名 | 归还前 | 归还后 |')
        expect(markdown).toContain('| --- | --- | --- |')
        expect(markdown).toContain('| 投影仪 | 完好 | 缺遥控器 |')
        expect(markdown).toContain('| 笔记本 | 在库 | 已借出 |')
        expect(markdown).toContain('备注不要丢')
        expect(markdown).toContain('结束说明')
        expect(markdown.indexOf('开场说明')).toBeLessThan(markdown.indexOf('| 投影仪 | 完好 | 缺遥控器 |'))
        expect(markdown.indexOf('| 投影仪 | 完好 | 缺遥控器 |')).toBeLessThan(markdown.indexOf('备注不要丢'))
        expect(markdown.indexOf('备注不要丢')).toBeLessThan(markdown.indexOf('结束说明'))
        expect(markdown).not.toBe(
            [
                '开场说明',
                '设备名',
                '归还前',
                '归还后',
                '投影仪',
                '完好',
                '缺遥控器',
                '笔记本',
                '在库',
                '已借出',
                '备注不要丢',
                '结束说明'
            ].join('\n')
        )

        const split = await auto.splitDocuments(documents, { chunkSize: 80, chunkOverlap: 0 })
        expect(split.decisions[0]?.resolvedStrategy).toBe('structure-aware')
        const tableChunks = split.chunks.filter((chunk) => chunk.pageContent.includes('投影仪'))
        expect(tableChunks.length).toBeGreaterThan(0)
        expect(tableChunks.every((chunk) => chunk.pageContent.includes('| 投影仪 | 完好 | 缺遥控器 |'))).toBe(true)
    })

    it('emits one copy of a merged cell and escapes pipes inside cells', async () => {
        const filePath = await writeMergedTableFixture()

        const documents = await transformer.processPPT(filePath)
        const markdown = documents[0]?.pageContent ?? ''

        expect(documents[0]?.metadata.contentFormat).toBe('markdown')
        expect(markdown).toContain('合并说明')
        expect(markdown.indexOf('合并说明')).toBeLessThan(markdown.indexOf('| 合并标题 |  | 右 |'))
        expect(markdown).toContain('| 合并标题 |  | 右 |')
        expect(markdown).toContain('| 左\\|右 |  | 下 |')
        expect(markdown.match(/合并标题/g)).toEqual(['合并标题'])
        const split = await auto.splitDocuments(documents, { chunkSize: 1000, chunkOverlap: 0 })
        expect(split.decisions[0]?.resolvedStrategy).toBe('structure-aware')
    })

    it('leaves a text-only deck on the plain-text loader', async () => {
        const filePath = await writeTextOnlyFixture()

        const documents = await transformer.processPPT(filePath)

        expect(documents[0]?.pageContent).toBe('只有正文')
        expect(documents[0]?.metadata.contentFormat).toBeUndefined()
        const split = await auto.splitDocuments(documents, { chunkSize: 1000, chunkOverlap: 0 })
        expect(split.decisions[0]?.resolvedStrategy).toBe('recursive-character')
    })
})

async function writeDeckFixture() {
    const zip = new JSZip()
    addPresentation(zip, [
        ['rId2', 'slides/slide2.xml'],
        ['rId3', 'slides/slide1.xml']
    ])
    zip.file(
        'ppt/slides/slide2.xml',
        slideXml(
            `${textShape('开场说明')}${tableShape([
                ['设备名', '归还前', '归还后'],
                ['投影仪', '完好', '缺遥控器'],
                ['笔记本', '在库', '已借出']
            ])}`
        )
    )
    zip.file('ppt/slides/_rels/slide2.xml.rels', notesRel('notesSlide2.xml'))
    zip.file('ppt/notesSlides/notesSlide2.xml', notesXml('备注不要丢'))
    zip.file(
        'ppt/slides/slide1.xml',
        slideXml(
            `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="4" name="Group"/></p:nvGrpSpPr><p:grpSpPr/>${textShape('结束说明', 5)}</p:grpSp>`
        )
    )
    return writeZip(zip, 'deck.pptx')
}

async function writeMergedTableFixture() {
    const zip = new JSZip()
    addPresentation(zip, [['rId2', 'slides/slide1.xml']])
    const table = `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="3" name="Table"/></p:nvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblGrid><a:gridCol w="100"/><a:gridCol w="100"/><a:gridCol w="100"/></a:tblGrid><a:tr><a:tc gridSpan="2"><a:txBody><a:bodyPr/><a:p><a:r><a:t>合并标题</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:t>右</a:t></a:r></a:p></a:txBody></a:tc></a:tr><a:tr><a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:t>左|右</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:vMerge/></a:tc><a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:t>下</a:t></a:r></a:p></a:txBody></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>`
    zip.file('ppt/slides/slide1.xml', slideXml(`${textShape('合并说明')}${table}`))
    return writeZip(zip, 'merged.pptx')
}

async function writeTextOnlyFixture() {
    const zip = new JSZip()
    addPresentation(zip, [['rId2', 'slides/slide1.xml']])
    zip.file('ppt/slides/slide1.xml', slideXml(textShape('只有正文')))
    return writeZip(zip, 'text.pptx')
}

function addPresentation(zip: JSZip, slides: Array<[string, string]>) {
    const slideIds = slides.map(([id], index) => `<p:sldId id="${256 + index}" r:id="${id}"/>`).join('')
    zip.file(
        'ppt/presentation.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst>${slideIds}</p:sldIdLst></p:presentation>`
    )
    const relationships = slides
        .map(
            ([id, target]) =>
                `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="${target}"/>`
        )
        .join('')
    zip.file(
        'ppt/_rels/presentation.xml.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}</Relationships>`
    )
}

function slideXml(shapes: string) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/></p:nvGrpSpPr><p:grpSpPr/>${shapes}</p:spTree></p:cSld></p:sld>`
}

function textShape(text: string, id = 2) {
    return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="TextBox ${id}"/></p:nvSpPr><p:txBody><a:bodyPr/><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`
}

function tableShape(rows: string[][]) {
    const body = rows
        .map(
            (row) =>
                `<a:tr>${row
                    .map(
                        (cell) =>
                            `<a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:t>${cell}</a:t></a:r></a:p></a:txBody></a:tc>`
                    )
                    .join('')}</a:tr>`
        )
        .join('')
    return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="3" name="Table"/></p:nvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblGrid><a:gridCol w="100"/><a:gridCol w="100"/><a:gridCol w="100"/></a:tblGrid>${body}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`
}

function notesRel(fileName: string) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/${fileName}"/></Relationships>`
}

function notesXml(text: string) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/></p:nvGrpSpPr>${textShape(text)}</p:spTree></p:cSld></p:notes>`
}

async function writeZip(zip: JSZip, fileName: string) {
    const directory = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'xpert-pptx-'))
    const filePath = path.join(directory, fileName)
    const content = await zip.generateAsync({ type: 'nodebuffer' })
    await fsPromises.writeFile(filePath, content)
    return filePath
}
