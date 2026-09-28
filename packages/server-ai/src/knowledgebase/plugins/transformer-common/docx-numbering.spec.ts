import fsPromises from 'fs/promises'
import os from 'os'
import path from 'path'
import JSZip from 'jszip'
import { loadDocxStructuredMarkdown } from './docx-outline'

describe('DOCX numbering in structured markdown', () => {
    it('keeps decimal numbering defined on a paragraph style and preserves tables', async () => {
        const filePath = await writeNumberedDocx({
            stylesXml: stylesXml(`
                <w:style w:type="paragraph" w:styleId="ListNumber">
                  <w:name w:val="List Number"/>
                  <w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr>
                </w:style>`),
            numberingXml: numberingXml(`
                <w:abstractNum w:abstractNumId="1">
                  <w:lvl w:ilvl="0">
                    <w:start w:val="1"/>
                    <w:numFmt w:val="decimal"/>
                    <w:lvlText w:val="%1."/>
                  </w:lvl>
                </w:abstractNum>
                <w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>`),
            bodyXml: `
                <w:tbl>
                  <w:tr>
                    <w:tc><w:p><w:r><w:t>项目</w:t></w:r></w:p></w:tc>
                    <w:tc><w:p><w:r><w:t>说明</w:t></w:r></w:p></w:tc>
                  </w:tr>
                  <w:tr>
                    <w:tc><w:p><w:r><w:t>入库</w:t></w:r></w:p></w:tc>
                    <w:tc><w:p><w:r><w:t>保留表格</w:t></w:r></w:p></w:tc>
                  </w:tr>
                </w:tbl>
                <w:p><w:r><w:t>操作步骤如下。</w:t></w:r></w:p>
                ${['打开知识库', '上传文档', '选择解析器', '确认切片', '开始入库']
                    .map((step) => styledParagraph('ListNumber', step))
                    .join('')}`
        })

        const markdown = await convert(filePath)

        expect(markdown).toBe(
            [
                '| 项目 | 说明 |',
                '| --- | --- |',
                '| 入库 | 保留表格 |',
                '',
                '操作步骤如下。',
                '',
                '1. 打开知识库',
                '2. 上传文档',
                '3. 选择解析器',
                '4. 确认切片',
                '5. 开始入库'
            ].join('\n')
        )
    })

    it('keeps paragraph numPr numbering when the document has no other structure', async () => {
        const filePath = await writeNumberedDocx({
            numberingXml: numberingXml(`
                <w:abstractNum w:abstractNumId="1">
                  <w:lvl w:ilvl="0">
                    <w:start w:val="1"/>
                    <w:numFmt w:val="decimal"/>
                    <w:lvlText w:val="%1."/>
                  </w:lvl>
                </w:abstractNum>
                <w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>`),
            bodyXml: ['打开知识库', '上传文档', '选择解析器', '确认切片', '开始入库']
                .map((step) => numberedParagraph('1', '0', step))
                .join('')
        })

        const result = await loadDocxStructuredMarkdown(filePath)

        expect(result?.documents[0]?.metadata).toEqual(
            expect.objectContaining({ parser: 'docx-ooxml', contentFormat: 'markdown' })
        )
        expect(result?.documents[0]?.pageContent).toBe(
            ['1. 打开知识库', '2. 上传文档', '3. 选择解析器', '4. 确认切片', '5. 开始入库'].join('\n')
        )
    })

    it('renders multi-level heading numbers, nested lists, continuation, and restart', async () => {
        const filePath = await writeNumberedDocx({
            stylesXml: stylesXml(`
                <w:style w:type="paragraph" w:styleId="Heading1">
                  <w:name w:val="heading 1"/>
                  <w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="3"/></w:numPr></w:pPr>
                </w:style>
                <w:style w:type="paragraph" w:styleId="Heading2">
                  <w:name w:val="heading 2"/>
                  <w:basedOn w:val="Heading1"/>
                  <w:pPr><w:numPr><w:ilvl w:val="1"/></w:numPr></w:pPr>
                </w:style>
                <w:style w:type="paragraph" w:styleId="ListNumber">
                  <w:name w:val="List Number"/>
                  <w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr>
                </w:style>`),
            numberingXml: numberingXml(`
                <w:abstractNum w:abstractNumId="1">
                  <w:lvl w:ilvl="0">
                    <w:start w:val="1"/>
                    <w:numFmt w:val="decimal"/>
                    <w:lvlText w:val="%1."/>
                  </w:lvl>
                  <w:lvl w:ilvl="1">
                    <w:start w:val="1"/>
                    <w:numFmt w:val="lowerLetter"/>
                    <w:lvlText w:val="%2."/>
                  </w:lvl>
                </w:abstractNum>
                <w:abstractNum w:abstractNumId="2">
                  <w:lvl w:ilvl="0">
                    <w:start w:val="1"/>
                    <w:numFmt w:val="decimal"/>
                    <w:lvlText w:val="%1"/>
                    <w:pStyle w:val="Heading1"/>
                  </w:lvl>
                  <w:lvl w:ilvl="1">
                    <w:start w:val="1"/>
                    <w:numFmt w:val="decimal"/>
                    <w:lvlText w:val="%1.%2"/>
                    <w:pStyle w:val="Heading2"/>
                  </w:lvl>
                </w:abstractNum>
                <w:abstractNum w:abstractNumId="4">
                  <w:lvl w:ilvl="0">
                    <w:start w:val="1"/>
                    <w:numFmt w:val="bullet"/>
                    <w:lvlText w:val="•"/>
                    <w:pStyle w:val="ListBullet"/>
                  </w:lvl>
                </w:abstractNum>
                <w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>
                <w:num w:numId="2">
                  <w:abstractNumId w:val="1"/>
                  <w:lvlOverride w:ilvl="0"><w:startOverride w:val="4"/></w:lvlOverride>
                </w:num>
                <w:num w:numId="3"><w:abstractNumId w:val="2"/></w:num>
                <w:num w:numId="4"><w:abstractNumId w:val="4"/></w:num>
                <w:num w:numId="5"><w:abstractNumId w:val="1"/></w:num>`),
            bodyXml: `
                ${styledParagraph('Heading1', '简介')}
                ${styledParagraph('Heading2', '范围')}
                ${styledParagraph('Heading2', '细节')}
                ${styledParagraph('Heading1', '下一步')}
                ${numberedParagraph('1', '0', '父步骤')}
                ${numberedParagraph('1', '1', '子步骤')}
                ${numberedParagraph('1', '1', '另一子步骤')}
                ${numberedParagraph('1', '0', '回到上级')}
                ${numberedParagraph('1', '1', '重新开始')}
                <w:p><w:r><w:t>普通段落</w:t></w:r></w:p>
                ${numberedParagraph('1', '0', '继续编号')}
                ${numberedParagraph('2', '0', '从四开始')}
                ${numberedParagraph('2', '0', '下一')}
                <w:p>
                  <w:pPr>
                    <w:pStyle w:val="ListNumber"/>
                    <w:numPr><w:numId w:val="0"/></w:numPr>
                  </w:pPr>
                  <w:r><w:t>不要编号</w:t></w:r>
                </w:p>
                <w:p><w:r><w:t>1. 手打编号</w:t></w:r></w:p>
                ${styledParagraph('ListBullet', '项目符号')}
                <w:tbl>
                  <w:tr><w:tc><w:p><w:r><w:t>单元格</w:t></w:r></w:p></w:tc></w:tr>
                  <w:tr>
                    <w:tc>
                      ${numberedParagraph('5', '0', '单元格一')}
                      ${numberedParagraph('5', '0', '单元格二')}
                    </w:tc>
                  </w:tr>
                </w:tbl>`
        })

        const markdown = await convert(filePath)

        expect(markdown).toBe(
            [
                '# 1 简介',
                '',
                '## 1.1 范围',
                '',
                '## 1.2 细节',
                '',
                '# 2 下一步',
                '',
                '1. 父步骤',
                '  a. 子步骤',
                '  b. 另一子步骤',
                '2. 回到上级',
                '  a. 重新开始',
                '',
                '普通段落',
                '',
                '3. 继续编号',
                '',
                '4. 从四开始',
                '5. 下一',
                '',
                '不要编号',
                '',
                '1. 手打编号',
                '',
                '- 项目符号',
                '',
                '| 单元格 |',
                '| --- |',
                '| 1. 单元格一<br>2. 单元格二 |'
            ].join('\n')
        )
    })
})

