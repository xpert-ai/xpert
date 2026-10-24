import { ExecutionI18n } from '../src/i18n/core'

// Compile-time API contract; this function is never included in the browser bundle.
export function checkTranslationTypes(i18n: ExecutionI18n) {
    i18n.t('header.defaultTitle')
    i18n.t('header.title', { executor: 'Codex' })
    i18n.t('json.items', { shape: '[]', count: 1 })
    // @ts-expect-error Unknown translation keys must fail compilation.
    i18n.t('header.missing')
    // @ts-expect-error Required interpolation parameters cannot be omitted.
    i18n.t('header.title')
    // @ts-expect-error Misspelled parameter names must fail compilation.
    i18n.t('header.title', { executer: 'Codex' })
    // @ts-expect-error Plural count must be numeric.
    i18n.t('json.items', { shape: '[]', count: 'one' })
    // @ts-expect-error Parameterless messages cannot accept arbitrary values.
    i18n.t('header.defaultTitle', { unused: 'value' })
}
