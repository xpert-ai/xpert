const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join, dirname, posix } = require('node:path')
const { createRequire } = require('node:module')
const { runInNewContext } = require('node:vm')
const ts = require('typescript')
const React = require('react')
const { JSDOM } = require('jsdom')
const { createCatalogCache } = require('../src/catalog/catalog-cache.ts')
const { subscribeAppActivation } = require('../src/app-activation.ts')
const { catalogBusinessAreas, matchesBusinessArea } = require('../src/catalog/business-area-filter.ts')
// Match Vite's React deduplication instead of resolving Radix's nested peer copy in Node.
const uiRequire = createRequire(join(__dirname, '../../../packages/shadcn-ui/package.json'))
const radixRequire = createRequire(uiRequire.resolve('radix-ui'))
const viteRequire = createRequire(require.resolve('vite/package.json'))
const tabsCode = viteRequire('esbuild').buildSync({
  entryPoints: [radixRequire.resolve('@radix-ui/react-tabs')],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  external: ['react', 'react-dom', 'react/jsx-runtime']
}).outputFiles[0].text

const app = {
  id: 'meetings',
  name: 'Meetings',
  kind: 'applications',
  publisher: 'Xpert',
  description: 'Meeting notes',
  categories: [],
  tags: [],
  screenshots: [],
  icon: null,
  pluginName: 'meetings',
  appName: 'meetings',
  status: 'not_installed',
  botId: null,
  steps: [],
  summary: 'Meeting notes'
}
const expert = {
  id: 'expert',
  name: 'Meeting expert',
  kind: 'experts',
  publisher: 'Xpert',
  description: 'Expert',
  categories: [],
  tags: [],
  access: 'not_requested'
}
const library = {
  workspaceId: 'one',
  workspaces: [
    { id: 'one', name: 'First workspace' },
    { id: 'two', name: 'Second workspace' }
  ],
  experts: [],
  items: [
    { id: 'plugin', name: 'Meeting tools', description: 'Tools', status: 'available', components: [], version: '1' }
  ]
}

