const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { resources, languages, normalizeLocale, translate, localizedText } = require('../electron/i18n/index.mjs')
const { DesktopService, DEFAULT_CONFIG, parseConfig } = require('../electron/service.cjs')
const { dispatch } = require('../electron/dispatch.cjs')
const { menuTemplate } = require('../electron/menu.cjs')

const placeholders = (value) => [...value.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort()

test('all supported languages cover every English message and preserve interpolation parameters', () => {
  const keys = Object.keys(resources.en).sort()
  for (const { value: locale } of languages) {
    assert.deepEqual(Object.keys(resources[locale]).sort(), keys, locale)
    for (const key of keys) {
      assert.ok(resources[locale][key].trim(), `${locale}: ${key}`)
      assert.deepEqual(placeholders(resources[locale][key]), placeholders(key), `${locale}: ${key}`)
      if (locale === 'en') assert.equal(resources.en[key], key)
    }
  }
  assert.equal(translate('unsupported', 'Sign in'), 'Sign in')
  assert.equal(translate('ja', 'Chat with {{name}}', { name: '<b>{{name}}</b>' }), '<b>{{name}}</b> とチャット')
  assert.equal(translate('zh-Hant', 'Unknown plugin content'), 'Unknown plugin content')
})

test('desktop source messages and native menus have translations; JSX cannot introduce untranslated prose', () => {
  const root = path.join(__dirname, '..')
  const sourceFiles = ['src', 'electron'].flatMap((folder) =>
    fs
      .readdirSync(path.join(root, folder))
      .filter((file) => /\.(tsx?|cjs)$/.test(file))
      .map((file) => `${folder}/${file}`)
  )
  const allowedText = new Set(['Xpert', 'ChatKit'])
  for (const file of sourceFiles) {
    const source = fs.readFileSync(path.join(root, file), 'utf8')
    assert.doesNotMatch(source, /\p{Script=Han}/u, file)
    const tree = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    )
    const visit = (node) => {
      if (
        (ts.isCallExpression(node) && node.expression.getText(tree) === 't') ||
        (ts.isNewExpression(node) && ['ClientError', 'MessageError'].includes(node.expression.getText(tree)))
      ) {
        const key = node.arguments?.[0]
        if (key && ts.isStringLiteral(key)) assert.ok(Object.hasOwn(resources.en, key.text), `${file}: ${key.text}`)
      }
      if (ts.isJsxText(node) && /[a-z]/i.test(node.text.trim()))
        assert.ok(allowedText.has(node.text.trim()), `${file}: ${node.text.trim()}`)
      ts.forEachChild(node, visit)
    }
    visit(tree)
  }
  for (const locale of ['zh-Hans', 'zh-Hant', 'ja']) {
    const labels = (entries) =>
      entries.flatMap((entry) => [entry.label, ...(entry.submenu ? labels(entry.submenu) : [])]).filter(Boolean)
    for (const label of labels(menuTemplate(locale))) {
      assert.ok(label === 'Xpert' || Object.values(resources[locale]).includes(label), label)
    }
  }
})

test('locale aliases normalize, legacy configuration defaults to English and invalid saves are atomic', () => {
  for (const [input, expected] of [
    ['jp', 'ja'],
    ['ja_JP', 'ja'],
    ['zh_CN', 'zh-Hans'],
    ['zh-TW', 'zh-Hant'],
    ['zh_Hant_HK', 'zh-Hant'],
    ['en-GB', 'en']
  ]) {
    assert.equal(normalizeLocale(input), expected)
    assert.equal(parseConfig({ ...DEFAULT_CONFIG, locale: input }).locale, expected)
  }
  const { locale, ...legacy } = DEFAULT_CONFIG
  assert.equal(parseConfig(legacy).locale, 'en')
  const service = new DesktopService()
  const before = service.snapshot()
  assert.throws(() => service.configure({ ...DEFAULT_CONFIG, locale: '<script>' }), { status: 400 })
  assert.deepEqual(service.snapshot(), before)
  const restored = new DesktopService({
    storage: { read: () => ({ config: { ...legacy, apiUrl: 'https://example.com', locale: 'unknown' } }), write() {} }
  })
  assert.equal(restored.config.apiUrl, 'https://example.com')
  assert.equal(restored.config.locale, 'en')
})

