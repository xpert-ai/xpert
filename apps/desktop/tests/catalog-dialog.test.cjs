const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { createRequire } = require('node:module')
const { runInNewContext } = require('node:vm')
const ts = require('typescript')
const React = require('react')
const { JSDOM } = require('jsdom')
const { createCatalogCache } = require('../src/catalog/catalog-cache.ts')
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
  function renderer(file) {
    if (modules.has(file)) return modules.get(file)
    const exports = {}
    modules.set(file, exports)
    const imports = {
      './host': host,
      './i18n': { t: (key) => key },
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
      './catalog/catalog-cache': { createCatalogCache },
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
      './catalog/ModelSelect': { ModelSelect: () => null },
      './catalog/TemplateRequirements': { TemplateRequirements: () => null },
      './PluginInstallDialog': { PluginInstallDialog: () => null }
    }
    const code = ts.transpileModule(readFileSync(join(__dirname, '../src', file), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
    }).outputText
    runInNewContext(code, {
      exports,
      Error,
      crypto: global.crypto,
      require(id) {
        if (Object.hasOwn(imports, id)) return imports[id]
        if (['react', 'react/jsx-runtime'].includes(id)) return require(id)
        if (['./CatalogSetup', './PluginCatalog'].includes(id)) return renderer(id.slice(2) + '.tsx')
        if (id === './catalog-labels') return renderer('catalog-labels.ts')
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
          e(CatalogDialog, { key, organization: key, webUrl: 'http://localhost', onClose() {}, onUse })
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
    dom,
    count: (method, input) =>
      calls.filter((call) => call.method === method && (input === undefined || call.input === input)).length
  }
}

function defaultResult(method, input) {
  if (method === 'listCatalog') return input === 'applications' ? [app] : input === 'experts' ? [expert] : []
  if (method === 'pluginLibrary') return { ...library, workspaceId: input.workspaceId || 'one' }
  throw new Error(`Unexpected host call: ${method}`)
}

test('dialog caches tabs, reuses the plugin mount and workspace, refreshes explicitly, and resets with organization', async (t) => {
  const view = await mountCatalog(t, defaultResult)
  assert.equal(view.count('listCatalog', 'experts'), 1, 'StrictMode replay shares the pending load')
  await view.click('Apps')
  await view.click('Plugins')
  assert.equal(view.count('pluginLibrary'), 1, 'plugin StrictMode replay shares the request')
  const section = document.querySelector('[aria-label="Workspace plugin library"]')
  const select = document.querySelector('select')
  await React.act(async () => {
    select.value = 'two'
    select.dispatchEvent(new view.dom.window.Event('change', { bubbles: true }))
  })
  await view.click('Agent templates')
  await view.click('Apps')
  await view.click('Plugins')
  assert.equal(document.querySelector('[aria-label="Workspace plugin library"]'), section)
  assert.equal(document.querySelector('select').value, 'two')
  assert.equal(view.count('pluginLibrary'), 2, 'returning to the plugin tab does not reload')
  assert.equal(view.count('listCatalog', 'applications'), 1)
  await view.click('Refresh catalog')
  assert.equal(view.count('pluginLibrary'), 3)
  await view.click('Apps')
  await view.click('Refresh catalog')
  assert.equal(view.count('listCatalog', 'applications'), 2)
  await view.render('organization-two')
  assert.equal(view.count('listCatalog', 'experts'), 2)
  assert.equal(document.querySelector('[aria-label="Workspace plugin library"]'), null)
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
          requireVision: false
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
          requireVision: false
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
