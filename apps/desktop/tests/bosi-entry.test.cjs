const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync, existsSync } = require('node:fs')
const { resolve, dirname } = require('node:path')
const { runInNewContext } = require('node:vm')
const ts = require('typescript')
const React = require('react')
const { JSDOM } = require('jsdom')

async function mount(t, { compact = false, membershipRequired = false } = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' })
  const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT }
  global.window = dom.window
  global.document = dom.window.document
  global.IS_REACT_ACT_ENVIRONMENT = true
  const src = resolve(__dirname, '../src')
  const calls = []
  const sidebar = { width: 240, collapsed: compact, items: [], copies: [], sections: [] }
  const fragment = ({ children }) => children
  const noop = () => null
  const ui = {
    Button: ({ variant, size, ...props }) => React.createElement('button', props),
    Input: 'input',
    ContextMenu: fragment,
    ContextMenuTrigger: ({ children }) => React.cloneElement(children, { 'data-context-trigger': true }),
    ContextMenuContent: noop,
    ContextMenuItem: noop,
    ContextMenuSub: noop,
    ContextMenuSubTrigger: noop,
    ContextMenuSubContent: noop,
    ContextMenuCheckboxItem: noop,
    ContextMenuSeparator: noop
  }
  const modules = new Map()
  const overrides = {
    i18n: { t: (key, args) => key.replace('{{name}}', args?.name ?? '') },
    host: {
      invoke: async (...args) => {
        calls.push(args)
        throw new Error('Unexpected host call')
      }
    },
    WorkspaceSwitcher: { WorkspaceSwitcher: noop },
    'groups/DesktopAddMenu': { DesktopAddMenu: noop },
    'groups/GroupItem': { GroupItem: noop },
    'groups/useGroupList': {
      useGroupList: () => ({
        items: [],
        membershipRequired,
        reload() {
          calls.push(['reloadGroups'])
        },
        change() {}
      })
    },
    AssistantPreview: { AssistantPreview: fragment },
    AssistantDialog: { AssistantDialog: noop },
    AssistantScrollArea: { AssistantScrollArea: ({ children }) => React.createElement('div', null, children) },
    SidebarResizer: { SidebarResizer: noop },
    SidebarAccount: { SidebarAccount: noop },
    useAssistantList: {
      useAssistantList: () => ({ sidebar, activities: [], busy: false, setSidebar() {}, run() {}, refresh() {} })
    },
    avatar: { BotAvatar: () => React.createElement('svg') },
    'avatar/AnimatedAssistantAvatar': { AnimatedAssistantAvatar: () => React.createElement('svg') }
  }
  const load = (file) => {
    if (modules.has(file)) return modules.get(file)
    const exports = {}
    modules.set(file, exports)
    const code = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
    }).outputText
    runInNewContext(code, {
      exports,
      window: dom.window,
      document: dom.window.document,
      require(id) {
        if (id === 'react' || id === 'react/jsx-runtime') return require(id)
        if (id === '@xpert-ai/shadcn-ui') return ui
        if (id === '@xpert-ai/contracts') return { orderAssistantXperts: (items) => items }
        if (id === 'lucide-react') return new Proxy({}, { get: () => noop })
        const path = resolve(dirname(file), id)
        const key = path.slice(src.length + 1).replace(/\.tsx?$/, '')
        if (overrides[key]) return overrides[key]
        const target = [path, `${path}.tsx`, `${path}.ts`].find(existsSync)
        if (!target) throw new Error(`Unknown import ${id}`)
        return load(target)
      }
    })
    return exports
  }
  const { Sidebar } = load(resolve(src, 'Sidebar.tsx'))
  const bosi = { id: 'bosi-real', name: 'Bosi', description: '', avatarUrl: null, avatarEmoji: null }
  const other = { id: 'other', name: 'Other', description: '', avatarUrl: null, avatarEmoji: null }
  let opened = 0
  const selections = []
  const props = {
    state: { config: { apiUrl: 'http://localhost:3000' }, profile: { user: { id: 'user' }, organizationId: 'org' } },
    bots: [other],
    selected: 'other',
    workspaceId: '',
    workspaces: [],
    pending: false,
    error: '',
    groupRevision: 0,
    bosi: {
      bot: null,
      initialized: false,
      selected: false,
      onSelect: () => {
        opened++
      }
    },
    onSelect: (id) => selections.push(id)
  }
  const root = require('react-dom/client').createRoot(document.getElementById('root'))
  const render = () => React.act(async () => root.render(React.createElement(Sidebar, props)))
  const visibleRoot = () =>
    compact
      ? document.getElementById('bot-sidebar-content').previousElementSibling
      : document.getElementById('bot-sidebar-content')
  const buttons = (name) =>
    [...visibleRoot().querySelectorAll('button')].filter((item) => item.getAttribute('aria-label') === name)
  await render()
  t.after(async () => {
    await React.act(async () => root.unmount())
    dom.window.close()
    global.window = previous.window
    global.document = previous.document
    global.IS_REACT_ACT_ENVIRONMENT = previous.act
  })
  return { props, bosi, other, render, buttons, calls, selections, opened: () => opened }
}

