import { renderRemoteReactIframeHtml, renderRemoteVueIframeHtml } from './remote-component-html'
import { runInNewContext } from 'node:vm'

describe('remote component HTML renderers', () => {
  it('passes the root font scale independently from semantic text sizes on theme updates', () => {
    const html = renderRemoteVueIframeHtml({ title: 'Typography', appScript: '' })
    const themeScript = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].find((match) =>
      match[1].includes('window.XpertRemoteUI')
    )?.[1]
    expect(themeScript).toBeDefined()
    const setProperty = jest.fn()
    const hostWindow: { addEventListener: jest.Mock; XpertRemoteUI?: { applyTheme(theme: object): void } } = {
      addEventListener: jest.fn()
    }
    runInNewContext(themeScript!, {
      window: hostWindow,
      document: { documentElement: { dataset: {}, style: { setProperty } } }
    })
    hostWindow.XpertRemoteUI!.applyTheme({ tokens: { fontSize: '18px', fontSizeMd: '12px' } })
    expect(setProperty).toHaveBeenCalledWith('--xui-font-size', '18px')
    expect(setProperty).toHaveBeenCalledWith('--xui-font-size-md', '12px')
    hostWindow.XpertRemoteUI!.applyTheme({ tokens: { fontSize: '20px' } })
    expect(setProperty).toHaveBeenLastCalledWith('--xui-font-size', '20px')
  })

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
    expect(html).toContain("colorAccent: '--xui-color-accent'")
    expect(html).toContain("colorAccentForeground: '--xui-color-accent-foreground'")
    expect(html).toContain("colorRing: '--xui-color-ring'")
    expect(html).toContain("colorChart5: '--xui-color-chart-5'")
  })
})