// Exercise the actual catalog components and Radix tab lifecycle; replace only presentation and host I/O.
async function mountCatalog(t, handler, onUse = async () => {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true })
  const activations = new Set()
  dom.window.xpertDesktop = {
    onWindowActivated: (listener) => {
      activations.add(listener)
      return () => activations.delete(listener)
    }
  }
  const keys = [
    'window',
    'document',
    'HTMLElement',
    'Node',
    'MutationObserver',
    'CustomEvent',
    'getComputedStyle',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'IS_REACT_ACT_ENVIRONMENT'
  ]
  const previous = Object.fromEntries(keys.map((key) => [key, Object.getOwnPropertyDescriptor(global, key)]))
  for (const key of keys)
    Object.defineProperty(global, key, {
      configurable: true,
      writable: true,
      value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key]
    })
  const tabsModule = { exports: {} }
  new Function('require', 'module', 'exports', tabsCode)(require, tabsModule, tabsModule.exports)
  const Tabs = tabsModule.exports
  const e = React.createElement
  const element =
    (tag) =>
    ({
      children,
      asChild,
      variant,
      size,
      open,
      onOpenChange,
      showCloseButton,
      onEscapeKeyDown,
      onInteractOutside,
      openDelay,
      closeDelay,
      collisionPadding,
      side,
      align,
      ...props
    }) =>
      asChild ? children : e(tag, props, children)
  const ui = {
    Button: ({ type = 'button', ...props }) => element('button')({ type, ...props }),
    Input: element('input'),
    Label: element('label'),
    Textarea: element('textarea'),
    Checkbox: ({ checked, onCheckedChange, ...props }) =>
      e('input', { ...props, type: 'checkbox', checked, onChange: (event) => onCheckedChange(event.target.checked) }),
    Select: ({ children, value, onValueChange, disabled }) => {
      const trigger = React.Children.toArray(children).find((child) => child.type === ui.SelectTrigger)
      return e(
        'select',
        { id: trigger?.props.id, value, disabled, onChange: (event) => onValueChange(event.target.value) },
        e('option', { value: '' }, 'Select'),
        children
      )
    },
    SelectTrigger: () => null,
    SelectValue: () => null,
    SelectContent: ({ children }) => e(React.Fragment, {}, children),
    SelectItem: ({ children, value }) => e('option', { value }, children),
    Dialog: element('section'),
    DialogContent: element('div'),
    DialogHeader: element('header'),
    DialogTitle: element('h1'),
    DialogDescription: element('p'),
    Tabs: Tabs.Root,
    TabsList: ({ variant, ...props }) => e(Tabs.List, props),
    TabsTrigger: Tabs.Trigger,
    TabsContent: Tabs.Content,
    HoverCard: element('div'),
    HoverCardTrigger: element('span'),
    HoverCardContent: () => null
  }
  const calls = []
  const host = {
    HostError: class HostError extends Error {},
    openWorkspace() {},
    invoke: async (method, input) => {
      calls.push({ method, input })
      return handler(method, input)
    }
  }
  const modules = new Map()
  let locale = 'en'
  function renderer(file) {
    if (modules.has(file)) return modules.get(file)
    const exports = {}
    modules.set(file, exports)
    const imports = {
      './host': host,
      './i18n': { t: (key) => key, getLocale: () => locale, useLocale: () => locale },
      '@xpert-ai/template-installation-client': require('./helpers/template-installation.cjs'),
      './app-activation': { subscribeAppActivation },
      '@xpert-ai/shadcn-ui': ui,
      'lucide-react': Object.fromEntries(
        [
          'ArrowLeft',
          'ArrowUpRight',
          'LoaderCircle',
          'Plus',
          'RefreshCw',
          'Search',
          'X',
          'Check',
          'ExternalLink',
          'Info'
        ].map((name) => [name, () => null])
      ),
      './avatar': { BotAvatar: () => null, PluginAvatar: () => null },
      './catalog/CatalogAvatar': { CatalogAvatar: () => null },
      './catalog/catalog-cache': { createCatalogCache },
      './catalog/template-source': require('../src/catalog/template-source.ts'),
      './catalog/business-area-filter': { catalogBusinessAreas, matchesBusinessArea },
      './catalog/blank-assistant': {
        blankAssistant: () => ({ id: 'blank', kind: 'templates', name: '', categories: [], tags: [] })
      },
      './catalog/ApplicationCard': {
        ApplicationCard: ({ item, onDetails, onUse }) =>
          e(
            'article',
            { 'data-app': item.id },
            e('span', { 'data-status': item.status }, item.status),
            e('button', { onClick: onDetails }, item.name),
            e('button', { onClick: onUse }, 'Use app')
          )
      },
      './ApplicationScreenshots': { ApplicationScreenshots: () => null },
      './CatalogCombobox': {
        CatalogCombobox: ({ items, value, label, onChange, disabled }) =>
          e(
            'select',
            { 'aria-label': label, value, disabled, onChange: (event) => onChange(event.target.value) },
            items.map((item) => e('option', { key: item.id, value: item.id }, item.name))
          )
      },
      './catalog/ModelCascader': { ModelCascader: () => null },
      './catalog/TemplateRequirements': { TemplateRequirements: () => null },
      './PluginInstallDialog': { PluginInstallDialog: () => null }
    }
    const code = ts.transpileModule(readFileSync(join(__dirname, '../src', file), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
    }).outputText
    runInNewContext(code, {
      exports,
      window: dom.window,
      Error,
      crypto: global.crypto,
      require(id) {
        if (Object.hasOwn(imports, id)) return imports[id]
        if (id === '../host') return host
        if (id === '../i18n') return imports['./i18n']
        if (['../../electron/workbench-platform.mjs', '../electron/workbench-platform.mjs'].includes(id))
          return { platformCommandUrl: () => 'http://localhost/connectors' }
        if (['react', 'react/jsx-runtime'].includes(id)) return require(id)
        if (['./CatalogSetup', './PluginCatalog'].includes(id)) return renderer(id.slice(2) + '.tsx')
        if (id === './catalog-labels') return renderer('catalog-labels.ts')
        if (id.endsWith('/application-toolsets')) return require('../src/catalog/application-toolsets.ts')
        if (
          [
            './catalog/ApplicationToolsets',
            './ApplicationToolsetEditor',
            './catalog/TemplateInstallation',
            './catalog/TemplateManifestDetails',
            './catalog/TemplateOverview'
          ].includes(id)
        )
          return renderer(posix.normalize(posix.join(dirname(file), id)) + '.tsx')
        throw new Error(`Unexpected import: ${id}`)
      }
    })
    return exports
  }
  const { CatalogDialog } = renderer('CatalogDialog.tsx')
  const root = require('react-dom/client').createRoot(document.getElementById('root'))
  t.after(async () => {
    await React.act(async () => root.unmount())
    dom.window.close()
    for (const key of keys) {
      if (previous[key]) Object.defineProperty(global, key, previous[key])
      else delete global[key]
    }
  })
  const render = async (key) =>
    React.act(async () =>
      root.render(
        e(
          React.StrictMode,
          {},
          e(CatalogDialog, {
            key,
            installationScope: key,
            organizationId: key,
            organization: key,
            webUrl: 'http://localhost',
            onClose() {},
            onUse
          })
        )
      )
    )
  const click = async (name) => {
    const button = Array.from(document.querySelectorAll('button')).find(
      (item) =>
        !item.closest('[hidden]') && (item.getAttribute('aria-label') === name || item.textContent.trim() === name)
    )
    assert.ok(button, `Missing button: ${name}`)
    await React.act(async () => {
      button.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, button: 0 }))
      button.click()
    })
  }
  await render('organization-one')
  return {
    calls,
    click,
    render,
    setLocale: async (value) => {
      locale = value
      await render('organization-one')
    },
    dom,
    activate: () => React.act(async () => activations.forEach((listener) => listener())),
    count: (method, input) =>
      calls.filter((call) => call.method === method && (input === undefined || call.input === input)).length
  }
}