for (const compact of [false, true]) {
  test(`organization membership notice keeps Bosi available (${compact ? 'collapsed' : 'expanded'})`, async (t) => {
    const view = await mount(t, { compact, membershipRequired: true })
    const root = compact
      ? document.getElementById('bot-sidebar-content').previousElementSibling
      : document.getElementById('bot-sidebar-content')
    const refresh = [...root.querySelectorAll('button')].find((button) =>
      (button.getAttribute('aria-label') || button.textContent).includes('Refresh after joining')
    )
    assert.ok(refresh)
    assert.ok(view.buttons('Bosi')[0])
    assert.equal(root.querySelector('[role="alert"]'), null)
    if (!compact)
      assert.match(root.querySelector('[role="status"]').textContent, /You have not joined this organization/)
    await React.act(async () => refresh.click())
    assert.deepEqual(view.calls, [['reloadGroups']])
    await React.act(async () => view.buttons('Bosi')[0].click())
    assert.equal(view.opened(), 1)
  })
  test(`Bosi uses the regular assistant row and routes setup without a fake Bot (${compact ? 'collapsed' : 'expanded'})`, async (t) => {
    const view = await mount(t, { compact })
    const bosiButton = view.buttons('Bosi')[0]
    const otherButton = view.buttons('Other')[0]
    assert.ok(bosiButton)
    assert.ok(otherButton)
    assert.equal(bosiButton.className, otherButton.className)
    // Selection is the only row-style difference from the already selected assistant.
    assert.equal(
      bosiButton.parentElement.className.replace('hover:bg-muted', 'bg-primary/10'),
      otherButton.parentElement.className
    )
    await React.act(async () => bosiButton.click())
    assert.equal(view.opened(), 1)
    assert.deepEqual(view.calls, [])
    assert.deepEqual(view.selections, [])

    view.props.bots = [view.bosi, view.other]
    view.props.bosi.bot = view.bosi
    await view.render()
    assert.equal(view.buttons('Bosi').length, 1, 'an incomplete real assistant must not duplicate its setup entry')
    await React.act(async () => view.buttons('Bosi')[0].click())
    assert.equal(view.opened(), 2)

    view.props.bosi.initialized = true
    await view.render()
    assert.equal(view.buttons('Bosi').length, 1)
    assert.equal(
      view.buttons('Bosi')[0].parentElement.dataset.contextTrigger,
      'true',
      'completed Bosi retains normal assistant actions'
    )
    await React.act(async () => view.buttons('Bosi')[0].click())
    assert.deepEqual(view.selections, ['bosi-real'])
  })
}
