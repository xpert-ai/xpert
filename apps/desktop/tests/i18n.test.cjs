const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const {
  resources,
  languages,
  normalizeLocale,
  resolveSystemLocale,
  translate,
  localizedText
} = require('../electron/i18n/index.mjs')
const { DesktopService, DEFAULT_CONFIG, parseConfig } = require('../electron/service.cjs')
const { dispatch } = require('../electron/dispatch.cjs')
const { menuTemplate } = require('../electron/menu.cjs')
const branding = require('../electron/branding.json')

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
  const sourceFiles = ['src', 'src/settings', 'electron'].flatMap((folder) =>
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
      assert.ok(label === branding.name || Object.values(resources[locale]).includes(label), label)
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
    assert.equal(options.headers.language, options.headers['Accept-Language'])
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

test('new installs and missing legacy locales use supported system languages in preference order', () => {
  for (const [preferred, expected] of [
    [['zh-Hans-CN', 'en-US'], 'zh-Hans'],
    [['zh-TW', 'en'], 'zh-Hant'],
    [['ja-JP', 'en'], 'ja'],
    [['en-GB', 'zh-CN'], 'en'],
    [['fr-FR', 'ja-JP', 'en'], 'ja'],
    [['fr-FR'], 'en'],
    [[], 'en']
  ]) {
    assert.equal(resolveSystemLocale(preferred), expected)
    assert.equal(new DesktopService({ systemLanguages: preferred }).config.locale, expected)
  }
  const { locale, ...legacy } = DEFAULT_CONFIG
  for (const value of [undefined, 'unsupported']) {
    const service = new DesktopService({
      systemLanguages: ['zh-CN'],
      storage: { read: () => ({ config: { ...legacy, locale: value } }), write() {} }
    })
    assert.equal(service.config.locale, 'zh-Hans')
  }
  const saved = new DesktopService({
    systemLanguages: ['zh-CN'],
    storage: { read: () => ({ config: { ...DEFAULT_CONFIG, locale: 'ja' } }), write() {} }
  })
  assert.equal(saved.config.locale, 'ja')
})

test('sign-in and restored sessions prefer the account language over the system and saved desktop language', async () => {
  for (const [preferredLanguage, expected] of [
    ['zh-CN', 'zh-Hans'],
    ['en-US', 'en'],
    ['zh-TW', 'zh-Hant'],
    ['ja-JP', 'ja'],
    [null, 'en'],
    ['fr', 'en']
  ]) {
    let saved = { config: DEFAULT_CONFIG }
    const storage = {
      read: () => structuredClone(saved),
      write: (value) => {
        saved = structuredClone(value)
      }
    }
    const user = { id: 'user', tenantId: 'tenant', preferredLanguage }
    const fetcher = async (url) =>
      new Response(
        JSON.stringify(
          url.endsWith('/auth/login')
            ? { user, token: 'fixture', refreshToken: 'refresh-fixture' }
            : { user, organizations: [{ id: 'org', name: 'Workspace' }] }
        )
      )
    const service = new DesktopService({ systemLanguages: ['ja-JP'], storage, fetcher })
    const signedIn = await service.login({ email: 'test@example.com', password: 'fixture' })
    assert.equal(signedIn.config.locale, expected)
    assert.equal(saved.config.locale, expected)
    const restored = new DesktopService({ systemLanguages: ['zh-TW'], storage, fetcher })
    assert.equal((await restored.state()).config.locale, expected)
    assert.equal(restored.profile.user.id, 'user')
    assert.doesNotMatch(JSON.stringify(restored.snapshot()), /refresh-fixture/)
  }
})

test('restored account preferences update an old English default and refresh without resetting the workspace', async () => {
  let preferredLanguage = 'zh-CN'
  const service = new DesktopService({
    systemLanguages: ['en-US'],
    storage: {
      read: () => ({ config: DEFAULT_CONFIG, credentials: { token: 'fixture', refreshToken: 'refresh-fixture' } }),
      write() {}
    },
    fetcher: async () =>
      new Response(
        JSON.stringify({ user: { id: 'user', preferredLanguage }, organizations: [{ id: 'org', name: 'Workspace' }] })
      )
  })
  assert.equal(service.config.locale, 'en')
  assert.equal((await service.state()).config.locale, 'zh-Hans')
  const generation = service.generation
  preferredLanguage = 'ja'
  assert.equal((await service.refreshProfile()).config.locale, 'ja')
  assert.equal(service.profile.organizationId, 'org')
  assert.equal(service.generation, generation)
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

test('localized descriptions decode serialized I18nObject and keep literal text intact', () => {
  const description = {
    en_US: 'Video editor',
    zh_Hans: '\u89c6\u9891\u7f16\u8f91\u5668',
    zh_Hant: '\u5f71\u7247\u7de8\u8f2f\u5668',
    ja_JP: '\u52d5\u753b\u30a8\u30c7\u30a3\u30bf\u30fc'
  }
  for (const [locale, expected] of [
    ['en-US', description.en_US],
    ['zh_CN', description.zh_Hans],
    ['zh-TW', description.zh_Hant],
    ['ja', description.ja_JP]
  ]) {
    assert.equal(localizedText(description, locale), expected)
    assert.equal(localizedText(`  ${JSON.stringify(description)}  `, locale), expected)
  }
  assert.equal(localizedText('{"en_US":"English fallback"}', 'ja'), 'English fallback')
  assert.equal(localizedText('{"en_US":"","zh_Hans":"  ","fr":"Bonjour"}', 'zh-Hans'), 'Bonjour')
  assert.equal(localizedText('{"en_US":"","zh_Hans":""}', 'zh-Hans'), '')
  for (const literal of [
    'Plain description with {braces}',
    '{"en_US":',
    '{"title":"JSON example"}',
    '{"en_US":{"nested":"invalid translation"}}',
    '["one", "two"]',
    'null',
    '{}'
  ])
    assert.equal(localizedText(literal, 'zh-Hans'), literal)
})

test('catalog and sidebar descriptions resolve serialized translations at the host boundary', async () => {
  const description = { en_US: 'Video editor', zh_Hans: '\u89c6\u9891\u7f16\u8f91\u5668' }
  const serialized = JSON.stringify(description)
  const bot = { id: 'expert', name: 'Editor', description: serialized }
  const service = new DesktopService({
    fetcher: async (url) => {
      const pathname = new URL(url).pathname
      if (pathname === '/api/xpert-marketplace')
        return new Response(
          JSON.stringify({
            items: [
              { xpert: bot, marketplace: { summary: serialized }, accessStatus: 'owned' },
              { xpert: { ...bot, id: 'fallback' }, marketplace: {}, accessStatus: 'owned' }
            ],
            total: 2
          })
        )
      if (pathname === '/api/plugin-applications/catalog')
        return new Response(
          JSON.stringify([
            {
              application: {
                id: 'app',
                pluginName: 'plugin',
                appName: 'editor',
                displayName: 'Editor',
                description: serialized,
                config: { presentation: { tagline: serialized } }
              },
              status: { status: 'not_installed' }
            }
          ])
        )
      if (pathname === '/api/xpert-template/catalog')
        return new Response(JSON.stringify({ items: [{ ...bot, type: 'agent' }], total: 1 }))
      assert.equal(pathname, '/api/mobile/xperts')
      return new Response(JSON.stringify({ items: [bot], total: 1 }))
    }
  })
  service.credentials = { token: 'fixture' }
  service.profile = { user: { id: 'user', tenantId: 'tenant' }, organizationId: 'org' }
  for (const [locale, expected] of [
    ['zh-Hans', description.zh_Hans],
    ['en', description.en_US]
  ]) {
    service.configure({ ...service.config, locale })
    for (const kind of ['experts', 'applications', 'templates']) {
      const items = await service.listCatalog(kind)
      assert.ok(items.length)
      assert.ok(
        items.every((item) => item.description === expected),
        kind
      )
    }
    assert.equal((await service.listBots())[0].description, expected)
  }
})