function defaultResult(method, input) {
  if (method === 'listCatalog') return input === 'applications' ? [app] : input === 'experts' ? [expert] : []
  if (method === 'templateCatalogPage') return { items: [], nextOffset: null }
  if (method === 'pluginLibrary') return library
  throw new Error(`Unexpected host call: ${method}`)
}

test('other discovery tabs still update activation-dependent access and installation status', async (t) => {
  const view = await mountCatalog(t, defaultResult)
  await view.activate()
  assert.equal(view.count('listCatalog', 'experts'), 2)
  await view.click('Apps')
  await view.activate()
  assert.equal(view.count('listCatalog', 'applications'), 2)
  await view.click('Plugins')
  await view.activate()
  assert.equal(view.count('pluginLibrary'), 2)
})

test('dialog caches the installation catalog without workspace controls, refreshes explicitly, and resets with organization', async (t) => {
  const view = await mountCatalog(t, defaultResult)
  assert.equal(view.count('listCatalog', 'experts'), 1, 'StrictMode replay shares the pending load')
  await view.click('Apps')
  await view.click('Plugins')
  assert.equal(view.count('pluginLibrary'), 1, 'plugin StrictMode replay shares the request')
  const section = document.querySelector('[aria-label="Installed plugins"]')
  assert.equal(document.querySelector('select'), null)
  await view.click('Agent templates')
  await view.click('Apps')
  await view.click('Plugins')
  assert.equal(document.querySelector('[aria-label="Installed plugins"]'), section)
  assert.equal(view.count('pluginLibrary'), 1, 'returning to the plugin tab does not reload')
  assert.equal(view.count('listCatalog', 'applications'), 1)
  await view.click('Refresh catalog')
  assert.equal(view.count('pluginLibrary'), 2)
  await view.click('Apps')
  await view.click('Refresh catalog')
  assert.equal(view.count('listCatalog', 'applications'), 2)
  await view.render('organization-two')
  assert.equal(view.count('listCatalog', 'experts'), 2)
  assert.equal(document.querySelector('[aria-label="Installed plugins"]'), null)
  await view.click('Apps')
  assert.equal(view.count('listCatalog', 'applications'), 3)
})

