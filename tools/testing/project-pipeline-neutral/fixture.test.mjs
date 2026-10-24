import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { projectPipelineContributionSchema } from '@xpert-ai/plugin-sdk'
import { NeutralContribution, NeutralSubject, NeutralOperation, NeutralHumanPolicy } from './dist/index.js'

test('the compiled plugin validates as a public contribution', () => {
  const parsed = projectPipelineContributionSchema.parse(new NeutralContribution())
  assert.equal(parsed.configurations[0].template.executionAuthority, 'platform')
  assert.equal(parsed.forms[0].assistantSlots.length, 0)
  assert.equal(parsed.configurations.length, 7)
  assert.equal(parsed.configurations[1].template.nodes.filter((node) => node.kind === 'human_gate').length, 2)
})
test('capability acceptance templates preserve legacy definitions and declare an unsupported protocol separately', () => {
  const parsed = projectPipelineContributionSchema.parse(new NeutralContribution())
  assert.ok(parsed.configurations.slice(0, 4).every((item) => !item.template.hostRequirements))
  assert.deepEqual(parsed.configurations[4].template.hostRequirements, {
    protocol: 1,
    features: { 'pipeline.core': 1, 'pipeline.managed': 1 }
  })
  assert.deepEqual(parsed.configurations[5].template.hostRequirements, {
    protocol: 1,
    features: { 'pipeline.acceptance_future': 1 }
  })
})
test('human confirmation accepts only the configured fixture selector and Project-scoped subject', async () => {
  const c = { projectId: randomUUID(), actor: { tenantId: randomUUID(), userId: randomUUID() } }
  const subject = await new NeutralSubject().resolve(c, `${randomUUID()}@${Date.now()}`)
  const policy = new NeutralHumanPolicy(),
    context = { ...c, subjects: [subject] }
  const input = { candidateSelectionKey: 'acceptance_project_editors', outcome: 'accept', evidence: [] }
  assert.equal(await policy.authorizeDecision(context, input), true)
  assert.equal(await policy.authorizeDecision({ ...context, projectId: randomUUID() }, input), false)
  assert.equal(await policy.authorizeDecision(context, { ...input, candidateSelectionKey: 'unconfigured' }), false)
  assert.equal(await policy.authorizeDecision(context, { ...input, outcome: 'unconfigured' }), false)
  assert.equal(await policy.authorizeDecision({ ...context, subjects: [] }, input), false)
})
test('subject resolution is stable on replay and scoped to its owning Project', async () => {
  const resolver = new NeutralSubject(),
    c = { projectId: randomUUID(), actor: { tenantId: randomUUID(), userId: randomUUID() } }
  const key = `${randomUUID()}@${Date.now() + 60_000}`,
    first = await resolver.resolve(c, key)
  assert.deepEqual(await resolver.resolve(c, key), first)
  assert.equal(await resolver.checkCurrent(c, first), true)
  assert.equal(await resolver.checkCurrent({ ...c, projectId: randomUUID() }, first), false)
})
test('unknown work recovers by inspection and can be cancelled without an external effect', async () => {
  const resolver = new NeutralSubject(),
    operation = new NeutralOperation()
  const c = {
    projectId: randomUUID(),
    actor: { tenantId: randomUUID(), userId: randomUUID() },
    idempotencyKey: randomUUID(),
    parameters: { mode: 'recover' }
  }
  const subject = await resolver.resolve(c, `${randomUUID()}@${Date.now() - 1_000}`),
    context = { ...c, subjects: [subject] }
  assert.equal((await operation.execute(context)).status, 'unknown')
  assert.equal((await operation.inspect(context)).status, 'succeeded')
  assert.equal((await operation.cancel(context)).status, 'cancelled')
  assert.equal((await operation.execute({ ...context, parameters: { mode: 'fail' } })).status, 'failed')
})
