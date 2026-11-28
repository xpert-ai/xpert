const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { runInNewContext } = require('node:vm')
const ts = require('typescript')
const React = require('react')
const { JSDOM } = require('jsdom')

const defaultBots = [
  { id: 'a', name: 'A', workspaceId: 'a' },
  { id: 'b', name: 'B', workspaceId: 'b' }
]

async function mount(
  t,
  {
    restored = { botId: 'b', threadId: 'previous-thread' },
    waitForRestore,
    bots = defaultBots,
    page,
    bosiSetup = { assistantId: null, progress: null }
  } = {}
) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' })
  const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT }
  global.window = dom.window
  global.document = dom.window.document
  global.IS_REACT_ACT_ENVIRONMENT = true
  let state = {
    config: { apiUrl: 'https://example.com', locale: 'en', theme: 'light' },
    profile: { user: { id: 'user', tenantId: 'tenant' }, organizationId: 'org', organizations: [] }
  }
  const scope = () => JSON.stringify([state.config.apiUrl, 'tenant', 'user', state.profile.organizationId])
  const saved = new Map([[scope(), restored]])
  const view = {
    notifications: null,
    sidebar: null,
    chat: null,
    bosi: null,
    onboardingMounts: 0,
    listRequests: 0,
    bosiSetup
  }
  const i18n = { t: (key) => key, useLocale: () => 'en', setLocale() {}, localizeValidation() {}, clearValidation() {} }
  const imports = {
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
    './i18n': i18n,
    './notifications/NotificationProvider': {
      NotificationProvider: (props) => {
        view.notifications = props
        return props.children
      }
    },
    './host': {
      HostError: class HostError extends Error {},
      invoke: async (method, input) => {
        if (method === 'state') return state
        if (method === 'bosiSetup')
          return typeof view.bosiSetup === 'function' ? view.bosiSetup(state.profile.organizationId) : view.bosiSetup
        if (method === 'resolveWorkbenchEntry')
          return view.openProject
            ? view.openProject(input)
            : {
                assistantId: 'project-assistant',
                organizationId: input.organizationId === undefined ? 'org' : input.organizationId,
                projectId: input.projectId,
                viewKey: 'platform.project-tasks__timeline',
                source: input,
                parameters: { initialTab: 'pipeline', pipelineNodeId: input.pipelineNodeId },
                bot: { id: 'project-assistant', name: 'Project assistant' }
              }
        if (method === 'listBotPage') {
          view.listRequests++
          return page ? page(input) : { bots: [...bots], next: null, awaitingSavedBot: false }
        }
        if (method === 'listBots') {
          view.listRequests++
          return [...bots]
        }
        if (method === 'restoreSession') {
          if (waitForRestore) await waitForRestore
          return saved.get(scope()) ?? null
        }
        if (method === 'rememberSession') {
          saved.set(input.scope, input.session)
          return
        }
        if (method === 'discoveryWorkspaces') return view.listWorkspaces?.() ?? []
        if (method === 'selectOrganization') {
          state = { ...state, profile: { ...state.profile, organizationId: input } }
          return state
        }
        throw new Error(`Unexpected host call: ${method}`)
      }
    },
    './catalog/catalog-cache': { createCatalogCache: () => ({}) },
    './theme': { applyDesktopTheme() {} },
    './appearance-types': { defaultAppearance: () => ({}) },
    './app-activation': { subscribeAppActivation: () => () => {} },
    '@xpert-ai/shadcn-ui': { Button: 'button' },
    'lucide-react': { Bot: () => null, LoaderCircle: () => null },
    './Sidebar': {
      Sidebar: (props) => {
        view.sidebar = props
        return null
      }
    },
    './ChatPanel': {
      ChatPanel: (props) => {
        view.chat = props
        return React.createElement('div', { id: 'chat' }, `${props.bot.id}:${props.initialThread}`)
      }
    },
    './bosi/BosiOnboarding': {
      BosiOnboarding: (props) => {
        React.useEffect(() => {
          view.onboardingMounts++
        }, [])
        view.bosi = props
        return React.createElement('div', { id: 'onboarding' })
      }
    },
    './profile/PreviewScope': { AssistantPreviewScope: ({ children }) => children },
    './profile/PersonalEventInbox': { PersonalEventInbox: () => null },
    './voice/VoiceProvider': { VoiceProvider: ({ children }) => children },
    './groups/CreateGroupDialog': { CreateGroupDialog: () => null },
    './ConnectionSettings': { ConnectionSettings: () => null },
    './Login': { Login: () => null },
    './computer-use/ComputerPermissions': { ComputerPermissions: () => null },
    './FirstRunLanguage': { FirstRunLanguage: () => null },
    './CatalogDialog': { CatalogDialog: () => null }
  }
  const hook = {}
  runInNewContext(
    ts.transpileModule(readFileSync(join(__dirname, '../src/bosi/useBosiEntry.ts'), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText,
    { exports: hook, require: (id) => (id === 'react' ? React : imports['./host']) }
  )
  imports['./bosi/useBosiEntry'] = hook
  const exports = {}
  runInNewContext(
    ts.transpileModule(readFileSync(join(__dirname, '../src/App.tsx'), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
    }).outputText,
    {
      exports,
      require: (id) => {
        if (Object.hasOwn(imports, id)) return imports[id]
        throw new Error(`Unexpected import: ${id}`)
      },
      window: dom.window,
      document: dom.window.document,
      matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
    }
  )
  let root
  const open = async () => {
    root = require('react-dom/client').createRoot(document.getElementById('root'))
    await React.act(() => root.render(React.createElement(React.StrictMode, null, React.createElement(exports.App))))
  }
  const reopen = async () => {
    await React.act(() => root.unmount())
    await open()
  }
  t.after(async () => {
    await React.act(() => root.unmount())
    dom.window.close()
    global.window = previous.window
    global.document = previous.document
    global.IS_REACT_ACT_ENVIRONMENT = previous.act
  })
  await open()
  return { view, saved, scope, reopen }
}

test('a failed workspace refresh preserves the current conversation until a successful list removes its space', async (t) => {
  const { view } = await mount(t)
  const space = { id: 'b', name: 'Engineering', canWrite: true }
  view.listWorkspaces = () => [space]
  await React.act(() => view.sidebar.retryWorkspaces())
  await React.act(() => view.sidebar.onWorkspace(space.id))
  const chat = document.getElementById('chat')
  view.listWorkspaces = () => {
    throw new Error('Offline')
  }
  await React.act(() => view.sidebar.retryWorkspaces())
  assert.equal(view.sidebar.workspaceError, 'Offline')
  assert.equal(view.sidebar.workspaceId, space.id)
  assert.deepEqual(
    view.sidebar.bots.map((bot) => bot.id),
    ['b']
  )
  assert.equal(document.getElementById('chat'), chat)
  view.listWorkspaces = () => [space]
  await React.act(() => view.sidebar.retryWorkspaces())
  assert.equal(view.sidebar.workspaceError, '')
  assert.equal(view.sidebar.workspaceId, space.id)
  view.listWorkspaces = () => []
  await React.act(() => view.sidebar.retryWorkspaces())
  assert.equal(view.sidebar.workspaceId, '')
})

test('reopening resumes the last Assistant and changed thread without the Bosi default replacing it', async (t) => {
  const { view, saved, scope, reopen } = await mount(t)
  assert.equal(view.onboardingMounts, 0)
  assert.equal(view.chat.bot.id, 'b')
  assert.equal(view.chat.initialThread, 'previous-thread')
  const oldScopeChange = view.chat.onSessionChange
  const selectionVersion = view.chat.selectionVersion
  await React.act(() => view.chat.onSessionChange({ botId: 'b', threadId: 'new-thread' }))
  assert.equal(saved.get(scope()).threadId, 'new-thread')
  assert.equal(view.chat.selectionVersion, selectionVersion, 'saving navigation must not reset ChatKit')
  await reopen()
  assert.equal(view.chat.initialThread, 'new-thread')
  await React.act(() => view.sidebar.onSelect('a', null))
  await reopen()
  assert.equal(view.chat.bot.id, 'a')
  assert.equal(view.chat.initialThread, null)
  await React.act(() => view.sidebar.onOrganization('another-org'))
  assert.ok(document.getElementById('onboarding'))
  await React.act(() => view.bosi.onReady('b', 'welcome'))
  assert.equal(view.chat.initialThread, 'welcome')
  await React.act(() => oldScopeChange({ botId: 'b', threadId: 'stale' }))
  assert.equal(saved.get(scope()).threadId, 'welcome', 'old account/org callbacks cannot replace the current scope')
  await React.act(() => view.sidebar.onOrganization('org'))
  assert.equal(view.chat.bot.id, 'a')
  assert.equal(view.chat.initialThread, null)
})

test('startup waits for restore and still starts normal onboarding when there is no remembered session', async (t) => {
  let finish
  const waitForRestore = new Promise((resolve) => {
    finish = resolve
  })
  const { view } = await mount(t, { restored: null, waitForRestore })
  assert.equal(view.onboardingMounts, 0)
  assert.equal(view.chat, null)
  await React.act(() => finish())
  assert.ok(document.getElementById('onboarding'))
  const initialRequests = view.listRequests
  await React.act(() => view.bosi.onReady('a', 'welcome-thread'))
  assert.equal(view.listRequests, initialRequests, 'opening an existing Bosi reuses the initial assistant list')
  assert.equal(view.chat.bot.id, 'a')
  assert.equal(view.chat.initialThread, 'welcome-thread')
})

test('a newly created Bosi is fetched once before opening its welcome thread', async (t) => {
  const bots = [{ id: 'a', name: 'A' }]
  const { view } = await mount(t, { restored: null, bots })
  const initialRequests = view.listRequests
  bots.push({ id: 'new', name: 'New' })
  await React.act(() => view.bosi.onReady('new', 'welcome'))
  assert.equal(view.listRequests, initialRequests + 1)
  assert.equal(view.chat.bot.id, 'new')
  assert.equal(view.chat.initialThread, 'welcome')
})

function delayedPages(awaitingSavedBot = false) {
  let finish
  const rest = new Promise((resolve) => {
    finish = () => resolve({ bots: defaultBots, next: null, awaitingSavedBot: false })
  })
  return {
    page: (cursor) => (cursor ? rest : { bots: defaultBots.slice(0, 1), next: 'page-2', awaitingSavedBot }),
    finish
  }
}

test('Bosi opens with the first page and keeps its thread when the rest of the sidebar arrives', async (t) => {
  const { page, finish } = delayedPages()
  const { view } = await mount(t, { page, restored: null })
  await React.act(() => view.bosi.onReady('a', 'welcome'))
  assert.equal(view.chat.bot.id, 'a')
  assert.equal(view.sidebar.bots.length, 1)
  const version = view.chat.selectionVersion
  await React.act(finish)
  assert.equal(view.sidebar.bots.length, 2)
  assert.equal(view.chat.initialThread, 'welcome')
  assert.equal(view.chat.selectionVersion, version)
})

test('a saved assistant beyond the first page is restored without opening a different chat', async (t) => {
  const { page, finish } = delayedPages(true)
  const { view } = await mount(t, { page })
  assert.equal(view.chat, null)
  assert.equal(view.bosi, null)
  assert.equal(view.sidebar.bots.length, 1)
  await React.act(finish)
  assert.equal(view.chat.bot.id, 'b')
  assert.equal(view.chat.initialThread, 'previous-thread')
})

test('a personal Bosi on a later page joins the in-flight list without loading it twice', async (t) => {
  let finishMiddle, finishLast
  const middle = new Promise((resolve) => {
    finishMiddle = () => resolve({ bots: defaultBots, next: 'last', awaitingSavedBot: false })
  })
  const last = new Promise((resolve) => {
    finishLast = () => resolve({ bots: [...defaultBots, { id: 'c', name: 'C' }], next: null, awaitingSavedBot: false })
  })
  const page = (cursor) =>
    cursor === 'last'
      ? last
      : cursor === 'middle'
        ? middle
        : { bots: defaultBots.slice(0, 1), next: 'middle', awaitingSavedBot: false }
  const { view } = await mount(t, { page, restored: null })
  await React.act(async () => {
    const opening = view.bosi.onReady('b', 'welcome')
    finishMiddle()
    await opening
  })
  assert.equal(view.listRequests, 3)
  assert.equal(view.chat.bot.id, 'b')
  assert.equal(view.chat.initialThread, 'welcome')
  assert.equal(view.sidebar.pending, true)
  await React.act(finishLast)
  assert.equal(view.sidebar.bots.length, 3)
  assert.equal(view.chat.initialThread, 'welcome')
})

test('restored delegated conversation passes its authorized Project to ChatKit without resetting the thread', async (t) => {
  const restored = {
    botId: 'b',
    threadId: 'role-thread',
    conversation: {
      assistantId: 'role',
      conversationId: 'role-conversation',
      projectId: 'project'
    }
  }
  const { view, reopen } = await mount(t, { restored })
  assert.deepEqual(view.chat.initialVoice, restored.conversation)
  assert.equal(view.chat.initialThread, 'role-thread')
  await reopen()
  assert.deepEqual(view.chat.initialVoice, restored.conversation)
  assert.equal(view.chat.initialThread, 'role-thread')
})

test('notification opens the resolved Assistant in ChatKit even when absent from the Bot catalog', async (t) => {
  const { view, saved, scope } = await mount(t)
  const previous = saved.get(scope())
  const chat = document.getElementById('chat')
  await React.act(async () =>
    assert.equal(
      await view.notifications.onWorkbench({
        target: 'project.pipelines',
        projectId: 'project',
        pipelineNodeId: 'node'
      }),
      true
    )
  )
  assert.equal(document.getElementById('chat'), chat)
  assert.equal(document.getElementById('project'), null)
  assert.equal(view.chat.bot.id, 'project-assistant')
  assert.equal(view.chat.initialWorkbench.viewKey, 'platform.project-tasks__timeline')
  assert.equal(view.chat.initialWorkbench.parameters.pipelineNodeId, 'node')
  assert.equal(view.chat.initialThread, null)
  assert.deepEqual(saved.get(scope()), previous, 'Project inspection does not replace the saved ordinary conversation')
  assert.equal(view.sidebar.selected, null)
})

test('same Assistant/Project notification refocuses Workbench without resetting its conversation', async (t) => {
  const { view } = await mount(t)
  view.openProject = async (input) => ({
    assistantId: 'b',
    projectId: 'project',
    organizationId: 'org',
    source: input,
    viewKey: 'platform.project-tasks__timeline',
    bot: { id: 'b', name: 'B' }
  })
  const version = view.chat.selectionVersion
  await React.act(() => view.chat.onRuntimeScope({ assistantId: 'b', projectId: 'project', organizationId: 'org' }))
  const target = { target: 'project.pipelines', projectId: 'project' }
  await React.act(() => view.notifications.onWorkbench(target))
  const first = view.chat.initialWorkbench.requestId
  await React.act(() => view.notifications.onWorkbench(target))
  assert.equal(view.chat.selectionVersion, version)
  assert.equal(view.chat.initialThread, 'previous-thread')
  assert.notEqual(view.chat.initialWorkbench.requestId, first)
})

test('a late notification navigation cannot replace a newer user selection', async (t) => {
  const { view } = await mount(t)
  let resolve, pending
  view.openProject = () =>
    new Promise((done) => {
      resolve = done
    })
  await React.act(() => {
    pending = view.notifications.onWorkbench({ target: 'project.pipelines', projectId: 'project' })
  })
  await React.act(() => view.sidebar.onSelect('a'))
  await React.act(async () => {
    resolve({})
    assert.equal(await pending, false)
  })
  assert.equal(view.chat.bot.id, 'a')
  assert.equal(view.chat.initialWorkbench, null)
})

test('a late project entry cannot survive an account scope change', async (t) => {
  const { view } = await mount(t)
  let resolve, pending
  view.openProject = () =>
    new Promise((done) => {
      resolve = done
    })
  await React.act(() => {
    pending = view.notifications.onWorkbench({ target: 'project.pipelines', projectId: 'project' })
  })
  await React.act(() => view.sidebar.onOrganization('other'))
  await React.act(async () => {
    resolve({})
    assert.equal(await pending, false)
  })
  assert.equal(view.chat.initialWorkbench, null)
})

for (const organizationId of [null, 'other'])
  test(`notification retains explicit scope ${organizationId}`, async (t) => {
    const { view } = await mount(t)
    await React.act(() =>
      view.notifications.onWorkbench({ target: 'project.pipelines', projectId: 'project', organizationId })
    )
    assert.equal(view.chat.initialWorkbench.organizationId, organizationId)
    assert.equal(view.chat.initialWorkbench.source.organizationId, organizationId)
  })

for (const projectId of [null, 'project'])
  test(`generic notification View preserves selection and parameters with project ${projectId}`, async (t) => {
    const { view, saved, scope } = await mount(t)
    const previous = saved.get(scope())
    view.openProject = async (input) => ({
      assistantId: 'b',
      projectId,
      organizationId: 'org',
      source: input,
      viewKey: input.viewKey,
      selectionId: input.selectionId,
      parameters: input.parameters,
      bot: { id: 'b', name: 'B' }
    })
    await React.act(() => view.chat.onRuntimeScope({ assistantId: 'b', projectId, organizationId: 'org' }))
    const version = view.chat.selectionVersion
    const thread = view.chat.initialThread
    const input = {
      target: 'workbench.view',
      assistantId: 'b',
      organizationId: 'org',
      projectId,
      viewKey: 'orders__review',
      selectionId: 'item',
      parameters: { tab: 'evidence' }
    }
    await React.act(() => view.notifications.onWorkbench(input))
    assert.equal(view.chat.initialWorkbench.selectionId, 'item')
    assert.deepEqual(view.chat.initialWorkbench.parameters, { tab: 'evidence' })
    await React.act(() =>
      view.notifications.onWorkbench({ ...input, viewKey: 'audit__timeline', selectionId: 'receipt' })
    )
    assert.equal(view.chat.initialWorkbench.viewKey, 'audit__timeline')
    assert.equal(view.chat.initialWorkbench.selectionId, 'receipt')
    assert.equal(view.chat.selectionVersion, version)
    assert.equal(view.chat.initialThread, thread)
    assert.deepEqual(saved.get(scope()), previous)
  })

test('an unfinished Bosi remains reachable after restoring another assistant and reopening', async (t) => {
  const { view, saved, scope, reopen } = await mount(t)
  assert.equal(view.chat.bot.id, 'b')
  assert.equal(view.sidebar.bosi.bot, null)
  assert.equal(view.sidebar.bosi.initialized, false)
  await React.act(() => view.sidebar.bosi.onSelect())
  assert.ok(document.getElementById('onboarding'))
  assert.equal(document.getElementById('chat'), null)
  assert.equal(view.sidebar.bosi.selected, true)
  assert.equal(view.sidebar.selected, null, 'the setup entry is the only selected row')
  assert.equal(saved.get(scope()).botId, 'b', 'a navigation entry must not be saved as a Bot')
  await React.act(() => view.sidebar.onSelect('a'))
  await reopen()
  assert.equal(view.chat.bot.id, 'a')
  await React.act(() => view.sidebar.bosi.onSelect())
  assert.ok(document.getElementById('onboarding'))
})

test('an assistant ID does not complete Bosi setup; completion replaces the entry with that assistant', async (t) => {
  const setup = { assistantId: 'a', progress: { phase: 'welcome_failed', threadId: 'welcome' } }
  const { view } = await mount(t, { bosiSetup: setup })
  assert.equal(view.sidebar.bosi.bot.id, 'a')
  assert.equal(view.sidebar.bosi.initialized, false)
  await React.act(() => view.sidebar.bosi.onSelect())
  assert.ok(document.getElementById('onboarding'))
  await React.act(() => view.bosi.onSetup({ ...setup, progress: { phase: 'ready', threadId: 'welcome' } }))
  await React.act(() => view.bosi.onReady('a', 'welcome'))
  assert.equal(view.sidebar.bosi.bot.id, 'a')
  assert.equal(view.sidebar.bosi.initialized, true)
  assert.equal(view.chat.bot.id, 'a')
  assert.equal(view.chat.initialThread, 'welcome')
})

test('Bosi lookup failures retain the entry and stale organization responses cannot replace it', async (t) => {
  let resolveOld
  const { view } = await mount(t, {
    bosiSetup: (org) =>
      org === 'org'
        ? new Promise((resolve) => {
            resolveOld = resolve
          })
        : Promise.reject(new Error('Binding unavailable'))
  })
  await React.act(() => view.sidebar.onOrganization('another-org'))
  await React.act(() => resolveOld({ assistantId: 'a', progress: null }))
  assert.equal(view.sidebar.bosi.bot, null)
  assert.equal(view.sidebar.bosi.initialized, false)
  await React.act(() => view.sidebar.onSelect('b'))
  await React.act(() => view.sidebar.bosi.onSelect())
  assert.ok(document.getElementById('onboarding'))
  assert.equal(view.bosi.organizationId, 'another-org')
})

test('opening Bosi leaves workspace filtering and group navigation without saving a fake session', async (t) => {
  const { view, saved, scope } = await mount(t)
  view.listWorkspaces = () => [{ id: 'b', name: 'Engineering', canWrite: true }]
  await React.act(() => view.sidebar.retryWorkspaces())
  await React.act(() => view.sidebar.onWorkspace('b'))
  await React.act(() => view.sidebar.onSelectGroup('group'))
  await React.act(() => view.sidebar.bosi.onSelect())
  assert.equal(view.sidebar.workspaceId, '')
  assert.equal(view.sidebar.selectedGroup, null)
  assert.ok(document.getElementById('onboarding'))
  assert.equal(saved.get(scope()).botId, 'b')
})
