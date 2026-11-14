export async function flushRemoteEntry(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) {
  fixture.detectChanges()
  await fixture.whenStable()
  await Promise.resolve()
  fixture.detectChanges()
}

export async function readBlobText(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })
}
