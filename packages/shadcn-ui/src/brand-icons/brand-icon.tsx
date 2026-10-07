import { getBrandIcon, type BrandIconId } from './index'

/** Renders trusted bundled assets only; neutral paths inherit the host foreground. */
export function BrandIcon({
  brandId,
  className = 'size-4',
  decorative = false
}: {
  brandId: BrandIconId
  className?: string
  decorative?: boolean
}) {
  const brand = getBrandIcon(brandId)
  if (!brand) return null
  return (
    <span
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : brand.name}
      title={brand.name}
      className={`inline-flex shrink-0 align-middle ${className}`}
      dangerouslySetInnerHTML={{ __html: brand.svg }}
    />
  )
}
