// Opt-in: uses a dedicated published Assistant and a temporary directory on this Mac.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { isId } from '@xpert-ai/desktop-protocol'
import { DesktopService, DEFAULT_CONFIG } from '../electron/service.cjs'
import { DesktopShellController } from '../electron/shell/controller.cjs'
import { readLocalCredentials } from './local-credentials.mjs'

const assistantId = process.env.XPERT_SHELL_ASSISTANT_ID
if (!isId(assistantId))
  throw new Error('Set XPERT_SHELL_ASSISTANT_ID to a dedicated published Assistant with Desktop Shell middleware.')
if (process.platform !== 'darwin') throw new Error('Desktop Shell acceptance requires macOS.')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xpert-desktop-shell-test-'))
const cwd = path.join(root, 'project')
fs.mkdirSync(cwd)
const service = new DesktopService()
service.configure({ ...DEFAULT_CONFIG, apiUrl: process.env.XPERT_API_URL || DEFAULT_CONFIG.apiUrl })
service.shell = new DesktopShellController(service, path.join(root, 'profile'))

async function chatRequest(route, body, secret) {
  const response = await fetch(`${service.config.apiUrl}/api/ai${route}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${secret}`,
      'tenant-id': service.credentials.tenantId,
      'organization-id': service.profile.organizationId
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180000),
    redirect: 'error'
  })
  if (!response.ok) throw new Error(`Chat request failed (${response.status}).`)
  return response
}

try {
  await service.login(readLocalCredentials())
  await service.selectOrganization(process.env.XPERT_ORGANIZATION_ID || service.profile.organizationId)
  await service.listBots()
  const { secret } = await service.chatSession(assistantId)
  const thread = await (
    await chatRequest(
      '/threads',
      { assistant_id: assistantId, metadata: { title: 'Desktop Shell acceptance' } },
      secret
    )
  ).json()
  await service.shell.enable({
    name: 'Desktop Shell local test',
    shell: '/bin/zsh',
    cwd,
    path: '/usr/bin:/bin:/usr/sbin:/sbin'
  })
  const deadline = Date.now() + 30000
  while (!service.shell.snapshot().connected) {
    if (Date.now() >= deadline) throw new Error('Desktop Worker did not connect.')
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  const grant = await service.shell.bind({ assistantId, threadId: thread.thread_id })
  const marker = randomUUID()
  const input = `Use desktop_shell exactly once to run this command, with timeout_sec 15 and the default cwd: printf '${marker}\\n' >> once.txt; uname -s; pwd; printf 'stderr-test\\n' >&2. If the result is running, query status instead of repeating exec. Report the real stdout, stderr and exit code.`
  const response = await chatRequest(
    `/threads/${thread.thread_id}/runs/stream`,
    {
      assistant_id: assistantId,
      input: { action: 'send', message: { input: { input } } },
      context: { source: 'desktop', desktopShellGrantId: grant.id },
      stream_mode: ['messages', 'updates']
    },
    secret
  )
  // Drain the bounded run without printing model content or connection credentials.
  for await (const _chunk of response.body) {
    /* Keep the actual Agent run subscribed. */
  }
  const operations = await service.shell.operations()
  const result = operations.find((operation) => operation.state === 'succeeded')
  assert.ok(result, 'The Assistant must call desktop_shell and finish successfully.')
  assert.match(result.stdout, /Darwin/)
  assert.ok(result.stdout.includes(cwd))
  assert.match(result.stderr, /stderr-test/)
  assert.equal(result.exitCode, 0)
  assert.equal(fs.readFileSync(path.join(cwd, 'once.txt'), 'utf8'), `${marker}\n`)
  await service.shell.unbind(grant.id)
  console.log(
    JSON.stringify(
      {
        result: 'passed',
        checks: [
          'login',
          'device WebSocket',
          'conversation grant',
          'real Agent command',
          'macOS cwd/stdout/stderr/exit',
          'single filesystem write',
          'grant revocation'
        ]
      },
      null,
      2
    )
  )
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Desktop Shell acceptance failed.')
  process.exitCode = 1
} finally {
  await service.shell.disable()
  service.logout()
  fs.rmSync(root, { recursive: true, force: true })
}
