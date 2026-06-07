// Why this exists:
// LangGraph's drawMermaidPng sends raw base64 Mermaid text in a GET path.
// Large Xpert graphs can exceed URL limits and Mermaid.INK returns 414.
// Mermaid.INK also accepts Mermaid Live Editor's compressed pako state format.
import { deflateSync } from 'node:zlib'

const MERMAID_INK_IMAGE_URL = 'https://mermaid.ink/img'
const DEFAULT_BACKGROUND_COLOR = 'white'
const DEFAULT_CONTENT_TYPE = 'image/jpeg'

export interface MermaidInkImage {
    contentType: string
    data: Buffer
}

export function encodeMermaidInkState(mermaidSyntax: string): string {
    const state = JSON.stringify({
        code: mermaidSyntax,
        mermaid: {
            theme: 'default'
        }
    })

    return `pako:${toBase64Url(deflateSync(Buffer.from(state, 'utf8')))}`
}

export function formatMermaidInkBackgroundColor(backgroundColor = DEFAULT_BACKGROUND_COLOR) {
    const color = backgroundColor.trim()
    if (!color) {
        return undefined
    }

    const hexColor = color.startsWith('#') ? color.slice(1) : color
    if (/^(?:[0-9a-fA-F]{3}){1,2}$/.test(hexColor)) {
        return hexColor
    }

    return `!${color.startsWith('!') ? color.slice(1) : color}`
}

export async function renderMermaidInkImage(mermaidSyntax: string): Promise<MermaidInkImage> {
    const encodedState = encodeMermaidInkState(mermaidSyntax)
    const url = new URL(`${MERMAID_INK_IMAGE_URL}/${encodedState}`)
    const backgroundColor = formatMermaidInkBackgroundColor()
    if (backgroundColor) {
        url.searchParams.set('bgColor', backgroundColor)
    }

    const response = await fetch(url)
    if (!response.ok) {
        throw new Error(
            [
                'Failed to render the graph using the Mermaid.INK API.',
                `Status code: ${response.status}`,
                `Status text: ${response.statusText}`
            ].join('\n')
        )
    }

    return {
        contentType: response.headers.get('content-type') ?? DEFAULT_CONTENT_TYPE,
        data: Buffer.from(await response.arrayBuffer())
    }
}

function toBase64Url(value: Buffer) {
    return value.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}
