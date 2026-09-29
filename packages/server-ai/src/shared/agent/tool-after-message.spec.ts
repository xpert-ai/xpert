import { toolAfterHumanMessage } from './tool-after-message'
import i18next from 'i18next'

describe('post-tool inline attachments', () => {
    beforeAll(async () => {
        await i18next.init({ lng: 'en', resources: {} })
    })
    it.each([
        'https://internal/report',
        'file:///etc/passwd',
        'data:image/jpeg;base64,cGRm',
        'data:application/pdf;base64,not-base64'
    ])('rejects unsupported or mismatched attachment input %s', (fileUrl) => {
        expect(() =>
            toolAfterHumanMessage({ toolCallId: 'call', files: [{ mimeType: 'application/pdf', fileUrl }] }, 'call')
        ).toThrow()
    })
    it('preserves attachment-only replies', () => {
        expect(
            toolAfterHumanMessage(
                { toolCallId: 'call', files: [{ mimeType: 'image/png', fileUrl: 'data:image/png;base64,aW1hZ2U=' }] },
                'call'
            )?.content
        ).toEqual([{ type: 'image_url', image_url: { url: 'data:image/png;base64,aW1hZ2U=' } }])
    })
    it('enforces the aggregate binary limit', () => {
        const data = Buffer.alloc(13 * 1024 * 1024).toString('base64')
        const file = { mimeType: 'application/pdf', fileUrl: `data:application/pdf;base64,${data}` }
        expect(() => toolAfterHumanMessage({ toolCallId: 'call', files: [file, file] }, 'call')).toThrow('size limit')
    })
})
