import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import test from 'node:test'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
const src = new URL('../src/', import.meta.url)
const bundle = await build({
    entryPoints: [fileURLToPath(new URL('i18n/core.ts', src))],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node'
})
const { ExecutionI18n, catalogs, normalizeLocale } = await import(
    `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
)
const parameters = (value) =>
    [...new Set([...value.matchAll(/{{\s*([^},\s]+)(?:,[^}]*)?}}/g)].map((match) => match[1]))].sort()

test('catalogs have identical keys and interpolation parameters and resolve every message', () => {
    const en = catalogs['en-US'],
        i18n = new ExecutionI18n()
    for (const [locale, catalog] of Object.entries(catalogs)) {
        i18n.setLocale(locale)
        assert.deepEqual(Object.keys(catalog).sort(), Object.keys(en).sort())
        for (const [key, value] of Object.entries(catalog)) {
            assert.deepEqual(parameters(value), parameters(en[key]), `${locale}:${key}`)
            assert.ok(value.trim())
            const values = Object.fromEntries(
                parameters(value).map((name) => [name, name === 'count' ? 2 : `<${name}>`])
            )
            const result = i18n.t(key, values)
            assert.notEqual(result, key)
            assert.doesNotMatch(result, /{{/)
        }
    }
})
test('host aliases preserve Chinese scripts and unsupported locales fall back to English', () => {
    for (const [input, expected] of [
        ['en_US', 'en-US'],
        ['en-GB', 'en-US'],
        ['zh', 'zh-Hans'],
        ['zh_CN', 'zh-Hans'],
        ['zh-SG', 'zh-Hans'],
        ['zh_Hans', 'zh-Hans'],
        ['zh-TW', 'zh-Hant'],
        ['zh-HK', 'zh-Hant'],
        ['zh-MO', 'zh-Hant'],
        ['zh_Hant', 'zh-Hant'],
        ['zh-Hant-CN', 'zh-Hant'],
        ['zh-Hans-TW', 'zh-Hans'],
        ['ZH_hant', 'zh-Hant'],
        ['fr-FR', 'en-US'],
        ['', 'en-US'],
        ['invalid locale!', 'en-US'],
        [undefined, 'en-US']
    ])
        assert.equal(normalizeLocale(input), expected, input)
})
test('interpolation, plurals and Intl formatting follow the active locale', () => {
    const i18n = new ExecutionI18n()
    assert.equal(i18n.t('json.items', { shape: '[…]', count: 1 }), '[…] · 1 item')
    assert.equal(i18n.t('json.fields', { shape: '{…}', count: 2 }), '{…} · 2 fields')
    assert.equal(i18n.t('header.title', { executor: '<tool>' }), '<tool> · Execution')
    for (const locale of Object.keys(catalogs)) {
        i18n.setLocale(locale)
        assert.equal(i18n.formatNumber(12345), new Intl.NumberFormat(locale).format(12345))
        assert.equal(
            i18n.formatDate('2026-10-24T04:00:00Z'),
            new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'medium' }).format(
                new Date('2026-10-24T04:00:00Z')
            )
        )
        assert.equal(i18n.formatDate('invalid'), i18n.t('metadata.unavailable'))
    }
    assert.equal(i18n.t('json.fields', { shape: '{…}', count: 1 }), '{…} · 1 個欄位')
})
test('UI modules contain no inline bilingual copy or locale selection branches', async () => {
    for (const name of await readdir(src)) {
        if (!/\.tsx?$/.test(name)) continue
        const code = await readFile(new URL(name, src), 'utf8')
        assert.doesNotMatch(code, /\p{Script=Han}/u, name)
        assert.doesNotMatch(code, /\blabel\s*\(|startsWith\(['"]zh|locale\s*===\s*['"](?:en|zh)/, name)
    }
})