test('refreshing application settings updates its cached status without reloading or remounting the list', async (t) => {
  let ready = false
  const view = await mountCatalog(t, (method, input) =>
    method === 'applicationSetup'
      ? {
          application: { ...app, status: ready ? 'ready' : 'initializing', botId: ready ? 'bot' : null },
          canInitialize: false,
          reason: '',
          defaultEmbeddingModelId: '',
          defaultVisionModelId: '',
          requireEmbedding: false,
          requireVision: false,
          embeddingModels: [],
          visionModels: [],
          toolsetRequirements: []
        }
      : defaultResult(method, input)
  )
  await view.click('Apps')
  const card = document.querySelector('[data-app="meetings"]')
  await view.click('Meetings')
  assert.equal(card.querySelector('[data-status]').dataset.status, 'initializing')
  ready = true
  await view.click('Refresh settings')
  assert.ok(document.querySelector('form').textContent.includes('Installation complete.'))
  await view.click('Back to catalog')
  assert.equal(document.querySelector('[data-app="meetings"]'), card)
  assert.equal(card.querySelector('[data-status]').dataset.status, 'ready')
  assert.equal(view.count('listCatalog', 'applications'), 1)
})

test('a completed installation invalidates catalogs even if opening the assistant fails', async (t) => {
  let installed = false
  const view = await mountCatalog(
    t,
    (method, input) => {
      if (method === 'initializeApplication') {
        installed = true
        return { botId: 'bot' }
      }
      if (method === 'applicationSetup')
        return {
          application: app,
          canInitialize: true,
          reason: '',
          defaultEmbeddingModelId: '',
          defaultVisionModelId: '',
          requireEmbedding: false,
          requireVision: false,
          embeddingModels: [],
          visionModels: [],
          toolsetRequirements: []
        }
      if (method === 'listCatalog' && input === 'applications')
        return [{ ...app, status: installed ? 'ready' : 'not_installed', botId: installed ? 'bot' : null }]
      return defaultResult(method, input)
    },
    async () => {
      throw new Error('Assistant not published yet')
    }
  )
  await view.click('Plugins')
  await view.click('Apps')
  await view.click('Meetings')
  await view.click('Install & use')
  assert.ok(document.querySelector('form').textContent.includes('Assistant not published yet'))
  assert.equal(view.count('initializeApplication'), 1)
  assert.equal(view.count('pluginLibrary'), 2, 'installation refreshes the previously visited plugin catalog')
  await view.click('Back to catalog')
  assert.equal(document.querySelector('[data-status]').dataset.status, 'ready')
  assert.equal(view.count('listCatalog', 'applications'), 2)
  await view.click('Digital experts')
  assert.equal(view.count('listCatalog', 'experts'), 2)
})

test('app tool selection blocks installation, survives refresh and submits only the selected configuration', async (t) => {
  let revoked = false
  const setup = () => ({
    application: app,
    canInitialize: true,
    canConfigure: true,
    reason: '',
    defaultEmbeddingModelId: '',
    defaultVisionModelId: '',
    embeddingModels: [],
    visionModels: [],
    requireEmbedding: false,
    requireVision: false,
    toolsetRequirements: [
      {
        key: 'images',
        label: 'Image tools',
        provider: 'seedream',
        providerAvailable: true,
        options: revoked ? [] : [{ id: 'chosen', name: 'Seedream', workspaceName: 'Organization' }]
      }
    ]
  })
  const view = await mountCatalog(t, (method, input) => {
    if (method === 'applicationSetup') return setup()
    if (method === 'initializeApplication') return { botId: 'installed' }
    return defaultResult(method, input)
  })
  await view.click('Apps')
  await view.click('Meetings')
  const submit = () => document.querySelector('button[type="submit"]')
  assert.equal(submit().disabled, true)
  await React.act(async () => {
    const select = document.getElementById('app-toolset-images')
    select.value = 'chosen'
    select.dispatchEvent(new view.dom.window.Event('change', { bubbles: true }))
  })
  assert.equal(submit().disabled, false)
  await view.click('Refresh settings')
  assert.equal(document.getElementById('app-toolset-images').value, 'chosen')
  revoked = true
  await view.click('Refresh settings')
  assert.equal(submit().disabled, true)
  assert.equal(document.getElementById('app-toolset-images').value, '')
  revoked = false
  await view.click('Refresh settings')
  assert.equal(submit().disabled, true, 'an available configuration is not silently selected')
  await React.act(async () => {
    const select = document.getElementById('app-toolset-images')
    select.value = 'chosen'
    select.dispatchEvent(new view.dom.window.Event('change', { bubbles: true }))
  })
  await view.click('Install & use')
  assert.deepEqual(
    JSON.parse(JSON.stringify(view.calls.find((call) => call.method === 'initializeApplication').input.toolsets)),
    [{ key: 'images', toolsetId: 'chosen' }]
  )
})

