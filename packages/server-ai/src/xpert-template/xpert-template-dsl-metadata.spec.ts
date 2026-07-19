import { readXpertTemplateDslMetadata } from './xpert-template-dsl-metadata'

describe('readXpertTemplateDslMetadata', () => {
    const dsl = `
team:
  description:
    en_US: English description
    zh_Hans: 中文描述
  avatar:
    url: data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=
`

    it('resolves localized descriptions and the team avatar', () => {
        expect(readXpertTemplateDslMetadata(dsl, 'zh-Hans')).toEqual({
            description: '中文描述',
            avatar: { url: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }
        })
        expect(readXpertTemplateDslMetadata(dsl, 'en-US').description).toBe('English description')
    })

    it('ignores malformed DSL metadata without breaking the template catalog', () => {
        expect(readXpertTemplateDslMetadata('team: [', 'en-US')).toEqual({})
    })
})
