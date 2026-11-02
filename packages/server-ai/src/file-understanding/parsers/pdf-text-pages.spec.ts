import { join } from 'node:path'
import { readPdfTextPages } from './pdf-text-pages'

it('extracts Chinese CID text and exact page anchors from a real PDF without embedded Unicode maps', async () => {
    const pages = await readPdfTextPages(join(__dirname, 'fixtures/cid-font.pdf'))
    expect(pages).toHaveLength(1)
    expect(pages[0].metadata.loc.pageNumber).toBe(1)
    expect(pages[0].pageContent).toContain('故障 30 分钟响应')
    expect(pages[0].pageContent).toContain('技术方案 40 分')
})
