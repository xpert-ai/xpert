/** Self-contained authorized bytes work in opaque frames where parent blob URLs are partitioned. */
export function remoteFileDataUrl(blob: Blob, mimeType: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Unable to read download content'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read download content'))
    reader.readAsDataURL(new Blob([blob], { type: mimeType }))
  })
}
