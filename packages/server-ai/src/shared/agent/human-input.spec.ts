import { buildReferencedPrompt, hydrateSendRequestHumanInput, normalizeReferences } from './human-input'

describe('human-input references', () => {
    it('normalizes html file element references and formats source location metadata', () => {
        const references = normalizeReferences([
            {
                type: 'file_element',
                filePath: 'src/index.html',
                documentTitle: 'Landing',
                selector: '#hero-cta',
                domPath: 'html > body > main > button',
                tagName: 'button',
                role: 'button',
                text: 'Launch',
                outerHtml: '<button id="hero-cta">Launch</button>',
                attributes: [
                    {
                        name: 'id',
                        value: 'hero-cta'
                    }
                ],
                sourceStartLine: 12,
                sourceEndLine: 12
            }
        ])

        expect(references).toEqual([
            {
                type: 'file_element',
                filePath: 'src/index.html',
                documentTitle: 'Landing',
                selector: '#hero-cta',
                domPath: 'html > body > main > button',
                tagName: 'button',
                role: 'button',
                text: 'Launch',
                outerHtml: '<button id="hero-cta">Launch</button>',
                attributes: [
                    {
                        name: 'id',
                        value: 'hero-cta'
                    }
                ],
                sourceStartLine: 12,
                sourceEndLine: 12
            }
        ])

        const prompt = buildReferencedPrompt(references)
        expect(prompt).toContain('Referenced target element:')
        expect(prompt).toContain('[Target inspected HTML file element] button #hero-cta')
        expect(prompt).toContain('Scope: This reference is the currently inspected element only, not the entire file.')
        expect(prompt).toContain(
            "Action target: Apply the user's request to THIS inspected element only; do not change the rest of the file/page unless explicitly asked."
        )
        expect(prompt).toContain('Source location: src/index.html:12')
        expect(prompt).toContain('- Selector: #hero-cta')
        expect(prompt).toContain('- DOM path: html > body > main > button')
        expect(prompt).toContain('Inspected element outerHTML:')
    })

    it('rejects incomplete html file element references', () => {
        expect(
            normalizeReferences([
                {
                    type: 'file_element',
                    filePath: 'src/index.html',
                    selector: '#hero-cta',
                    tagName: 'button',
                    text: 'Launch',
                    attributes: []
                }
            ])
        ).toEqual([])
    })

    it('normalizes element references and formats them as target element content', () => {
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

        expect(buildReferencedPrompt(references)).toContain('Referenced target element:')
        expect(buildReferencedPrompt(references)).toContain('[Target inspected page element] button #hero-cta')
        expect(buildReferencedPrompt(references)).toContain(
            "Action target: Apply the user's request to THIS inspected element only; do not change the rest of the file/page unless explicitly asked."
        )
        expect(buildReferencedPrompt(references)).toContain('Role: button')
        expect(buildReferencedPrompt(references)).not.toContain('Referenced code:')
    })

    it('formats inspected element quote references as target elements', () => {
        const prompt = buildReferencedPrompt([
            {
                type: 'quote',
                label: 'h1 "Launch"',
                source: 'src/index.html:12',
                text: [
                    'Reference type: Target inspected HTML file element',
                    "Action target: Apply the user's request to THIS inspected element only; do not change the rest of the file/page unless explicitly asked.",
                    'Inspected element outerHTML:',
                    '```html',
                    '<h1>Launch</h1>',
                    '```'
                ].join('\n')
            }
        ])

        expect(prompt).toContain('Referenced target element:')
        expect(prompt).toContain('[h1 "Launch" - src/index.html:12]')
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
