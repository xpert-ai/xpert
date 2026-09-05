import { createPageImagePreviewFile } from './page-image-artifact'

describe('page image workspace path contract', () => {
    it('exposes only the workspace-relative path', () => {
        expect(
            createPageImagePreviewFile({ workspacePath: 'files/asset/pages/page-0001.png', fileName: 'page-0001.png' })
        ).toEqual({ workspacePath: 'files/asset/pages/page-0001.png', fileName: 'page-0001.png' })
    })
    it.each([
        '/workspace/page.png',
        '/host/page.png',
        'C:/page.png',
        'C:\\page.png',
        '\\\\host\\page.png',
        '../page.png',
        'files/../page.png',
        './page.png',
        'files//page.png',
        '',
        123
    ])('rejects noncanonical workspace paths: %s', (workspacePath) => {
        expect(() => createPageImagePreviewFile({ workspacePath })).toThrow('workspace-relative')
    })
    it('supports an image URL without a workspace file', () => {
        expect(createPageImagePreviewFile({ url: 'https://example.test/page.png' })).toMatchObject({
            url: 'https://example.test/page.png'
        })
    })
})