test('native tool configuration requires an enabled tool and refreshes the saved app binding', async (t) => {
  let saved = false
  const view = await mountCatalog(t, (method, input) => {
    if (method === 'applicationSetup')
      return {
        application: { ...app, status: saved ? 'configuring' : 'not_installed' },
        canInitialize: saved,
        canConfigure: true,
        reason: '',
        defaultEmbeddingModelId: '',
        defaultVisionModelId: '',
        embeddingModels: [],
        visionModels: [],
        requireEmbedding: false,
        requireVision: false,
        toolsetRequirements: [
          {
            key: 'images',
            label: 'Image tools',
            provider: 'seedream',
            providerAvailable: true,
            configuredToolsetId: saved ? 'managed' : undefined,
            options: saved ? [{ id: 'managed', name: 'Images' }] : []
          }
        ]
      }
    if (method === 'applicationToolsetSetup')
      return {
        name: 'Images',
        supported: true,
        fields: [],
        tools: [{ name: 'generate_image', label: 'Generate image', enabled: false }]
      }
    if (method === 'saveApplicationToolset') {
      saved = true
      return { key: 'images', toolsetId: 'managed' }
    }
    return defaultResult(method, input)
  })
  await view.click('Apps')
  await view.click('Meetings')
  await view.click('New configuration')
  assert.equal(document.querySelector('button[type="submit"]').disabled, true)
  const save = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Save configuration')
  assert.equal(save.disabled, true)
  await React.act(async () => document.getElementById('app-tool-generate_image').click())
  assert.equal(save.disabled, false)
  await view.click('Save configuration')
  const call = view.calls.find((call) => call.method === 'saveApplicationToolset')
  assert.deepEqual(Array.from(call.input.tools), ['generate_image'])
  assert.equal(call.input.name, 'Images')
  assert.equal(document.getElementById('app-toolset-images').value, 'managed')
  assert.equal(document.querySelector('button[type="submit"]').disabled, false)
  assert.equal(view.count('initializeApplication'), 0)
})

const template = { ...expert, kind: 'templates', id: 'template', name: 'Installable template' }
const installation = {
  id: 'operation',
  templateId: 'template',
  workspaceId: 'one',
  status: 'failed',
  stage: 'publishing',
  attempt: 1,
  publish: true,
  assistantId: 'assistant',
  retryable: true,
  resourceInstallationIds: [],
  pendingAuthInstallationIds: [],
  createdAt: '2026-10-13',
  updatedAt: '2026-10-13',
  error: { code: 'INSTALL_FAILED', message: 'Publish failed' }
}
const templateResult = (method, input) => {
  if (method === 'templateCatalogPage') return { items: [template], nextOffset: null }
  if (method === 'templateOverview')
    return {
      id: 'template',
      title: 'Installable template',
      publisher: 'Author',
      description: 'Work',
      instructions: 'Prepare drafts',
      memories: [],
      skills: [],
      agents: [],
      routines: [],
      integrations: []
    }
  if (method === 'templateSetup')
    return {
      workspaces: library.workspaces,
      hasPrimaryLanguageModel: true,
      preflight: {
        canInstall: true,
        requiresModel: false,
        models: [],
        optionalCapabilities: [],
        realtimeModels: [],
        requiredModelFeatures: []
      }
    }
  if (method === 'listTemplateInstallations') return { items: [], total: 0 }
  return defaultResult(method, input)
}
test('native reactivation preserves template cards, filters and scroll without fetching again', async (t) => {
  const view = await mountCatalog(t, templateResult)
  await view.click('Agent templates')
  await view.click('Other sources 1')
  const card = [...document.querySelectorAll('button')].find((button) => button.textContent === 'View template')
  const panel = card.closest('[role="tabpanel"]')
  panel.scrollTop = 320
  const before = view.calls.length
  for (let index = 0; index < 5; index++) {
    await view.activate()
    view.dom.window.dispatchEvent(new view.dom.window.Event('focus'))
  }
  assert.equal(view.calls.length, before)
  assert.equal(card.isConnected, true)
  assert.equal(panel.scrollTop, 320)
  assert.equal(
    document.querySelector('[aria-label="Template sources"] [aria-pressed="true"]').textContent.trim(),
    'Other sources 1'
  )
  await view.click('Apps')
  await view.click('Agent templates')
  assert.equal(view.count('templateCatalogPage'), 1)
  await view.click('Refresh catalog')
  assert.equal(view.count('templateCatalogPage'), 2, 'explicit refresh still fetches fresh data')
})

