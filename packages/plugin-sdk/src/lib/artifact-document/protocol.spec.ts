import { artifactDocumentQuery, artifactDocumentHtml, artifactDocumentContext } from './protocol'
import { renderArtifactDocument } from './runtime'

describe('Artifact document trust boundary', () => {
  const request = { type: 'query', requestId: 'q1', bindingId: 'sales', controls: { region: null } }
  it('accepts only flat control values and declared query envelope fields', () => {
    expect(artifactDocumentQuery.parse(request)).toEqual(request)
    for (const addition of [
      { payload: { sql: 'select secret' } },
      { binding: {} },
      { providerId: 'foreign' },
      { artifactId: 'other' }
    ])
      expect(artifactDocumentQuery.safeParse({ ...request, ...addition }).success).toBe(false)
    for (const controls of [
      { region: { value: 'east' } },
      { region: ['east'] },
      { region: Infinity },
      { region: 'x'.repeat(4001) }
    ])
      expect(artifactDocumentQuery.safeParse({ ...request, controls }).success).toBe(false)
  })
  it('bounds controls and identifiers without treating their shape as authorization', () => {
    expect(artifactDocumentQuery.safeParse({ ...request, bindingId: '../secret' }).success).toBe(false)
    expect(
      artifactDocumentQuery.safeParse({
        ...request,
        controls: Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`v${i}`, i]))
      }).success
    ).toBe(false)
    expect(artifactDocumentQuery.safeParse({ ...request, bindingId: 'unknown' }).success).toBe(true)
  })
  it('enforces UTF-8 byte limits and places trusted CSP before all authored markup', () => {
    expect(artifactDocumentHtml.safeParse('<html><body>' + '中'.repeat(100000) + '</body></html>').success).toBe(false)
    const source = '<script src="https://untrusted.invalid/a.js"></script><html><body>page</body></html>'
    const rendered = renderArtifactDocument(source, 'a'.repeat(32))
    expect(rendered.indexOf('Content-Security-Policy')).toBeLessThan(rendered.indexOf('untrusted.invalid'))
    expect(rendered).toContain("connect-src 'none'")
    expect(rendered).toContain('writable: false')
  })
  it('validates only public context and clones it for one document generation', () => {
    const context = { bindingIds: ['sales'], defaults: { region: null }, theme: 'light', locale: 'en' }
    const parsed = artifactDocumentContext.parse(context)
    context.bindingIds.push('later')
    expect(parsed.bindingIds).toEqual(['sales'])
    for (const addition of [{ token: 'private' }, { artifactId: 'other' }, { userId: 'someone' }])
      expect(artifactDocumentContext.safeParse({ ...context, ...addition }).success).toBe(false)
    expect(artifactDocumentContext.safeParse({ ...context, bindingIds: ['sales', 'sales'] }).success).toBe(false)
    expect(artifactDocumentContext.safeParse({ ...context, defaults: { nested: { sql: 'query' } } }).success).toBe(
      false
    )
  })

  it('rejects executable session identifiers before inserting a bootstrap script', () => {
    expect(() => renderArtifactDocument('<html><body>hello</body></html>', '</script><script>alert(1)')).toThrow()
    const rendered = renderArtifactDocument('<html><body>hello</body></html>', 'b'.repeat(32))
    expect(rendered).toContain('b'.repeat(32))
    expect(rendered).not.toContain('__XPERT_DOCUMENT_SESSION__')
  })
})