async function convert(filePath: string): Promise<string> {
    const result = await loadDocxStructuredMarkdown(filePath)
    return result?.documents[0]?.pageContent ?? ''
}

function styledParagraph(styleId: string, text: string): string {
    return `<w:p><w:pPr><w:pStyle w:val="${styleId}"/></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`
}

function numberedParagraph(numId: string, ilvl: string, text: string): string {
    return `<w:p><w:pPr><w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`
}

function stylesXml(styles: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  ${styles}
</w:styles>`
}

function numberingXml(numbering: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  ${numbering}
</w:numbering>`
}

async function writeNumberedDocx(input: {
    bodyXml: string
    stylesXml?: string
    numberingXml?: string
}): Promise<string> {
    const directory = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'xpert-docx-numbering-'))
    const filePath = path.join(directory, 'numbering.docx')
    const zip = new JSZip()
    zip.file(
        '[Content_Types].xml',
        `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
    )
    zip.folder('_rels')?.file(
        '.rels',
        `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
    )
    const word = zip.folder('word')
    word?.file(
        'document.xml',
        `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${input.bodyXml}</w:body>
</w:document>`
    )
    if (input.stylesXml) {
        word?.file('styles.xml', input.stylesXml)
    }
    if (input.numberingXml) {
        word?.file('numbering.xml', input.numberingXml)
    }
    await fsPromises.writeFile(filePath, await zip.generateAsync({ type: 'nodebuffer' }))
    return filePath
}
