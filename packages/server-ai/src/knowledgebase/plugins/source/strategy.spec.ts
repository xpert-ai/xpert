import { Document } from '@langchain/core/documents'
import { resolveWorkflowSourceDocumentSourceKey } from './strategy'

describe('WorkflowSourceNodeStrategy source identity', () => {
    it('derives a source key from external source token metadata', () => {
        const document = new Document({
            id: 'docx-token',
            pageContent: 'Lark Document docx-token',
            metadata: {
                token: 'docx-token',
                type: 'docx',
                title: 'Lark Document docx-token'
            }
        })

        expect(
            resolveWorkflowSourceDocumentSourceKey({
                document,
                sourceType: 'lark',
                sourceConfigKey: 'Source_1'
            })
        ).toBe('lark:Source_1:docx-token')
    })

    it('does not derive a source key from display-only source metadata', () => {
        const document = new Document({
            pageContent: 'Policy',
            metadata: {
                title: 'Policy',
                originalName: 'Policy.docx'
            }
        })

        expect(
            resolveWorkflowSourceDocumentSourceKey({
                document,
                sourceType: 'lark',
                sourceConfigKey: 'Source_1'
            })
        ).toBeNull()
    })
})
