import { buildReferencedPrompt, hydrateSendRequestHumanInput, normalizeReferences } from './human-input'

describe('human-input references', () => {
    it('normalizes element references and formats them as referenced content', () => {
        const references = normalizeReferences([
            {
                type: 'element',
                serviceId: 'service-1',
                pageUrl: 'http://localhost:4173/',
                pageTitle: 'Preview Page',
                selector: '#hero-cta',
                tagName: 'button',
                role: 'button',
                text: 'Launch',
                outerHtml: '<button id="hero-cta">Launch</button>',
                attributes: [
                    {
                        name: 'id',
                        value: 'hero-cta'
                    }
                ]
            }
        ])

        expect(references).toEqual([
            {
                type: 'element',
                serviceId: 'service-1',
                pageUrl: 'http://localhost:4173/',
                pageTitle: 'Preview Page',
                selector: '#hero-cta',
                tagName: 'button',
                role: 'button',
                text: 'Launch',
                outerHtml: '<button id="hero-cta">Launch</button>',
                attributes: [
                    {
                        name: 'id',
                        value: 'hero-cta'
                    }
                ]
            }
        ])

        expect(buildReferencedPrompt(references)).toContain('Referenced content:')
        expect(buildReferencedPrompt(references)).toContain('[Page element] button #hero-cta')
        expect(buildReferencedPrompt(references)).toContain('Role: button')
        expect(buildReferencedPrompt(references)).not.toContain('Referenced code:')
    })

    it('normalizes image references and includes readable metadata in the synthesized prompt', () => {
        const references = normalizeReferences([
            {
                type: 'image',
                fileId: 'file-1',
                url: 'https://example.com/image.png',
                mimeType: 'image/png',
                name: 'diagram.png',
                width: 640,
                height: 480,
                size: 2048,
                text: 'Pasted image: diagram.png'
            }
        ])

        expect(references).toEqual([
            {
                type: 'image',
                fileId: 'file-1',
                url: 'https://example.com/image.png',
                mimeType: 'image/png',
                name: 'diagram.png',
                width: 640,
                height: 480,
                size: 2048,
                text: 'Pasted image: diagram.png'
            }
        ])

        expect(buildReferencedPrompt(references)).toContain('Referenced content:')
        expect(buildReferencedPrompt(references)).toContain('[Image] diagram.png')
        expect(buildReferencedPrompt(references)).toContain('Metadata: image/png, 640x480, 2.0 KB')
        expect(buildReferencedPrompt(references)).toContain('URL: https://example.com/image.png')
    })

    it('hydrates send requests with reference-only inputs for send and follow-up actions', () => {
        expect(
            hydrateSendRequestHumanInput({
                action: 'send',
                message: {
                    input: {
                        input: '',
                        referenceComposition: 'compose',
                        references: [
                            {
                                type: 'quote',
                                source: 'Pasted text',
                                text: 'Large pasted content'
                            }
                        ]
                    }
                },
                state: {}
            })
        ).toEqual(
            expect.objectContaining({
                message: expect.objectContaining({
                    input: expect.objectContaining({
                        input: 'Referenced content:\n[Pasted text]\n> Large pasted content'
                    })
                }),
                state: expect.objectContaining({
                    human: expect.objectContaining({
                        input: 'Referenced content:\n[Pasted text]\n> Large pasted content'
                    })
                })
            })
        )

        expect(
            hydrateSendRequestHumanInput({
                action: 'follow_up',
                conversationId: 'conversation-1',
                message: {
                    input: {
                        input: '',
                        referenceComposition: 'compose',
                        references: [
                            {
                                type: 'image',
                                fileId: 'file-1',
                                name: 'diagram.png',
                                text: 'Pasted image: diagram.png'
                            }
                        ]
                    }
                },
                state: {}
            })
        ).toEqual(
            expect.objectContaining({
                message: expect.objectContaining({
                    input: expect.objectContaining({
                        input: expect.stringContaining('[Image] diagram.png')
                    })
                }),
                state: expect.objectContaining({
                    human: expect.objectContaining({
                        input: expect.stringContaining('[Image] diagram.png')
                    })
                })
            })
        )
    })
})
