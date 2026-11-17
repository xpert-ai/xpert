import { humanDecisionInputSchema, humanDecisionSchema } from './human-decision.model'

const label = { en_US: 'Accept', zh_Hans: '接受' }
const card = {
  type: 'human_decision',
  schemaVersion: 1,
  requestVersion: 3,
  choices: [
    { key: 'accept', label },
    { key: 'reject', label: { en_US: 'Decline', zh_Hans: '拒绝' } }
  ]
}
const command = {
  schemaVersion: 1,
  requestId: 'case/42',
  sourceRevision: 'r8',
  requestVersion: 3,
  choice: 'accept',
  commandId: 'd9c7f3d3-544d-403d-bdd3-a809267bad84'
}

it('takes the request identity and business revision only from the output reference when rendering a card', () => {
  expect(humanDecisionSchema.parse(card)).toEqual(card)
  expect(humanDecisionSchema.safeParse({ ...card, requestId: command.requestId }).success).toBe(false)
  expect(humanDecisionSchema.safeParse({ ...card, quoteRevision: 8 }).success).toBe(false)
  expect(humanDecisionSchema.safeParse({ ...card, schemaVersion: 2 }).success).toBe(false)
})

it('requires the source revision and the declared command schema', () => {
  expect(humanDecisionInputSchema.parse(command)).toEqual(command)
  const { sourceRevision, ...incomplete } = command
  expect(humanDecisionInputSchema.safeParse({ ...incomplete, quoteRevision: 8 }).success).toBe(false)
  expect(humanDecisionInputSchema.safeParse({ ...command, schemaVersion: undefined }).success).toBe(false)
  expect(humanDecisionInputSchema.safeParse({ ...command, schemaVersion: 2 }).success).toBe(false)
})
