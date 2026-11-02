import { readFile } from 'node:fs/promises'
import { dirname, join, sep } from 'node:path'
import { createRequire } from 'node:module'
import { Document } from '@langchain/core/documents'

/** CID PDFs may omit embedded Unicode maps. Use PDF.js's packaged CMaps before treating them as scans. */
export async function readPdfTextPages(filePath: string): Promise<Document[]> {
    // Keep asset resolution in Node; bundlers replace require.resolve with numeric module IDs.
    const nodeRequire = createRequire(__filename)
    const resources = dirname(nodeRequire.resolve('pdfjs-dist/package.json'))
    const pdfjs = nodeRequire('pdfjs-dist') as Pick<typeof import('pdfjs-dist'), 'getDocument'>
    const document = await pdfjs.getDocument({
        data: new Uint8Array(await readFile(filePath)),
        cMapUrl: join(resources, 'cmaps') + sep,
        cMapPacked: true,
        standardFontDataUrl: join(resources, 'standard_fonts') + sep
    }).promise
    try {
        const pages: Document[] = []
        for (let number = 1; number <= document.numPages; number++) {
            const page = await document.getPage(number)
            const content = await page.getTextContent()
            pages.push(new Document({
                pageContent: content.items.map((item) => 'str' in item ? item.str : '').join(' ').trim(),
                metadata: { loc: { pageNumber: number } }
            }))
        }
        return pages
    } finally {
        await document.destroy()
    }
}
