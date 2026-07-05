import fsPromises from 'fs/promises'
import os from 'os'
import path from 'path'
import JSZip from 'jszip'
import { loadDocxStructuredMarkdown } from './docx-outline'

describe('loadDocxStructuredMarkdown', () => {
    it('preserves docx table of contents entries and heading structure', async () => {
        const filePath = await writeDocxFixture()

        const result = await loadDocxStructuredMarkdown(filePath)
        const markdown = result?.documents[0]?.pageContent ?? ''

        expect(markdown).toContain('- 1.4 扫码枪无法工作 ...... 6')
        expect(markdown).toContain('## 1.4 扫码枪无法工作')
        expect(markdown).not.toMatch(/^6$/m)
    })

    it('extracts embedded images as ordered assets and keeps image references in document order', async () => {
        const filePath = await writeDocxWithImageFixture()
        const writeImage = jest.fn(async () => ({
            filePath: 'images/manual-image-0001.png',
            url: 'https://files.local/images/manual-image-0001.png'
        }))

        const result = await loadDocxStructuredMarkdown(filePath, { writeImage })
        const markdown = result?.documents[0]?.pageContent ?? ''

        expect(writeImage).toHaveBeenCalledWith(
            expect.objectContaining({
                extension: 'png',
                relationshipId: 'rId5',
                order: 0,
                altText: '操作示意图'
            })
        )
        expect(result?.assets).toEqual([
            expect.objectContaining({
                type: 'image',
                sourceType: 'docx_embedded_image',
                filePath: 'images/manual-image-0001.png',
                url: 'https://files.local/images/manual-image-0001.png',
                order: 0,
                altText: '操作示意图'
            })
        ])
        expect(markdown).toContain('图片前文字')
        expect(markdown).toContain('![操作示意图](https://files.local/images/manual-image-0001.png)')
        expect(markdown.indexOf('图片前文字')).toBeLessThan(
            markdown.indexOf('![操作示意图](https://files.local/images/manual-image-0001.png)')
        )
    })
})

async function writeDocxFixture() {
    const directory = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'xpert-docx-outline-'))
    const filePath = path.join(directory, 'outline.docx')
    const zip = new JSZip()

    zip.file(
        '[Content_Types].xml',
        `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`
    )
    zip.folder('_rels')?.file(
        '.rels',
        `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
    )
    zip.folder('word')?.file(
        'styles.xml',
        `<?xml version="1.0" encoding="UTF-8"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
  </w:style>
  <w:style w:type="paragraph" w:styleId="TOC2">
    <w:name w:val="toc 2"/>
  </w:style>
</w:styles>`
    )
    zip.folder('word')?.file(
        'document.xml',
        `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:t>目录</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:pStyle w:val="TOC2"/></w:pPr>
      <w:hyperlink w:anchor="_Toc1001">
        <w:r><w:t>1.4 扫码枪无法工作</w:t></w:r>
        <w:r><w:tab/></w:r>
        <w:r><w:t>6</w:t></w:r>
      </w:hyperlink>
    </w:p>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading2"/></w:pPr>
      <w:r><w:t>1.4 扫码枪无法工作</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>当扫码枪出现缺电、损坏等异常情况时，可以采用键盘操作替代扫码。</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`
    )

    await fsPromises.writeFile(filePath, await zip.generateAsync({ type: 'nodebuffer' }))
    return filePath
}

async function writeDocxWithImageFixture() {
    const directory = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'xpert-docx-image-'))
    const filePath = path.join(directory, 'image.docx')
    const zip = new JSZip()

    zip.file(
        '[Content_Types].xml',
        `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
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
    zip.folder('word')
        ?.folder('_rels')
        ?.file(
            'document.xml.rels',
            `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
</Relationships>`
        )
    zip.folder('word')?.folder('media')?.file('image1.png', Buffer.from('fake-png'))
    zip.folder('word')?.file(
        'document.xml',
        `<?xml version="1.0" encoding="UTF-8"?>
<w:document
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    <w:p><w:r><w:t>图片前文字</w:t></w:r></w:p>
    <w:p>
      <w:r>
        <w:drawing>
          <wp:inline>
            <wp:docPr id="1" name="Picture 1" descr="操作示意图"/>
            <a:graphic>
              <a:graphicData>
                <pic:pic>
                  <pic:blipFill>
                    <a:blip r:embed="rId5"/>
                  </pic:blipFill>
                </pic:pic>
              </a:graphicData>
            </a:graphic>
          </wp:inline>
        </w:drawing>
      </w:r>
    </w:p>
    <w:p><w:r><w:t>图片后文字</w:t></w:r></w:p>
  </w:body>
</w:document>`
    )

    await fsPromises.writeFile(filePath, await zip.generateAsync({ type: 'nodebuffer' }))
    return filePath
}
