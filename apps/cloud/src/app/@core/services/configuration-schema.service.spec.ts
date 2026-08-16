import { TestBed } from '@angular/core/testing'
import { XpI18nPipe } from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { toFormlySchema } from './configuration-schema.service'

describe('toFormlySchema conditional fields', () => {
  let i18n: XpI18nPipe

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TranslateModule.forRoot()] })
    i18n = TestBed.runInInjectionContext(() => new XpI18nPipe())
  })

  it('uses x-ui.visibleWhen to hide fields for other providers', () => {
    const fields = toFormlySchema(
      {
        type: 'object',
        properties: {
          provider: { type: 'string', title: { en_US: 'Provider' } },
          baseUrl: {
            type: 'string',
            title: { en_US: 'Base URL' },
            'x-ui': { visibleWhen: { provider: 'self-hosted' } }
          }
        }
      },
      i18n
    )

    const baseUrl = fields.find((field) => field.key === 'baseUrl')
    const hide = baseUrl?.expressions?.hide
    expect(typeof hide).toBe('function')
    if (typeof hide === 'function') {
      expect(hide({ ...baseUrl, model: { provider: 'baidu-cloud' } })).toBe(true)
      expect(hide({ ...baseUrl, model: { provider: 'self-hosted' } })).toBe(false)
    }
    expect(baseUrl?.resetOnHide).toBe(true)
  })

  it('uses x-ui.enabledWhen to disable fields until the condition matches', () => {
    const fields = toFormlySchema(
      {
        type: 'object',
        properties: {
          credential: {
            type: 'string',
            title: { en_US: 'Credential' },
            'x-ui': { enabledWhen: { enabled: true } }
          }
        }
      },
      i18n
    )

    const credential = fields[0]
    const disabled = credential.expressions?.['props.disabled']
    expect(typeof disabled).toBe('function')
    if (typeof disabled === 'function') {
      expect(disabled({ ...credential, model: { enabled: false } })).toBe(true)
      expect(disabled({ ...credential, model: { enabled: true } })).toBe(false)
    }
  })
})
