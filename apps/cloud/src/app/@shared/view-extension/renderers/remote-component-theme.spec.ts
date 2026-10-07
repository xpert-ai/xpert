import { createRemoteTheme } from './remote-component-theme'

describe('remote component root font scale', () => {
  const root = document.documentElement
  let originalStyle: string | null

  beforeEach(() => {
    originalStyle = root.getAttribute('style')
    root.removeAttribute('style')
  })
  afterEach(() => {
    if (originalStyle === null) root.removeAttribute('style')
    else root.setAttribute('style', originalStyle)
  })

  it('uses the host root font size independently of the medium text token', () => {
    root.style.fontSize = '18px'
    root.style.setProperty('--workbench-extension-font-size-md', '12px')
    const { tokens } = createRemoteTheme(document, 'light')
    expect(tokens.fontSize).toBe('18px')
    expect(tokens.fontSizeMd).toBe('12px')
  })

  it('supports an explicit extension scale and reflects changes', () => {
    root.style.fontSize = '18px'
    root.style.setProperty('--workbench-extension-font-size', '20px')
    expect(createRemoteTheme(document, 'light').tokens.fontSize).toBe('20px')
    root.style.setProperty('--workbench-extension-font-size', '16px')
    expect(createRemoteTheme(document, 'dark').tokens.fontSize).toBe('16px')
  })

  it('defaults the base font size to 14px when host styling is unavailable', () => {
    expect(createRemoteTheme(document.implementation.createHTMLDocument(), 'light').tokens.fontSize).toBe('14px')
  })
})
