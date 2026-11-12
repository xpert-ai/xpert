#!/usr/bin/env node
// Verify recorded rollout completion; current ingress and business acceptance remain separate.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  assertResponseOk, createRequestHeaders, getJson, handleCliError, parseCliArgs,
  requireAuthentication, resolvePluginEndpoint, summarizePluginRuntimeTarget
} from './local-plugin-cli.mjs'

/** Bind a trusted local deployment receipt to the explicitly selected instance and artifact. */
export function readRuntimeTarget(manifest, { pluginEndpoint, name, scopeKey, version, revision }) {
  if (manifest?.schemaVersion !== 'xpert-local-plugin-deployment@1') {
    throw new Error('Expected a local plugin deployment manifest')
  }
  if (manifest.deployment?.pluginEndpoint !== pluginEndpoint) {
    throw new Error('Deployment manifest belongs to a different API endpoint or lacks endpoint tracking')
  }
  if (manifest.plugin?.name !== name) throw new Error('Deployment manifest plugin does not match')
  const target = summarizePluginRuntimeTarget(manifest.deployment)
  if (!target.runtimeConvergence) {
    throw new Error('Deployment manifest has no tracked runtime generation; an install target alone cannot verify activation')
  }
  const matches = target.runtimeRequirements?.filter(item => item.pluginName === name && item.scopeKey === scopeKey)
  if (matches?.length !== 1) throw new Error('Expected exactly one installation target at the selected scope')
  const requirement = matches[0]
  if (requirement.state !== 'loaded') throw new Error('Installation target does not require loading this plugin')
  if (!revision || requirement.runtimeRevision !== revision) throw new Error('Installation target revision does not match')
  if (version && requirement.version !== version) throw new Error('Installation target version does not match')
  return { generation: target.runtimeConvergence.generation, requirement }
}

export function verifyRuntimeConvergence(status, target) {
  if (status?.generation !== target.generation) throw new Error('Runtime convergence response generation does not match')
  if (status.status !== 'completed') {
    const state = ['in_progress', 'awaiting_restart', 'failed'].includes(status.status) ? status.status : 'unknown'
    throw new Error(`Runtime convergence is not completed: ${state}`)
  }
  for (const key of ['targetReplicaCount', 'completedReplicaCount', 'failedReplicaCount']) {
    if (!Number.isSafeInteger(status[key]) || status[key] < 0) throw new Error('Invalid runtime replica counts')
  }
  if (status.failedReplicaCount !== 0 || status.completedReplicaCount !== status.targetReplicaCount) {
    throw new Error('Runtime replica counts do not confirm completion')
  }
  return {
    checkedAt: new Date().toISOString(),
    runtimeConvergenceVerified: true,
    currentRuntimeVerified: false,
    businessAcceptance: false,
    target: target.requirement,
    operation: {
      generation: target.generation,
      status: status.status,
      ...(typeof status.restartId === 'string' ? { restartId: status.restartId } : {}),
      targetReplicaCount: status.targetReplicaCount,
      completedReplicaCount: status.completedReplicaCount,
      failedReplicaCount: status.failedReplicaCount
    }
  }
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2), { booleanFlags: ['noKeychain', 'help'] })
  if (args.help) {
    console.log(`Usage: verify-plugin-runtime.mjs --manifest-file <deployment.json> --plugin-name <name> --scope-key <key> --expected-revision <revision> [--expected-version <version>] [--evidence <file>]
Use the same API and authentication/scope options as deploy-local-plugin.mjs.
The manifest must retain the installation's runtimeConvergence and runtimeRequirements.
Reads that generation once; pending, failed, expired or untracked operations fail verification.
Checks recorded rollout completion only, not current serving replicas or plugin business behavior.
Does not install plugins, request restarts or poll automatically.`)
    return
  }
  if (!args.manifestFile || !args.pluginName || !args.scopeKey || !args.expectedRevision) {
    throw new Error('--manifest-file, --plugin-name, --scope-key and --expected-revision are required')
  }
  const pluginEndpoint = resolvePluginEndpoint(args)
  if (!pluginEndpoint.endsWith('/plugin')) throw new Error('Plugin endpoint must end in /plugin')
  const manifest = JSON.parse(readFileSync(args.manifestFile, 'utf8'))
  const target = readRuntimeTarget(manifest, { pluginEndpoint, name: args.pluginName, scopeKey: args.scopeKey,
    revision: args.expectedRevision, version: args.expectedVersion })
  const auth = await requireAuthentication(args)
  const headers = createRequestHeaders(args, auth.token, auth.tenantId)
  if (manifest.plugin.installScope !== headers['x-scope-level'] ||
      manifest.plugin.tenantId !== (headers['tenant-id'] ?? null) ||
      manifest.plugin.organizationId !== (headers['organization-id'] ?? null)) {
    throw new Error('Authentication scope does not match the deployment manifest')
  }
  const endpoint = `${pluginEndpoint.slice(0, -'/plugin'.length)}/system/runtime/plugin-convergence/${target.generation}`
  const response = await getJson(endpoint, headers)
  assertResponseOk('Runtime convergence verification', response)
  const result = { pluginEndpoint, ...verifyRuntimeConvergence(response.body, target) }
  if (args.evidence) writeFileSync(args.evidence, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 })
  console.log(JSON.stringify(result))
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => handleCliError('verify-plugin-runtime', error))
}
