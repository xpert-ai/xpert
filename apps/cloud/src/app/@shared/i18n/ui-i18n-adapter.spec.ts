import { signal } from '@angular/core'

import { createUiI18nAdapter, withDefaultUiNamespace } from './ui-i18n-adapter'

describe('UI i18n adapter', () => {
  it('routes unqualified UI keys through the xp-ui namespace', () => {
    expect(withDefaultUiNamespace('datePicker.chooseDate', { Default: 'Choose date' })).toEqual({
      Default: 'Choose date',
      ns: 'xp-ui'
    })
  })

  it('keeps explicit namespaces untouched', () => {
    expect(withDefaultUiNamespace('xp-ui:confirm.confirm', { Default: 'Confirm' })).toEqual({
      Default: 'Confirm'
    })
    expect(withDefaultUiNamespace('datePicker.chooseDate', { ns: 'custom', Default: 'Choose date' })).toEqual({
      ns: 'custom',
      Default: 'Choose date'
    })
  })

  it('bridges language and translations from the app i18n service', () => {
    const language = signal('zh-Hans')
    const translate = jest.fn((key: string, options?: Record<string, unknown>) => `${options?.ns ?? 'none'}:${key}`)
    const adapter = createUiI18nAdapter({
      language,
      currentLanguage: 'zh-Hans',
      translate
    })

    expect(adapter.language?.()).toBe('zh-Hans')
    expect(adapter.getLanguage?.()).toBe('zh-Hans')
    expect(adapter.translate('datePicker.chooseDate', { Default: 'Choose date' })).toBe('xp-ui:datePicker.chooseDate')
    expect(translate).toHaveBeenCalledWith('datePicker.chooseDate', {
      Default: 'Choose date',
      ns: 'xp-ui'
    })
  })
})
