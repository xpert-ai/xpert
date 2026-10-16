// Invariants: receipts contain operational IDs/hashes, never credentials or full draft content.
// Write checkpoints before requests; an interrupted publication is reconciled against the live graph.
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { LocalPluginCliError } from '../local-plugin-cli.mjs'

export function hash(value) {
  const canonical = (item) =>
    Array.isArray(item)
      ? item.map(canonical)
      : item && typeof item === 'object'
        ? Object.fromEntries(
            Object.keys(item)
              .sort()
              .filter((key) => item[key] !== undefined)
              .map((key) => [key, canonical(item[key])])
          )
        : item
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex')
}

export function graphHash(graph) {
  const nodes = (graph?.nodes ?? [])
    .map((node) => {
      const entity = { ...node.entity }
      if (node.type === 'agent') {
        for (const key of [
          'id',
          'createdAt',
          'updatedAt',
          'createdById',
          'updatedById',
          'tenantId',
          'organizationId',
          'teamId',
          'xpertId',
          'leaderKey',
          'toolsetIds',
          'knowledgebaseIds',
          'collaboratorNames',
          'copilotModelId'
        ])
          delete entity[key]
        entity.copilotModel = modelSelection(entity.copilotModel)
      }
      if (node.type === 'xpert') return { key: node.key, type: node.type, id: entity.id, version: entity.version }
      return { key: node.key, type: node.type, entity }
    })
    .sort((a, b) => a.key.localeCompare(b.key))
  const edges = (graph?.connections ?? [])
    .map(({ key, ...edge }) => edge)
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  return hash({ nodes, connections: edges })
}

function modelSelection(model) {
  if (!model) return null
  return {
    copilotId: model.copilotId,
    model: model.model,
    modelType: model.modelType,
    options: model.options ?? null,
    referencedId: model.referencedId
  }
}

export function stateHash(team) {
  return hash({
    version: team.version ?? null,
    graph: graphHash(team.draft ?? team.graph),
    environmentId: team.environmentId ?? null,
    team: team.draft?.team ? authoringProperties(team.draft.team) : authoringProperties(team)
  })
}

export function modelHash(team) {
  const selected = team.draft?.team ?? team
  return hash(
    [
      selected.copilotModel,
      selected.memory?.copilotModel,
      selected.features?.speechToText?.copilotModel,
      selected.features?.textToSpeech?.copilotModel
    ].map(modelSelection)
  )
}

function authoringProperties(team) {
  return {
    title: team.title,
    description: team.description,
    copilotModel: modelSelection(team.copilotModel),
    options: team.options,
    features: team.features,
    agentConfig: team.agentConfig,
    memory: team.memory,
    summarize: team.summarize
  }
}

export function readReceipt(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    throw new LocalPluginCliError('Cannot read the release/installation receipt.')
  }
}

export function saveReceipt(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  const temporary = `${file}.${process.pid}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  fs.renameSync(temporary, file)
  fs.chmodSync(file, 0o600)
}

export function lockReceipt(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  const lock = `${file}.lock`
  // A process killed between checkpoints can leave its lock. Reclaim only a local, dead PID.
  if (fs.existsSync(lock)) {
    const pid = Number(fs.readFileSync(lock, 'utf8'))
    let alive = true
    if (Number.isInteger(pid) && pid > 0) {
      try {
        process.kill(pid, 0)
      } catch (error) {
        if (error.code === 'ESRCH') alive = false
      }
    }
    if (alive) throw new LocalPluginCliError('This release receipt is already in use.')
    fs.unlinkSync(lock)
  }
  const descriptor = fs.openSync(lock, 'wx', 0o600)
  fs.writeFileSync(descriptor, String(process.pid))
  fs.closeSync(descriptor)
  return () => fs.unlinkSync(lock)
}
