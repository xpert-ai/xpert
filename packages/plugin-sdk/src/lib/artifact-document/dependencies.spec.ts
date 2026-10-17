import { createHash } from 'node:crypto'
import { verifyArtifactDocumentDependencies, type ArtifactDocumentDependencyAsset } from './dependencies'
import { renderArtifactDocument } from './runtime'

const source = 'window.Example={text:"</script><script>unexpected()</script>中文"};'
const asset: ArtifactDocumentDependencyAsset = {
  id: 'example',
  version: '1.2.3',
  global: 'Example',
  format: 'classic-script',
  source,
  sha256: createHash('sha256').update(source).digest('hex')
}
describe('Artifact frontend dependency snapshots', () => {
  it('verifies exact UTF-8 bytes and declared lock order', () => {
    const { source, ...lock } = asset
    expect(verifyArtifactDocumentDependencies([asset], [lock])).toEqual([asset])
    expect(() => verifyArtifactDocumentDependencies([{ ...asset, source: source + ' ' }])).toThrow('INTEGRITY')
    expect(() => verifyArtifactDocumentDependencies([asset], [{ ...lock, version: '1.2.4' }])).toThrow('LOCK_MISMATCH')
    expect(() => verifyArtifactDocumentDependencies([], [lock])).toThrow('LOCK_MISMATCH')
  })
  it('rejects duplicate globals, URLs, reserved SDK globals, and oversized bundles', () => {
    expect(() => verifyArtifactDocumentDependencies([asset, { ...asset, id: 'second' }])).toThrow()
    expect(() => verifyArtifactDocumentDependencies([{ ...asset, url: 'https://example.com/script.js' }])).toThrow()
    expect(() => verifyArtifactDocumentDependencies([{ ...asset, global: 'xpertLiveArtifact' }])).toThrow()
    expect(() => verifyArtifactDocumentDependencies([{ ...asset, source: '中'.repeat(1_400_000) }])).toThrow(
      'TOO_LARGE'
    )
  })
  it('places library injection after CSP/SDK and before authored HTML without script termination', () => {
    const html = '<html><body>Authored</body></html>',
      rendered = renderArtifactDocument(html, 'a'.repeat(32), [asset])
    expect(rendered.indexOf('Content-Security-Policy')).toBeLessThan(rendered.indexOf('s.textContent='))
    expect(rendered.indexOf('s.textContent=')).toBeLessThan(rendered.indexOf(html))
    expect(rendered).not.toContain('</script><script>unexpected()')
    expect(rendered).toContain("connect-src 'none'")
    expect(rendered).not.toContain('unsafe-eval')
  })
})
