// Opt-in: uses a dedicated published Assistant and a temporary directory on this Mac.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { isId } from '@xpert-ai/desktop-protocol'
import { DesktopService, DEFAULT_CONFIG } from '../electron/service.cjs'
import { apiRootUrl } from '../electron/connection/urls.mjs'
import { DesktopShellController } from '../electron/shell/controller.cjs'
import { requireAuthentication, createRequestHeaders } from '../../../tools/scripts/local-plugin-cli.mjs'

const assistantId = process.env.XPERT_SHELL_ASSISTANT_ID
const rejectCommand = process.env.XPERT_SHELL_TEST_DECISION === 'reject'
let cleanupThread,
  cleanupRun,
  cleanupSecret,
  lastEventId,
  completed = false
if (!isId(assistantId))
  throw new Error('Set XPERT_SHELL_ASSISTANT_ID to a dedicated published Assistant with Desktop Shell middleware.')
if (process.platform !== 'darwin') throw new Error('Desktop Shell acceptance requires macOS.')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xpert-desktop-shell-test-'))
const cwd = path.join(root, 'project')
fs.mkdirSync(cwd)
const service = new DesktopService()
service.configure({ ...DEFAULT_CONFIG, apiUrl: process.env.XPERT_API_URL || 'http://localhost:3000' })
service.shell = new DesktopShellController(service, path.join(root, 'profile'))

async function chatRequest(route, body, secret) {
  const response = await fetch(`${apiRootUrl(service.config.apiUrl)}/api/ai${route}`, {
    method: 'POST',
    headers: {
      ...createRequestHeaders(
        { scope: 'organization', orgId: service.profile.organizationId },
        secret,
        service.credentials.tenantId
      ),
      ...(body.input?.action === 'resume' && lastEventId ? { 'Last-Event-ID': lastEventId } : {})
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180000),
    redirect: 'error'
  })
  if (!response.ok) throw new Error(`Chat request failed (${response.status}).`)
  return response
}

