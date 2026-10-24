import { artifactDocumentCsp, artifactDocumentNetworkPolicy, isArtifactDocumentResourceAllowed } from './network'
import { ARTIFACT_DOCUMENT_CSP, renderArtifactDocument } from './runtime'

describe('Artifact document resource policy', () => {
  const policy = {
    scripts: ['https://cdn.tailwindcss.com'],
    styles: ['https://fonts.googleapis.com'],
    fonts: ['https://fonts.gstatic.com']
  }
  it('preserves the offline default and only expands declared resource directives', () => {
    expect(artifactDocumentCsp()).toBe(ARTIFACT_DOCUMENT_CSP)
    const csp = artifactDocumentCsp(policy)
    expect(csp).toContain("script-src 'unsafe-inline' https://cdn.tailwindcss.com")
    expect(csp).toContain("style-src 'unsafe-inline' https://fonts.googleapis.com")
    expect(csp).toContain('font-src data: https://fonts.gstatic.com')
    expect(csp).toContain("connect-src 'none'")
    expect(csp).toContain("frame-src 'none'")
    expect(csp).not.toContain('unsafe-eval')
    expect(renderArtifactDocument('<html><body>Example</body></html>', 'a'.repeat(32), [], policy)).toContain(csp)
  })
  it.each([
    '*',
    'http://cdn.example.com',
    'https://*.example.com',
    'https://cdn.example.com/path',
    'https://cdn.example.com/',
    'https://cdn.example.com?secret=x',
    'https://user:password@cdn.example.com',
    'https://cdn.example.com; connect-src *',
    'https://cdn.example.com"'
  ])('rejects non-origin policy %s', (value) => {
    expect(artifactDocumentNetworkPolicy.safeParse({ scripts: [value] }).success).toBe(false)
  })
  it('matches resource type and exact origin without authorizing other requests', () => {
    expect(isArtifactDocumentResourceAllowed(policy, 'script', 'https://cdn.tailwindcss.com/3.4.17')).toBe(true)
    expect(
      isArtifactDocumentResourceAllowed(policy, 'stylesheet', 'https://fonts.googleapis.com/css2?family=Inter')
    ).toBe(true)
    expect(isArtifactDocumentResourceAllowed(policy, 'font', 'https://fonts.gstatic.com/font.woff2')).toBe(true)
    for (const type of ['fetch', 'xhr', 'document', 'websocket', 'other', 'image'])
      expect(isArtifactDocumentResourceAllowed(policy, type, 'https://cdn.tailwindcss.com/')).toBe(false)
    for (const url of [
      'https://cdn.tailwindcss.com.evil.test/',
      'https://cdn.tailwindcss.com:444/',
      'http://cdn.tailwindcss.com/',
      'https://user:password@cdn.tailwindcss.com/',
      'data:text/javascript,alert(1)',
      'not a URL'
    ])
      expect(isArtifactDocumentResourceAllowed(policy, 'script', url)).toBe(false)
  })
})