test('manual template refresh keeps existing cards mounted while the response is pending', async (t) => {
  let finish
  let reads = 0
  const view = await mountCatalog(t, (method, input) => {
    if (method === 'templateCatalogPage' && ++reads > 1) return new Promise((resolve) => (finish = resolve))
    return templateResult(method, input)
  })
  await view.click('Agent templates')
  const card = [...document.querySelectorAll('button')].find((button) => button.textContent === 'View template')
  await view.click('Refresh catalog')
  assert.equal(card.isConnected, true)
  assert.equal(document.querySelector('[aria-label="Refresh catalog"]').disabled, true)
  await React.act(async () => finish({ items: [template], nextOffset: null }))
  assert.equal(card.isConnected, true)
})

test('required missing template dependencies block install and display the selected version and file scope', async (t) => {
  const view = await mountCatalog(t, (method, input) => {
    const result = templateResult(method, input)
    if (method === 'templateSetup')
      return {
        ...result,
        preflight: {
          ...result.preflight,
          canInstall: false,
          reason: 'Missing dependency',
          readiness: {
            legacy: false,
            canInstall: false,
            manifestVersion: '1.0.0',
            dependencies: [],
            checks: [
              {
                kind: 'plugin',
                key: 'required-plugin',
                required: true,
                status: 'missing',
                message: 'Missing dependency',
                version: '2.0.0'
              }
            ],
            files: { scope: 'user', entries: [{ kind: 'ledger', path: 'office/tasks.json', version: '1.0' }] }
          }
        }
      }
    return result
  })
  await view.click('Agent templates')
  await view.click('View template')
  await view.click('Import Assistant')
  assert.match(document.body.textContent, /required-plugin/)
  assert.match(document.body.textContent, /2\.0\.0/)
  assert.match(document.body.textContent, /office\/tasks.json/)
  assert.equal(
    [...document.querySelectorAll('button')].find((button) => button.textContent.includes('Install & use')).disabled,
    true
  )
  assert.equal(view.count('createTemplateInstallation'), 0)
})
test('template installation preselects an authorized tenant default without a Primary lookup in the renderer', async (t) => {
  const selected = { copilotId: 'tenant-connection', model: 'eligible', modelType: 'llm' }
  let submitted
  const view = await mountCatalog(t, (method, input) => {
    if (method === 'createTemplateInstallation') {
      submitted = input
      return installation
    }
    const result = templateResult(method, input)
    if (method === 'templateSetup')
      return {
        ...result,
        hasPrimaryLanguageModel: false,
        preflight: {
          ...result.preflight,
          requiresModel: true,
          defaultModelId: 'tenant-default',
          models: [{ id: 'tenant-default', label: 'Eligible', copilotModel: selected }]
        }
      }
    return result
  })
  await view.click('Agent templates')
  await view.click('View template')
  await view.click('Import Assistant')
  const button = [...document.querySelectorAll('button')].find((item) => item.textContent.includes('Install & use'))
  assert.equal(button.disabled, false)
  await view.click('Install & use')
  assert.deepEqual(JSON.parse(JSON.stringify(submitted.basic.copilotModel)), selected)
})
test('template setup resumes the same failed operation and restores it when reopened without reinstalling', async (t) => {
  let current = installation
  let opened
  const view = await mountCatalog(
    t,
    (method, input) => {
      if (method === 'createTemplateInstallation') return current
      if (method === 'retryTemplateInstallation')
        return (current = {
          ...installation,
          status: 'succeeded',
          stage: 'completed',
          retryable: false,
          error: null,
          attempt: 2,
          pendingAuthInstallationIds: ['connection']
        })
      if (method === 'getTemplateInstallation') return current
      return templateResult(method, input)
    },
    async (id) => {
      opened = id
    }
  )
  await view.click('Agent templates')
  await view.click('View template')
  await view.click('Import Assistant')
  await view.click('Install & use')
  assert.match(document.body.textContent, /Publish failed/)
  assert.equal(view.count('createTemplateInstallation'), 1)
  const input = view.calls.find((c) => c.method === 'createTemplateInstallation').input
  assert.equal(input.publish, true)
  assert.equal(input.workspaceId, 'one')
  assert.ok(input.idempotencyKey)
  await view.click('Resume installation')
  assert.match(document.body.textContent, /Configuration required/)
  assert.equal(view.count('retryTemplateInstallation', 'operation'), 1)
  view.dom.window.xpertDesktop = { openPlatform: async () => false }
  await view.click('Configure connections')
  assert.match(document.body.textContent, /The operation failed. Please retry./)
  let target
  view.dom.window.xpertDesktop.openPlatform = async (value) => {
    target = value
    return true
  }
  await view.click('Configure connections')
  assert.equal(target.target, 'workspace.connectors.manage')
  assert.equal(target.workspaceId, 'one')
  assert.equal(target.organizationId, 'organization-one')
  assert.doesNotMatch(document.body.textContent, /The operation failed. Please retry./)
  await view.click('Back to catalog')
  await view.click('View template')
  await view.click('Import Assistant')
  assert.match(document.body.textContent, /Configuration required/)
  assert.equal(view.count('createTemplateInstallation'), 1)
  await view.click('Open assistant')
  assert.equal(opened, 'assistant')
  await view.render('organization-two')
  await view.click('Agent templates')
  await view.click('View template')
  await view.click('Import Assistant')
  assert.doesNotMatch(document.querySelector('form').textContent, /Configuration required/)
})
test('source-changed history shows the error without a resume action', async (t) => {
  const operation = {
    ...installation,
    retryable: false,
    error: { code: 'SOURCE_CHANGED', message: 'Template changed' }
  }
  const view = await mountCatalog(t, (method, input) => {
    if (method === 'listTemplateInstallations') return { items: [operation], total: 1 }
    if (method === 'getTemplateInstallation') return operation
    return templateResult(method, input)
  })
  await view.click('Agent templates')
  await view.click('View template')
  await view.click('Import Assistant')
  const record = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('operation'))
  assert.ok(record)
  await React.act(async () => record.click())
  assert.match(document.body.textContent, /Template changed/)
  assert.equal(
    [...document.querySelectorAll('button')].some((b) => b.textContent === 'Resume installation'),
    false
  )
  assert.equal(view.count('createTemplateInstallation'), 0)
})
test('deleted template targets retain successful history and require an explicit new installation', async (t) => {
  let current = {
    ...installation,
    status: 'succeeded',
    stage: 'completed',
    retryable: false,
    error: null,
    assistantAvailability: 'available'
  }
  let opened = 0
  const view = await mountCatalog(
    t,
    (method, input) => {
      if (method === 'createTemplateInstallation' || method === 'getTemplateInstallation') return current
      return templateResult(method, input)
    },
    async () => {
      opened++
    }
  )
  await view.click('Agent templates')
  await view.click('View template')
  await view.click('Import Assistant')
  await view.click('Install & use')
  await view.click('Back to catalog')
  current = { ...current, assistantAvailability: 'unavailable' }
  await view.click('View template')
  await view.click('Import Assistant')
  assert.match(document.body.textContent, /Installation complete/)
  assert.match(document.body.textContent, /deleted or is no longer accessible/)
  const open = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Open assistant')
  assert.equal(open.disabled, true)
  await view.click('Open assistant')
  await view.click('Refresh status')
  assert.equal(opened, 0)
  assert.equal(view.count('createTemplateInstallation'), 1)
  await view.click('Create another assistant')
  assert.doesNotMatch(document.body.textContent, /deleted or is no longer accessible/)
  current = { ...current, id: 'second', assistantId: 'second-assistant', assistantAvailability: 'available' }
  await view.click('Install & use')
  const creates = view.calls.filter((call) => call.method === 'createTemplateInstallation')
  assert.equal(creates.length, 2)
  assert.notEqual(creates[0].input.idempotencyKey, creates[1].input.idempotencyKey)
})
test('opening rechecks the target and clears errors when a new installation is selected', async (t) => {
  let current = {
    ...installation,
    status: 'succeeded',
    retryable: false,
    error: null,
    assistantAvailability: 'available'
  }
  let opened = 0
  const view = await mountCatalog(
    t,
    (method, input) => {
      if (method === 'createTemplateInstallation' || method === 'getTemplateInstallation') return current
      if (method === 'listTemplateInstallations') return { items: [current], total: 1 }
      return templateResult(method, input)
    },
    async () => {
      opened++
      throw new Error('opening failed')
    }
  )
  await view.click('Agent templates')
  await view.click('View template')
  await view.click('Import Assistant')
  await view.click('Install & use')
  current = { ...current, assistantAvailability: 'unavailable' }
  await view.click('Open assistant')
  assert.equal(opened, 0)
  assert.match(document.body.textContent, /deleted or is no longer accessible/)
  current = { ...current, assistantAvailability: 'available' }
  await view.click('Refresh status')
  await view.click('Open assistant')
  assert.match(document.body.textContent, /opening failed/)
  const record = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('operation'))
  await React.act(async () => record.click())
  assert.doesNotMatch(document.body.textContent, /opening failed/)
  await view.click('Open assistant')
  assert.match(document.body.textContent, /opening failed/)
  await view.click('Create another assistant')
  assert.doesNotMatch(document.body.textContent, /opening failed/)
})
test('late opening failures cannot contaminate a new template installation', async (t) => {
  const current = { ...installation, status: 'succeeded', retryable: false, error: null }
  let fail
  const view = await mountCatalog(
    t,
    (method, input) => {
      if (method === 'createTemplateInstallation' || method === 'getTemplateInstallation') return current
      return templateResult(method, input)
    },
    () =>
      new Promise((_resolve, reject) => {
        fail = reject
      })
  )
  await view.click('Agent templates')
  await view.click('View template')
  await view.click('Import Assistant')
  await view.click('Install & use')
  await view.click('Open assistant')
  assert.equal(typeof fail, 'function')
  await view.click('Create another assistant')
  await React.act(async () => fail(new Error('late opening failure')))
  assert.doesNotMatch(document.body.textContent, /late opening failure/)
})

