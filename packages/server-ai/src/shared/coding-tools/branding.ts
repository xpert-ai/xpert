import { getBrandIcon, type BrandIconId } from '@xpert-ai/shadcn-ui/brand-icons'

const toolBrands = {
    codex: 'codex',
    opencode: 'opencode',
    aider: 'aider',
    claude: 'claude',
    qwen: 'qwen',
    kimi: 'kimi',
    codebuddy: 'codebuddy'
} as const satisfies Record<string, BrandIconId>
export type CodingToolId = keyof typeof toolBrands
export type CodingToolBrand = { id: CodingToolId; brandId: BrandIconId; name: string; svg: string }
const runtimeTools: Readonly<Record<string, CodingToolId>> = {
    codex: 'codex',
    'codex-computer': 'codex',
    opencode: 'opencode',
    'qwen-computer': 'qwen',
    claude: 'claude'
}

/** Exact protocol IDs only. An unknown explicit tool never inherits a provider's logo. */
export function codingToolBrand(identity: {
    toolId?: string | null
    provider?: string | null
}): CodingToolBrand | undefined {
    const id = identity.toolId ?? (identity.provider ? runtimeTools[identity.provider] : undefined)
    if (!id || !Object.prototype.hasOwnProperty.call(toolBrands, id)) return undefined
    const key = id as CodingToolId
    const brand = getBrandIcon(toolBrands[key])
    return brand ? { id: key, brandId: brand.id, name: brand.name, svg: brand.svg } : undefined
}
