/** Preserve the platform-configured public origin; plugins never assemble viewer URLs. */
export function artifactPresentationUrl(publicUrl: string, slug: string) {
    const url = new URL(publicUrl)
    url.pathname = url.pathname.replace(/\/artifacts\/share\/[^/]+$/, `/artifacts/view/${encodeURIComponent(slug)}`)
    url.search = ''
    url.hash = ''
    return url.toString()
}