try {
  const auth = await requireAuthentication({ apiUrl: apiRootUrl(service.config.apiUrl) })
  service.credentials = { token: auth.token, tenantId: auth.tenantId }
  const fetcher = service.fetcher
  service.fetcher = (url, options) => {
    const headers = new Headers(options.headers)
    for (const [key, value] of Object.entries(
      createRequestHeaders(
        service.profile?.organizationId
          ? { scope: 'organization', orgId: service.profile.organizationId }
          : { scope: 'tenant' },
        auth.token,
        auth.tenantId
      )
    ))
      headers.set(key, value)
    return fetcher(url, { ...options, headers })
  }
  await service.bootstrap()
  await service.selectOrganization(process.env.XPERT_ORGANIZATION_ID || service.profile.organizationId)
  await service.listBots()
  const { secret } = await service.chatSession(assistantId)
  cleanupSecret = secret
  const thread = await (
    await chatRequest(
      '/threads',
      { assistant_id: assistantId, metadata: { title: 'Desktop Shell acceptance' } },
      secret
    )
  ).json()
  cleanupThread = thread.thread_id
  await service.shell.configureSettings({
    name: 'Desktop Shell local test',
    shell: '/bin/zsh',
    cwd,
    path: '/usr/bin:/bin:/usr/sbin:/sbin'
  })
  const marker = randomUUID()
  const input = `Use desktop_shell exactly once to run this command, with timeout_sec 15 and cwd exactly ${cwd}: printf '${marker}\\n' >> once.txt; uname -s; pwd; printf 'stderr-test\\n' >&2. If the result is running, query status instead of repeating exec. If permission is denied or unavailable, stop and do not retry. Report the real stdout, stderr and exit code.`
  let response = await chatRequest(
    `/threads/${thread.thread_id}/runs/stream`,
    {
      assistant_id: assistantId,
      input: { action: 'send', message: { input: { input } } },
      context: { source: 'desktop' },
      stream_mode: ['messages', 'updates']
    },
    secret
  )
  let prepared, executionId
  let approved = false
  for (let round = 0; round < 3; round++) {
    const wire = await response.text()
    const traceDirectory = process.env.XPERT_SHELL_TEST_TRACE_DIR
    if (traceDirectory) {
      fs.mkdirSync(traceDirectory, { recursive: true, mode: 0o700 })
      fs.writeFileSync(path.join(traceDirectory, `round-${round}.sse`), wire, { mode: 0o600 })
    }
    assert.ok(wire.length < 2000000, 'Bounded smoke stream')
    lastEventId =
      wire
        .split(/\r?\n/)
        .filter((line) => line.startsWith('id:'))
        .at(-1)
        ?.slice(3)
        .trim() || lastEventId
    const events = wire.split(/\r?\n\r?\n/).map((frame) => {
      const data = frame
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('\n')
      if (!data || data === '[DONE]') return null
      try {
        return JSON.parse(data)
      } catch {
        return null
      }
    })
    const interrupts = events
      .flatMap((event) => (event?.event === 'on_interrupt' ? (event.data?.tasks ?? []) : []))
      .flatMap((task) => task.interrupts ?? [])
      .map((item) => item.value)
    if (!interrupts.length) break
    assert.equal(interrupts.length, 1, 'Only one controlled Shell interruption is expected')
    const request = interrupts[0]
    let payload
    if (request.clientToolCalls) {
      assert.equal(request.clientToolCalls.length, 1)
      const call = request.clientToolCalls[0]
      cleanupRun = call.args.runId
      assert.equal(prepared, undefined, 'Do not retry an exec after refusal or completion')
      assert.equal(call.name, 'desktop_shell_prepare')
      assert.equal(call.args.assistantId, assistantId)
      assert.equal(call.args.threadId, thread.thread_id)
      assert.equal(call.args.command, `printf '${marker}\\n' >> once.txt; uname -s; pwd; printf 'stderr-test\\n' >&2`)
      assert.ok(!call.args.cwd || call.args.cwd === cwd)
      assert.equal(call.args.timeoutSec, 15)
      executionId = call.args.runId
      prepared = await service.shell.prepare(call.args)
      assert.equal(prepared.decision, 'pending')
      assert.equal(fs.existsSync(path.join(cwd, 'once.txt')), false)
      payload = {
        toolMessages: [{ tool_call_id: call.id, name: call.name, status: 'success', content: JSON.stringify(prepared) }]
      }
    } else {
      assert.equal(request.host?.kind, 'desktop-shell')
      assert.equal(request.host.id, prepared?.grantId)
      assert.equal(fs.existsSync(path.join(cwd, 'once.txt')), false)
      await service.shell.decide({ id: prepared.grantId, decision: rejectCommand ? 'reject' : 'approve' })
      approved = true
      payload = { decisions: [{ type: rejectCommand ? 'reject' : 'approve' }] }
    }
    response = await chatRequest(
      `/threads/${thread.thread_id}/runs/stream`,
      {
        assistant_id: assistantId,
        input: { action: 'resume', target: { executionId }, decision: { type: 'confirm', payload } },
        context: { source: 'desktop' },
        stream_mode: ['messages', 'updates']
      },
      secret
    )
  }
  assert.equal(approved, true, 'The Agent must request per-command approval')
  const operations = await service.shell.operations()
  if (rejectCommand) {
    assert.equal(operations.length, 0, 'Refusal must create no executable operation')
    assert.equal(fs.existsSync(path.join(cwd, 'once.txt')), false)
    console.log(
      JSON.stringify({
        result: 'passed',
        checks: ['real Agent refusal', 'no command dispatched', 'no file written', 'no repeated execution request']
      })
    )
  } else {
    const result = operations.find((operation) => operation.state === 'succeeded')
    assert.ok(result, 'The Assistant must call desktop_shell and finish successfully.')
    assert.match(result.stdout, /Darwin/)
    assert.ok(result.stdout.includes(cwd))
    assert.match(result.stderr, /stderr-test/)
    assert.equal(result.exitCode, 0)
    assert.equal(fs.readFileSync(path.join(cwd, 'once.txt'), 'utf8'), `${marker}\n`)
    await service.shell.unbind(prepared.grantId)
    console.log(
      JSON.stringify(
        {
          result: 'passed',
          checks: [
            'login',
            'device WebSocket',
            'on-demand preparation',
            'no execution before inline approval',
            'real Agent command',
            'macOS cwd/stdout/stderr/exit',
            'single filesystem write',
            'one-command permit revocation'
          ]
        },
        null,
        2
      )
    )
  }
  completed = true
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Desktop Shell acceptance failed.')
  process.exitCode = 1
} finally {
  if (!completed && cleanupThread && cleanupRun && cleanupSecret)
    await chatRequest(`/threads/${cleanupThread}/runs/${cleanupRun}/cancel`, {}, cleanupSecret).catch(() => undefined)
  await service.shell.disable()
  service.logout()
  fs.rmSync(root, { recursive: true, force: true })
}
