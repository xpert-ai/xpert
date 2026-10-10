import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { createAssistantChatkitTheme, injectAssistantChatkitTheme } from './assistant-chatkit-theme'

describe('existing ChatKit surface theme', () => {
  let style: string | null
  beforeEach(() => {
    style = document.documentElement.getAttribute('style')
  })
  afterEach(() => {
    TestBed.resetTestingModule()
    if (style === null) document.documentElement.removeAttribute('style')
    else document.documentElement.setAttribute('style', style)
  })
  it('passes the base surface without substituting card colors or rounding modern CSS colors', () => {
    document.documentElement.style.setProperty('--background', 'oklch(0.141 0 0)')
    document.documentElement.style.setProperty('--foreground', 'oklch(0.985 0 0)')
    document.documentElement.style.setProperty('--card', 'oklch(0.21 0.006 285.885)')
    expect(createAssistantChatkitTheme(document, 'dark').color).toEqual({
      surface: { background: 'oklch(0.141 0 0)', foreground: 'oklch(0.985 0 0)' }
    })
  })
  it('lets ChatKit defaults apply when there is no host style context', () => {
    expect(createAssistantChatkitTheme(document.implementation.createHTMLDocument(), 'light').color).toBeUndefined()
  })
  it('refreshes after the host applies CSS asynchronously following a mode change', async () => {
    const mode = signal<'light' | 'dark'>('dark')
    document.documentElement.style.setProperty('--background', 'oklch(0.141 0 0)')
    document.documentElement.style.setProperty('--foreground', 'oklch(0.985 0 0)')
    const theme = TestBed.runInInjectionContext(() => injectAssistantChatkitTheme(document, mode))
    expect(theme().color?.surface?.background).toBe('oklch(0.141 0 0)')
    mode.set('light')
    document.documentElement.style.setProperty('--background', 'oklch(1 0 0)')
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    expect(theme().colorScheme).toBe('light')
    expect(theme().color?.surface?.background).toBe('oklch(1 0 0)')
  })
})
