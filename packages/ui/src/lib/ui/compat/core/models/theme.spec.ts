import { ThemesEnum, normalizeTheme, resolveTheme } from './theme'

describe('theme model', () => {
  it('resolves the default theme from the system preference', () => {
    expect(resolveTheme(ThemesEnum.default, ThemesEnum.light)).toBe(ThemesEnum.light)
    expect(resolveTheme(ThemesEnum.default, ThemesEnum.dark)).toBe(ThemesEnum.dark)
  })

  it('keeps an explicit theme selection', () => {
    expect(resolveTheme(ThemesEnum.light, ThemesEnum.dark)).toBe(ThemesEnum.light)
    expect(resolveTheme(ThemesEnum.dark, ThemesEnum.light)).toBe(ThemesEnum.dark)
  })

  it('normalizes the system alias before resolving the host theme', () => {
    expect(normalizeTheme('system')).toBe(ThemesEnum.default)
    expect(resolveTheme('system', ThemesEnum.dark)).toBe(ThemesEnum.dark)
  })
})
