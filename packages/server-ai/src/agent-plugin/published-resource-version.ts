/** A published ID may be republished in place; pin its publication revision too. */
export function publishedResourceVersion(publishedAt: Date | string | null | undefined): string {
    if (!publishedAt) return ''
    const date = publishedAt instanceof Date ? publishedAt : new Date(publishedAt)
    return Number.isFinite(date.getTime()) ? date.toISOString() : ''
}
