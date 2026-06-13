import { inflateSync } from 'node:zlib'
import { encodeMermaidInkState, formatMermaidInkBackgroundColor } from './mermaid-ink-renderer'

interface MermaidInkState {
    code: string
    mermaid: {
        theme: string
    }
}

describe('mermaid ink renderer', () => {
    it('encodes Mermaid syntax as a compressed Mermaid Live Editor state', () => {
        const code = 'graph TD;\n\tA-->B;'

        const encoded = encodeMermaidInkState(code)
        const decoded = decodeMermaidInkState(encoded)

        expect(isMermaidInkState(decoded)).toBe(true)
        if (!isMermaidInkState(decoded)) {
            return
        }
        expect(decoded.code).toBe(code)
        expect(decoded.mermaid.theme).toBe('default')
    })

    it('keeps large graph URLs shorter than raw base64 Mermaid text', () => {
        const code = Array.from({ length: 300 }, (_, index) => `\tnode${index}-->node${index + 1};`).join('\n')

        const encoded = encodeMermaidInkState(code)
        const rawBase64 = Buffer.from(code, 'utf8').toString('base64')

        expect(encoded.startsWith('pako:')).toBe(true)
        expect(encoded.length).toBeLessThan(rawBase64.length)
    })

    it('formats Mermaid.INK background colors', () => {
        expect(formatMermaidInkBackgroundColor('white')).toBe('!white')
        expect(formatMermaidInkBackgroundColor('#ffffff')).toBe('ffffff')
        expect(formatMermaidInkBackgroundColor('FF0000')).toBe('FF0000')
    })
})

function decodeMermaidInkState(encoded: string): unknown {
    const serialized = encoded.startsWith('pako:') ? encoded.slice('pako:'.length) : encoded
    const base64 = serialized.replace(/-/g, '+').replace(/_/g, '/')
    const paddedBase64 = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    const json = inflateSync(Buffer.from(paddedBase64, 'base64')).toString('utf8')

    return JSON.parse(json)
}

function isMermaidInkState(value: unknown): value is MermaidInkState {
    if (!value || typeof value !== 'object') {
        return false
    }

    const code = Reflect.get(value, 'code')
    const mermaid = Reflect.get(value, 'mermaid')
    if (typeof code !== 'string' || !mermaid || typeof mermaid !== 'object') {
        return false
    }

    return typeof Reflect.get(mermaid, 'theme') === 'string'
}
