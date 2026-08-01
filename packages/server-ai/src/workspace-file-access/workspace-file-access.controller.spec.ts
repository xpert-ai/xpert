import { validateHeaderValue } from 'node:http'
import { buildWorkspaceFileContentDisposition } from './workspace-file-access.controller'

describe('buildWorkspaceFileContentDisposition', () => {
    it('keeps the response header ASCII-safe while preserving a Chinese filename', () => {
        const disposition = buildWorkspaceFileContentDisposition('preview', '物料标准化验收.jpg')

        expect(disposition).toBe(
            `inline; filename="_______.jpg"; filename*=UTF-8''%E7%89%A9%E6%96%99%E6%A0%87%E5%87%86%E5%8C%96%E9%AA%8C%E6%94%B6.jpg`
        )
        expect(() => validateHeaderValue('Content-Disposition', disposition)).not.toThrow()
    })

    it('escapes quoted fallback characters and RFC 5987 reserved characters', () => {
        expect(buildWorkspaceFileContentDisposition('download', `a'b(1)"\\.pdf`)).toBe(
            `attachment; filename="a'b(1)__.pdf"; filename*=UTF-8''a%27b%281%29%22%5C.pdf`
        )
    })
})
