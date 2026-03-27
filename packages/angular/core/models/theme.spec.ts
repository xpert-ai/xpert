import { ThemesEnum, resolveTheme } from './theme'

describe('theme model', () => {
  it('resolves default theme to light when system theme is light', () => {
    expect(resolveTheme(ThemesEnum.default, ThemesEnum.light)).toBe(ThemesEnum.light)
  })

  it('resolves default theme to dark when system theme is dark', () => {
    expect(resolveTheme(ThemesEnum.default, ThemesEnum.dark)).toBe(ThemesEnum.dark)
  })

  it('keeps explicit theme selection over system theme', () => {
    expect(resolveTheme(ThemesEnum.light, ThemesEnum.dark)).toBe(ThemesEnum.light)
    expect(resolveTheme(ThemesEnum.dark, ThemesEnum.light)).toBe(ThemesEnum.dark)
  })
})
