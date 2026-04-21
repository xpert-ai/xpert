import { buildReferencedPrompt, normalizeReferences } from './human-input'

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
})
