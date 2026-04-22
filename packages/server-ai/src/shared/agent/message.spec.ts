import { createHumanMessage } from './message'

describe('createHumanMessage', () => {
    it('turns image references into image_url content parts and preserves text fallback', async () => {
        const commandBus = {
            execute: jest.fn()
        }
        const queryBus = {
            execute: jest.fn()
        }

        const message = await createHumanMessage(
            commandBus as any,
            queryBus as any,
            {
                human: {
                    input: 'Please analyze this image',
                    references: [
                        {
                            type: 'image',
                            url: 'https://example.com/image.png',
                            name: 'diagram.png',
                            mimeType: 'image/png',
                            text: 'Pasted image: diagram.png'
                        }
                    ]
                }
            },
            undefined
        )

        expect(message.content).toEqual([
            {
                type: 'image_url',
                image_url: {
                    url: 'https://example.com/image.png'
                }
            },
            {
                type: 'text',
                text: expect.stringContaining('Please analyze this image')
            }
        ])
        expect((message.content as Array<{ type: string; text?: string }>)[1].text).toContain('[Image] diagram.png')
    })

    it('still creates multimodal content when the human input only contains image references', async () => {
        const message = await createHumanMessage(
            {
                execute: jest.fn()
            } as any,
            {
                execute: jest.fn()
            } as any,
            {
                human: {
                    input: '',
                    references: [
                        {
                            type: 'image',
                            url: 'https://example.com/reference-only.png',
                            name: 'reference-only.png',
                            text: 'Pasted image: reference-only.png'
                        }
                    ]
                }
            },
            undefined
        )

        expect(message.content).toEqual([
            {
                type: 'image_url',
                image_url: {
                    url: 'https://example.com/reference-only.png'
                }
            },
            {
                type: 'text',
                text: expect.stringContaining('[Image] reference-only.png')
            }
        ])
    })
})
