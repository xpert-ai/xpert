import sharp from 'sharp'

/** Resize embedded catalog artwork. Host and CDN URLs remain browser-owned image references. */
export async function catalogThumbnail(source: string, width: number): Promise<string | null> {
    if (/^https?:\/\//i.test(source) || /^\/(?![\\/])/.test(source)) return source
    const header = /^data:image\/(?:png|jpeg|gif|webp|avif|svg\+xml);base64,/i.exec(source)
    if (!header || source.length > 8 * 1024 * 1024) return null
    try {
        const image = await sharp(Buffer.from(source.slice(header[0].length), 'base64'), {
            limitInputPixels: 40_000_000
        })
            .rotate()
            .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 76 })
            .toBuffer()
        return 'data:image/webp;base64,' + image.toString('base64')
    } catch {
        return null
    }
}
