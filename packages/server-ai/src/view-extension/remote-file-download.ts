// Host-authorized bytes must become an iframe-owned URL: parent blob URLs are partitioned in opaque frames.
// Never navigate to data content; force an attachment so HTML/SVG artifacts cannot execute in the view.
export function downloadRemoteFile(grant: { url: string; fileName: string }, invalidMessage: string) {
    let url: URL
    try {
        url = new URL(grant.url, window.location.href)
    } catch {
        throw new Error(invalidMessage)
    }
    let objectUrl: string | undefined
    if (url.protocol === 'data:') {
        const comma = grant.url.indexOf(',')
        const header = grant.url.slice(0, comma)
        const encoded = grant.url.slice(comma + 1)
        if (
            !/^data:[\w!#$&^.+-]+\/[\w!#$&^.+-]+(?:;charset=[\w-]+)?;base64$/i.test(header) ||
            !/^[a-z\d+/]*={0,2}$/i.test(encoded)
        )
            throw new Error(invalidMessage)
        let binary: string
        try {
            binary = atob(encoded)
        } catch {
            throw new Error(invalidMessage)
        }
        const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }))
    } else if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error(invalidMessage)
    }

    const link = document.createElement('a')
    link.href = objectUrl ?? url.href
    link.download = grant.fileName
    if (!objectUrl) {
        // Keep the cookie-bound Web/desktop navigation path for hosts returning HTTP grants.
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
    }
    try {
        document.body.append(link)
        link.click()
    } finally {
        link.remove()
        // Allow the browser to consume the attachment before releasing the bytes.
        const ownedUrl = objectUrl
        if (ownedUrl) window.setTimeout(() => URL.revokeObjectURL(ownedUrl), 60_000)
    }
}