test('template introduction shows four sections without setup or installation until import is requested', async (t) => {
  const calls = []
  const view = await mountCatalog(t, async (method, input) => {
    calls.push(method)
    return templateResult(method, input)
  })
  await view.click('Agent templates')
  await view.click('View template')
  assert.match(document.body.textContent, /Prepare drafts/)
  assert.equal(document.querySelector('[role="tablist"]').getAttribute('aria-orientation'), 'vertical')
  assert.equal(calls.includes('templateSetup'), false)
  assert.equal(calls.includes('installTemplate'), false)
  for (const [label, hint, content] of [
    ['Skills', 'Playbooks it can run', 'No portable skill dependencies declared.'],
    ['Routines', 'Work it can run on a schedule', 'Routines start paused.'],
    ['Integrations', 'Apps and services it can use', 'No external integrations declared.']
  ]) {
    await view.click(label + hint)
    const selected = document.querySelector('[role="tabpanel"][data-state="active"]')
    assert.ok(selected.textContent.includes(content))
  }
  await view.click('Import Assistant')
  assert.equal(calls.includes('templateSetup'), true)
  assert.equal(calls.includes('installTemplate'), false)
})

test('language changes replace cached catalog metadata without reinstalling templates', async (t) => {
  let language = 'en'
  let reads = 0
  const view = await mountCatalog(t, (method, input) => {
    if (method === 'listCatalog') return []
    if (method === 'templateCatalogPage') {
      reads++
      return {
        items: [
          {
            id: 'office',
            kind: 'templates',
            name: language === 'en' ? 'Office' : '办公室',
            description: '',
            publisher: 'Xpert',
            categories: [],
            tags: []
          }
        ],
        nextOffset: null
      }
    }
    throw new Error(`Unexpected mutation or request: ${method}`)
  })
  await view.click('Agent templates')
  assert.match(document.body.textContent, /Office/)
  const before = reads
  language = 'zh-Hans'
  await view.setLocale(language)
  assert.match(document.body.textContent, /办公室/)
  assert.doesNotMatch(document.body.textContent, /Office/)
  assert.ok(reads > before)
})
