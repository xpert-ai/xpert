import { HumanMessage, AIMessage } from '@langchain/core/messages'
import { FakeListChatModel } from '@langchain/core/utils/testing'
import { estimateContextMessages } from './context-budget'
import { generateStateSnapshot, retainsRequiredContext } from './context-compression-summary'

const accepted = JSON.stringify({ valid: true, missing_constraints: [], superseded_constraints: [] })
const snapshot = (summary: string, constraints: string[] = []) =>
    JSON.stringify({ summary, active_user_constraints: constraints })

describe('validated context summaries', () => {
    it.each(['json', '', 'JSON'])('accepts a complete %s fence in both summary and review output', async (language) => {
        const wrap = (json: string) => `  \n\`\`\`${language}\r\n${json}\r\n\`\`\`\n`
        const constraint = 'Reply only "Received batch N".'
        const model = new FakeListChatModel({
            responses: [wrap(snapshot('Keep the literal ``` marker.', [constraint])), wrap(accepted)]
        })
        const result = await generateStateSnapshot([new HumanMessage(constraint)], [], model, 32768, 3000)
        expect(result).toContain(`<constraint>${constraint}</constraint>`)
        expect(result).toContain('Keep the literal ``` marker.')
    })

    it.each([
        `Commentary\n\`\`\`json\n${accepted}\n\`\`\``,
        `\`\`\`json\n${accepted}\n\`\`\`\nMore commentary`,
        `\`\`\`json\n${accepted}`,
        `\`\`\`json\n${accepted}\n\`\`\`\n\`\`\`json\n${accepted}\n\`\`\``,
        `\`\`\`javascript\n${accepted}\n\`\`\``,
        '\`\`\`json\n{"valid":true}\n\`\`\`'
    ])('rejects mixed, incomplete or invalid fenced review output: %s', async (review) => {
        const model = new FakeListChatModel({ responses: [snapshot('Earlier batches.'), review] })
        await expect(generateStateSnapshot([new HumanMessage('old')], [], model, 32768, 3000)).rejects.toMatchObject({
            reason: 'summary_invalid'
        })
    })

    it('keeps an exact response constraint in a dedicated section and includes recent corrections in both passes', async () => {
        const constraint = 'For each batch reply only "Received batch N" until I request verification.'
        const model = new FakeListChatModel({ responses: [snapshot('Collecting batches.', [constraint]), accepted] })
        const invoke = jest.spyOn(model, 'invoke')
        const output = await generateStateSnapshot(
            [new HumanMessage(constraint), new AIMessage('I will produce detailed analysis.')],
            [new HumanMessage('Do not analyze yet; continue receiving.')],
            model,
            32768,
            3000
        )
        expect(output).toContain(`<constraint>${constraint}</constraint>`)
        expect(invoke).toHaveBeenCalledTimes(2)
        for (const [input, config] of invoke.mock.calls) {
            expect(JSON.stringify(input)).toContain('Do not analyze yet')
            expect(config?.metadata?.internal).toBe(true)
        }
    })

    it.each([
        { valid: false, missing_constraints: ['Reply only received'], superseded_constraints: [] },
        { valid: false, missing_constraints: [], superseded_constraints: ['No longer reply only received'] },
        { valid: true, missing_constraints: ['Contradiction must still fail'], superseded_constraints: [] }
    ])('rejects missing or incorrectly revived user constraints: %j', async (review) => {
        const model = new FakeListChatModel({ responses: [snapshot('Analyze every batch.'), JSON.stringify(review)] })
        await expect(
            generateStateSnapshot(
                [new HumanMessage('Reply only received.')],
                [new HumanMessage('Now stop receiving and start verification.')],
                model,
                32768,
                3000
            )
        ).rejects.toMatchObject({ reason: 'summary_constraints_lost' })
    })

    it.each([
        ['garbage', 'summary_invalid'],
        [JSON.stringify({ summary: 'Missing the required constraints field' }), 'summary_invalid'],
        [snapshot('x'.repeat(20000)), 'summary_output_budget']
    ])('classifies summary generation failure without treating it as no gain', async (response, reason) => {
        const model = new FakeListChatModel({ responses: [response] })
        await expect(generateStateSnapshot([new HumanMessage('old')], [], model, 32768, 1000)).rejects.toMatchObject({
            reason
        })
    })

    it('bounds rolling generation and validation and carries forward accepted constraints', async () => {
        const model = new FakeListChatModel({
            responses: [snapshot('Earlier batches', ['Reply only received']), accepted]
        })
        const invoke = jest.spyOn(model, 'invoke')
        const result = await generateStateSnapshot([new HumanMessage('x'.repeat(400000))], [], model, 32768, 3000)
        expect(result).toContain('Reply only received')
        expect(invoke.mock.calls.length).toBeGreaterThan(2)
        for (const [input] of invoke.mock.calls) {
            if (!Array.isArray(input) || !input.every((message) => message instanceof HumanMessage))
                throw new Error('Unexpected request')
            expect(estimateContextMessages(input) + 3000).toBeLessThanOrEqual(Math.floor(32768 * 0.85))
        }
        expect(JSON.stringify(invoke.mock.calls[2][0])).toContain('Reply only received')
    })

    it('does not truncate oversized recent user constraints to make validation fit', async () => {
        const model = new FakeListChatModel({ responses: [snapshot('unused')] })
        const invoke = jest.spyOn(model, 'invoke')
        await expect(
            generateStateSnapshot([new HumanMessage('old')], [new HumanMessage('x'.repeat(150000))], model, 32768, 3000)
        ).rejects.toMatchObject({ reason: 'summary_input_budget' })
        expect(invoke).not.toHaveBeenCalled()
    })

    it('rejects a later rolling candidate when it drops previously accepted verification values', async () => {
        const constraint = 'Keep every batch identifier, region and check value for later verification.'
        const model = new FakeListChatModel({
            responses: [
                snapshot('BATCH-01: north; check alpha.', [constraint]),
                accepted,
                snapshot('BATCH-02: south; check beta.', [constraint]),
                JSON.stringify({
                    valid: false,
                    missing_constraints: ['BATCH-01: north; check alpha.'],
                    superseded_constraints: []
                })
            ]
        })
        const invoke = jest.spyOn(model, 'invoke')
        await expect(
            generateStateSnapshot(
                [new HumanMessage(constraint), new HumanMessage('x'.repeat(150000))],
                [],
                model,
                32768,
                3000
            )
        ).rejects.toMatchObject({ reason: 'summary_constraints_lost' })
        expect(invoke).toHaveBeenCalledTimes(4)
        expect(JSON.stringify(invoke.mock.calls[3][0])).toContain('BATCH-01: north; check alpha.')
    })

    it('detects downstream loss of accepted memory or the latest user input', () => {
        const memory = new HumanMessage({ content: 'Validated constraints', additional_kwargs: { compressed: true } })
        const latest = new HumanMessage('Verify batch 8')
        expect(retainsRequiredContext([memory, latest], [memory, latest, new AIMessage('extra')])).toBe(true)
        expect(retainsRequiredContext([memory, latest], [latest])).toBe(false)
        expect(retainsRequiredContext([memory, latest], [memory, new HumanMessage('Ignore batch 8')])).toBe(false)
    })

    it('allows the provider adapter to remove unsupported media while retaining user instructions', () => {
        const latest = new HumanMessage({
            content: [
                { type: 'text', text: 'Reply in Chinese' },
                { type: 'image_url', image_url: { url: 'https://example.com/image.png' } }
            ]
        })
        expect(retainsRequiredContext([latest], [new HumanMessage('Reply in Chinese')])).toBe(true)
        expect(retainsRequiredContext([latest], [new HumanMessage('Different instructions')])).toBe(false)
    })
})
