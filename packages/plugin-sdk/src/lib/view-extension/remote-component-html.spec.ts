import { renderRemoteReactIframeHtml, renderRemoteVueIframeHtml } from './remote-component-html'

describe('remote component HTML renderers', () => {
  it('renders legacy react entries as classic scripts', () => {
    const html = renderRemoteReactIframeHtml({
      title: 'Legacy Remote',
      reactUmd: 'window.React = {}',
      reactDomUmd: 'window.ReactDOM = {}',
      appScript: 'window.legacyRemote = true'
    })

    expect(html).toContain('<script>')
    expect(html).toContain('window.legacyRemote = true')
    expect(html).not.toContain('<script type="module">')
  })

  it('renders vue entries as ES module scripts', () => {
    const html = renderRemoteVueIframeHtml({
      title: 'Vue Remote',
      lang: 'zh-Hans',
      appScript: 'await Promise.resolve(); window.vueRemote = true'
    })

    expect(html).toContain('<html lang="zh-Hans">')
    expect(html).toContain('<script type="module">')
    expect(html).toContain('await Promise.resolve(); window.vueRemote = true')
    expect(html).toContain('XpertRemoteUI')
  })
})
