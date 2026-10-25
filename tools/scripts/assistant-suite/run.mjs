// CLI adapter: authentication, HTTP transport and private filesystem receipts stay here.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { assertResponseOk, getJson, postJson } from '../local-plugin-cli.mjs'
import { findByName } from './profile.mjs'
import { lockReceipt, readReceipt, saveReceipt } from './state.mjs'
import { executeSuite } from '../../../packages/server-ai/src/plugin-resource/application-update/engine/run.cjs'

export async function runSuite(context) {
  const { args, headers, apiRoot, workspaceId, organizationId } = context
  const file = path.resolve(
    args.manifestFile || path.join(os.homedir(), '.xpert', 'assistant-suites', `${context.runId}.json`)
  )
  const release = lockReceipt(file)
  const request = async (method, url, body) => {
    const response = await (method === 'GET'
      ? getJson(`${apiRoot}${url}`, headers)
      : postJson(`${apiRoot}${url}`, headers, body))
    assertResponseOk('Assistant suite API', response)
    return response.body
  }
  const endpoint = (id) => `/xpert/${encodeURIComponent(id)}`
  try {
    const receipt = await executeSuite({
      ...context,
      scope: { tenantId: headers['tenant-id'] ?? null, organizationId, workspaceId },
      receipt: fs.existsSync(file) ? readReceipt(file) : null,
      installation: args.installationFile ? readReceipt(args.installationFile) : null,
      save: async (value) => saveReceipt(file, value),
      progress: (key) => console.log(`[assistant:suite:init] Published: ${key}`),
      ports: {
        plugins: (name) => request('POST', '/plugin/by-names', { names: [name] }),
        template: (id) => request('GET', `/xpert-template/${encodeURIComponent(id)}`),
        find: (name) => findByName(apiRoot, headers, workspaceId, name),
        load: async (id) => {
          const live = await request('GET', endpoint(id))
          const data = encodeURIComponent(
            JSON.stringify({ relations: ['copilotModel', 'agent', 'agent.copilotModel', 'agents.copilotModel'] })
          )
          const team = await request('GET', `${endpoint(id)}/team?data=${data}`)
          if (team.id !== id) throw new Error('Assistant team identity mismatch')
          return { ...team, ...live, graph: team.graph, draft: live.draft ?? null }
        },
        install: (id, input) => request('POST', `/xpert-template/${encodeURIComponent(id)}/install`, input),
        sync: (id) => request('POST', `${endpoint(id)}/sync-template`, {}),
        draft: (id, draft) => request('POST', `${endpoint(id)}/draft`, draft),
        publish: (id, input) => request('POST', `${endpoint(id)}/publish?newVersion=true`, input),
        resume: (id, version) => request('POST', `${endpoint(id)}/publication/resume`, { version })
      }
    })
    console.log(`[assistant:suite:init] ${context.profile.key} is published and ready for testing.`)
    return receipt
  } finally {
    release()
  }
}
