import { Terminal } from 'lucide-react'
import { BrandIcon } from '@xpert-ai/shadcn-ui'
import { codingToolBrand } from './branding'

/** Coding-specific identity resolution and fallback; shared UI owns brand rendering. */
export function CodingToolIcon({
    toolId,
    provider,
    className = 'size-4',
    decorative = false
}: {
    toolId?: string | null
    provider?: string | null
    className?: string
    decorative?: boolean
}) {
    const brand = codingToolBrand({ toolId, provider })
    const label = brand?.name ?? toolId ?? provider ?? 'Coding CLI'
    return brand ? (
        <BrandIcon brandId={brand.brandId} className={className} decorative={decorative} />
    ) : (
        <Terminal
            role={decorative ? undefined : 'img'}
            aria-hidden={decorative || undefined}
            aria-label={decorative ? undefined : label}
            className={`shrink-0 ${className}`}
        />
    )
}
