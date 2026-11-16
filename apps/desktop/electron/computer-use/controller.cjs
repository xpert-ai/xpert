const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { spawn } = require('node:child_process')
const { createInterface } = require('node:readline')
const { isId } = require('@xpert-ai/desktop-protocol')
const { translate } = require('../i18n/index.mjs')

const binary = path
  .join(__dirname, '../../resources/computer-use/window-control')
  .replace('app.asar/', 'app.asar.unpacked/')
function driver() {
  const child = spawn(binary, [], { stdio: ['pipe', 'pipe', 'ignore'] })
  let pending
  function finish(error, value) {
    if (!pending) return
    const { resolve, reject, timer } = pending
    pending = undefined
    clearTimeout(timer)
    if (error) reject(error)
    else resolve(value)
  }
  child.on('error', () => finish(new Error('Window is unavailable')))
  child.stdin.on('error', () => finish(new Error('Window is unavailable')))
  child.on('close', () => finish(new Error('Window is unavailable')))
  createInterface({ input: child.stdout }).on('line', (line) => {
    try {
      const answer = JSON.parse(line)
      finish(answer.error ? new Error(answer.error) : null, answer.value)
    } catch {
      finish(new Error('Window is unavailable'))
    }
  })
  return {
    close: () => {
      child.kill()
      finish(new Error('Window control stopped'))
    },
    call(input) {
      if (pending || child.killed || child.exitCode !== null) return Promise.reject(new Error('Window is unavailable'))
      return new Promise((resolve, reject) => {
        pending = {
          resolve,
          reject,
          timer: setTimeout(() => {
            child.kill()
            finish(new Error('Window operation timed out'))
          }, 30000)
        }
        child.stdin.write(JSON.stringify(input) + '\n')
      })
    }
  }
}

function createWindowControl({ service, dialog, getWindow, makeDriver = driver, onActivity = () => {} }) {
  let session
  const receipts = new Map()
  const stopped = new Map()
  const t = (key) => translate(service.config.locale, key)
  function stop() {
    if (!session) return
    stopped.set(session.scope, Date.now())
    receipts.clear()
    clearTimeout(session.timer)
    session.driver.close()
    session = undefined
    onActivity()
  }
  function account() {
    const profile = service.profile
    if (!profile?.user?.id || !profile.user.tenantId || !profile.organizationId)
      throw new Error('Window control requires a signed-in account')
    return JSON.stringify([service.config.apiUrl, profile.user.tenantId, profile.user.id, profile.organizationId])
  }
  async function queryHelper(action) {
    const d = makeDriver()
    try {
      return await d.call({ action })
    } finally {
      d.close()
    }
  }
  async function perform(s, input, name) {
    if (input.action === 'start') {
      const { windows } = await s.driver.call({ action: 'windows' })
      // Titles and process/window identifiers remain inside the trusted native chooser.
      const choices = windows.filter((w) => w.app !== 'Bosi' && w.app !== 'Electron')
      if (!choices.length) throw new Error('No eligible window')
      const answer = await dialog.showMessageBox(getWindow(), {
        type: 'question',
        title: t('Local window control'),
        message: t('Choose a window for this task'),
        detail: [name, input.task, t('Window contents will be sent to this Assistant and its model.')].join('\n\n'),
        buttons: [t('Cancel'), ...choices.map((w) => w.app + ' — ' + w.title)],
        defaultId: 0,
        cancelId: 0,
        noLink: true
      })
      const selected = choices[answer.response - 1]
      if (!selected || session !== s || s.account !== account()) throw new Error('Window control stopped')
      const observation = await s.driver.call({ action: 'select', window: selected.id, title: selected.title })
      if (session !== s || s.account !== account()) throw new Error('Window control stopped')
      s.title = selected.title
      s.app = selected.app
      onActivity()
      return observation
    }
    if (input.action === 'finish') {
      stop()
      return { stopped: true }
    }
    return s.driver.call(input)
  }
  async function run(request) {
    if (
      !request ||
      !isId(request.assistantId) ||
      !isId(request.threadId) ||
      !isId(request.runId) ||
      typeof request.toolCallId !== 'string' ||
      !request.toolCallId ||
      request.toolCallId.length > 200
    )
      throw new Error('Invalid input')
    const input = request.input
    if (!input || !['start', 'observe', 'type', 'click', 'scroll', 'finish'].includes(input.action))
      throw new Error('Invalid input')
    if (input.action === 'start' && (typeof input.task !== 'string' || !input.task.trim() || input.task.length > 500))
      throw new Error('Invalid input')
    if (JSON.stringify(input).length > 12000) throw new Error('Invalid input')
    if (
      ['click', 'scroll', 'type'].includes(input.action) &&
      (!isId(input.snapshot) || !Number.isInteger(input.element) || input.element < 0 || input.element > 159)
    )
      throw new Error('Observe again')
    const identity = account()
    const scope = JSON.stringify([identity, request.assistantId, request.threadId, request.runId])
    const key = JSON.stringify([scope, request.toolCallId])
    const body = JSON.stringify(input)
    const prior = receipts.get(key)
    if (prior) {
      if (body !== prior.body || session?.scope !== scope) throw new Error('Window control stopped')
      return prior.result
    }
    for (const [id, stamp] of stopped) if (Date.now() - stamp > 3600000) stopped.delete(id)
    if (stopped.has(scope)) throw new Error('Window control stopped')
    if (!session && input.action === 'start') {
      const bot = service.bots.find((b) => (b.assistantId || b.id) === request.assistantId)
      if (!bot) throw new Error('Unknown assistant')
      receipts.clear()
      session = {
        scope,
        grantId: randomUUID(),
        account: identity,
        name: bot.name,
        title: '',
        driver: makeDriver(),
        timer: setTimeout(stop, 5 * 60 * 1000)
      }
    }
    const s = session
    if (!s || s.scope !== scope || s.busy || (input.action === 'start' && s.title))
      throw new Error('Window is unavailable')
    if (receipts.size >= 40) {
      stop()
      throw new Error('Window control stopped')
    }
    s.busy = true
    const result = perform(s, input, s.name)
      .then((value) => {
        if (input.action !== 'finish' && (session !== s || account() !== identity))
          throw new Error('Window control stopped')
        return value
      })
      .catch((e) => {
        if (input.action === 'start' && session === s) stop()
        throw e
      })
      .finally(() => {
        s.busy = false
      })
    receipts.set(key, { body, result })
    return result
  }
  return {
    run,
    stop,
    stopGrant(id) {
      if (!session?.title || id !== session.grantId) return false
      stop()
      return true
    },
    haptic: () => queryHelper('haptic'),
    displayCutouts: async () => (await queryHelper('displayCutouts')).cutouts,
    status: () => queryHelper('status'),
    requestScreenPermission: () => queryHelper('requestScreenPermission'),
    active: () =>
      session?.title ? { title: session.title, name: session.name, app: session.app, id: session.grantId } : undefined
  }
}
module.exports = { createWindowControl }