test('language persists across restarts without invalidating authentication, organization or Bot access', async () => {
  let saved = {
    config: DEFAULT_CONFIG,
    credentials: { token: 'fixture', refreshToken: 'fixture', organizationId: 'org' }
  }
  const storage = {
    read: () => structuredClone(saved),
    write: (value) => {
      saved = structuredClone(value)
    }
  }
  const headers = []
  const fetcher = async (url, options) => {
    headers.push(options.headers['Accept-Language'])
    return new Response(
      JSON.stringify(
        url.endsWith('/bootstrap')
          ? { user: { id: 'user', name: 'Author name' }, organizations: [{ id: 'org', name: 'Organization' }] }
          : { client_secret: 'scoped' }
      )
    )
  }
  const service = new DesktopService({ storage, fetcher })
  await service.state()
  service.bots = [{ id: 'bot' }]
  const generation = service.generation
  for (const { value: locale } of languages) {
    service.configure({ ...service.config, locale })
    assert.equal(service.generation, generation)
    assert.equal(service.profile.organizationId, 'org')
    assert.equal((await service.chatSession('bot')).secret, 'scoped')
    assert.equal(headers.at(-1), locale)
    const restored = new DesktopService({ storage, fetcher })
    assert.equal(restored.config.locale, locale)
    assert.equal((await restored.state()).profile.user.name, 'Author name')
  }
})

test('host errors carry safe English message keys and interpolate translated validation labels', async () => {
  const service = new DesktopService()
  for (const { value: locale } of languages) {
    service.configure({ ...service.config, locale })
    const result = await dispatch(service, 'configure', { ...service.config, appearance: { desktop: { radius: -1 } } })
    assert.equal(result.ok, false)
    assert.equal(result.status, 400)
    assert.equal(result.key, '{{label}} must be an integer from {{min}} to {{max}}.')
    assert.deepEqual(result.params, { label: 'Desktop corner radius', min: 0, max: 24 })
    assert.equal(result.message, translate(locale, result.key, result.params))
    assert.doesNotMatch(result.message, /\{\{/)
  }
  service.state = async () => {
    throw new Error('private credentials must not be exposed')
  }
  const result = await dispatch(service, 'state')
  assert.equal(result.key, 'The operation failed. Please retry.')
  assert.doesNotMatch(JSON.stringify(result), /private credentials/)
})

test('localized marketplace metadata follows the selected language with English fallback', async () => {
  const names = { en_US: 'Office', zh_Hans: '办公', zh_Hant: '辦公', ja_JP: 'オフィス' }
  assert.equal(localizedText('Author content', 'ja'), 'Author content')
  assert.equal(localizedText({ en: 'English fallback' }, 'ja'), 'English fallback')
  assert.equal(localizedText(names, 'zh-Hant'), '辦公')
  const service = new DesktopService({
    fetcher: async () =>
      new Response(
        JSON.stringify([
          {
            application: {
              id: 'app',
              appName: 'app',
              pluginName: 'plugin',
              displayName: names,
              config: { presentation: { initializationSteps: [names] } }
            },
            status: { status: 'not_installed' }
          }
        ])
      )
  })
  service.credentials = { token: 'fixture' }
  service.profile = { organizationId: 'org' }
  for (const [locale, expected] of [
    ['en', 'Office'],
    ['zh-Hans', '办公'],
    ['zh-Hant', '辦公'],
    ['ja', 'オフィス']
  ]) {
    service.configure({ ...service.config, locale })
    const items = await service.listCatalog('applications')
    assert.equal(items[0].name, expected)
    assert.deepEqual(items[0].steps, [expected])
  }
})
