import type { TrailGraph, TrailStep } from '../../../../../../../contracts/src/ai/conversation-trail.model'
import { layoutTrail } from './trail-layout'

function fixture(): TrailGraph {
    const graph: TrailGraph = {
        version: 1,
        layer: 'execution',
        conversationId: 'c',
        threadId: 't',
        title: '',
        live: false,
        coverage: [],
        steps: [],
        episodes: [],
        lanes: [
            { id: 'root', parentId: null, title: 'Main', primary: true, status: 'success' },
            {
                id: 'verify',
                parentId: 'root',
                spawnStepId: 'call-verify',
                title: 'Verify',
                primary: false,
                status: 'success'
            },
            { id: 'fix', parentId: 'root', spawnStepId: 'call-fix', title: 'Fix', primary: false, status: 'success' },
            {
                id: 'reverify',
                parentId: 'root',
                spawnStepId: 'call-reverify',
                title: 'Reverify',
                primary: false,
                status: 'success'
            },
            {
                id: 'nested',
                parentId: 'fix',
                spawnStepId: 'call-nested',
                title: 'Nested',
                primary: false,
                status: 'success'
            }
        ]
    }
    const add = (id: string, laneId: string, activity: TrailStep['activity'] = 'other') => {
        graph.steps.push({
            id,
            laneId,
            activity,
            kind: 'tool',
            title: id,
            status: 'success',
            order: graph.steps.length
        })
    }
    add('call-verify', 'root', 'task')
    for (let i = 0; i < 15; i++) add(`verify-${i}`, 'verify', 'verify')
    add('call-fix', 'root', 'task')
    add('before-nested', 'fix')
    add('call-nested', 'fix')
    for (let i = 0; i < 4; i++) add(`nested-${i}`, 'nested')
    for (let i = 0; i < 12; i++) add(`fix-${i}`, 'fix', 'change')
    add('call-reverify', 'root', 'task')
    for (let i = 0; i < 6; i++) add(`reverify-${i}`, 'reverify', 'verify')
    add('answer', 'root', 'answer')
    // One mixed episode deliberately contains delegation and normal calls.
    for (const lane of graph.lanes)
        graph.episodes.push({
            id: `episode-${lane.id}`,
            laneId: lane.id,
            activity: 'other',
            stepIds: graph.steps.filter((step) => step.laneId === lane.id).map((step) => step.id)
        })
    return graph
}

describe('growth tree branching and taper', () => {
    it('places delegation on the owning stem with one mark and no extra delegation twig', () => {
        const graph = fixture(),
            drawing = layoutTrail(graph)
        for (const lane of graph.lanes.filter((lane) => lane.parentId)) {
            const source = drawing.marks.find((mark) => mark.step.id === lane.spawnStepId)!
            const limb = drawing.paths.find((shape) => shape.id === `lane:${lane.id}`)!
            const parent = drawing.paths.find((shape) => shape.id === `lane:${lane.parentId}`)!
            expect(source.junction).toBe(true)
            expect(drawing.marks.filter((mark) => mark.step.id === lane.spawnStepId)).toHaveLength(1)
            expect(limb.samples[0]).toMatchObject({ x: source.x, y: source.y })
            const stem = parent.samples.find((sample) => sample.x === source.x)!
            expect(stem.y).toBe(source.y)
            expect(limb.samples[0].width).toBeLessThanOrEqual(stem.width)
            expect(drawing.paths.filter((shape) => shape.id.includes(`:${lane.spawnStepId}`))).toHaveLength(0)
        }
        expect(drawing.marks).toHaveLength(graph.steps.length)
    })
    it('never makes a limb bend to the opposite side before approaching its own row', () => {
        const drawing = layoutTrail(fixture())
        for (const limb of drawing.paths.filter((shape) => shape.id.startsWith('lane:') && shape.laneId !== 'root')) {
            const first = limb.samples[0],
                last = limb.samples.at(-1)!
            const direction = Math.sign(last.y - first.y)
            for (let i = 1; i < limb.samples.length; i++) {
                expect(limb.samples[i].x).toBeGreaterThanOrEqual(limb.samples[i - 1].x)
                expect(direction * (limb.samples[i].y - limb.samples[i - 1].y)).toBeGreaterThanOrEqual(-1e-8)
            }
        }
    })
    it('uses a continuous filled taper on both stems and activity twigs', () => {
        const drawing = layoutTrail(fixture())
        for (const shape of drawing.paths) {
            expect(shape.outline).toMatch(/^M.* Z$/)
            expect(shape.samples[0].width).toBeGreaterThan(shape.samples.at(-1)!.width)
            for (let i = 1; i < shape.samples.length; i++)
                expect(shape.samples[i].width).toBeLessThanOrEqual(shape.samples[i - 1].width + 1e-8)
        }
        const trunk = drawing.paths.find((shape) => shape.id === 'lane:root')!
        expect(trunk.samples[0].width).toBeGreaterThan(trunk.samples.at(-1)!.width * 5)
        expect(JSON.stringify(drawing)).not.toMatch(/NaN|Infinity/)
    })
    it.each([1, 2, 12, 100])('points leaves toward the twig tip on both sides with %i steps per episode', (count) => {
        for (const layer of ['execution', 'conversation'] as const) {
            const graph = fixture()
            graph.layer = layer
            graph.lanes = graph.lanes.slice(0, 1)
            graph.steps = Array.from({ length: count * 2 }, (_, i) => ({
                id: `leaf-${i}`,
                laneId: 'root',
                activity: 'other',
                kind: layer === 'conversation' ? 'turn' : 'tool',
                title: '',
                status: i % 3 ? 'success' : 'error',
                order: i
            }))
            graph.episodes = [0, 1].map((side) => ({
                id: `episode-${side}`,
                laneId: 'root',
                activity: 'other',
                stepIds: graph.steps.slice(side * count, (side + 1) * count).map((step) => step.id)
            }))
            const drawing = layoutTrail(graph)
            for (const episode of graph.episodes) {
                const twig = drawing.paths.find((shape) => shape.id === `${episode.id}:${episode.stepIds[0]}`)!
                episode.stepIds.forEach((id, i) => {
                    const leaf = drawing.marks.find((mark) => mark.step.id === id)!
                    // Compare the rendered leaf's axis with the independently sampled branch path.
                    const nearest = twig.samples.reduce(
                        (best, point, index) =>
                            Math.hypot(point.x - leaf.x, point.y - leaf.y) <
                            Math.hypot(twig.samples[best].x - leaf.x, twig.samples[best].y - leaf.y)
                                ? index
                                : best,
                        0
                    )
                    const before = twig.samples[Math.max(0, nearest - 1)],
                        after = twig.samples[Math.min(twig.samples.length - 1, nearest + 1)]
                    const dx = after.x - before.x,
                        dy = after.y - before.y,
                        length = Math.hypot(dx, dy)
                    const radians = (leaf.angle * Math.PI) / 180,
                        tipX = Math.sin(radians),
                        tipY = -Math.cos(radians)
                    expect((tipX * dx + tipY * dy) / length).toBeGreaterThan(0.65)
                    expect(Math.sign(dx * tipY - dy * tipX)).toBe(i % 2 ? 1 : -1)
                })
            }
        }
    })
    it('preserves recorded mass when folding a lane and handles out-of-order nested lanes', () => {
        const graph = fixture(),
            full = layoutTrail(graph),
            folded = layoutTrail(graph, new Set(['fix']))
        expect(folded.paths.some((shape) => shape.laneId === 'nested')).toBe(false)
        for (const laneId of ['root', 'fix'])
            expect(
                folded.paths.find((shape) => shape.id === `lane:${laneId}`)!.samples.map((point) => point.width)
            ).toEqual(full.paths.find((shape) => shape.id === `lane:${laneId}`)!.samples.map((point) => point.width))
        graph.lanes = [graph.lanes[4], ...graph.lanes.slice(0, 4)]
        const shuffled = layoutTrail(graph)
        const nested = shuffled.paths.find((shape) => shape.id === 'lane:nested')!
        const source = shuffled.marks.find((mark) => mark.step.id === 'call-nested')!
        expect(nested.samples[0]).toMatchObject({ x: source.x, y: source.y })
    })
    it('keeps missing source anchors dashed without inventing a delegation mark', () => {
        const graph = fixture()
        graph.lanes[1].spawnStepId = undefined
        const drawing = layoutTrail(graph)
        expect(drawing.paths.find((shape) => shape.id === 'lane:verify')?.uncertain).toBe(true)
        expect(drawing.marks.find((mark) => mark.step.id === 'call-verify')?.junction).toBe(false)
    })
    it('continues a selected discussion trunk without a thin seam between shared and current segments', () => {
        const graph = fixture()
        graph.layer = 'conversation'
        graph.lanes = graph.lanes.slice(0, 2).map((lane) => ({ ...lane, primary: true }))
        graph.steps = graph.steps
            .filter((step) => step.id === 'call-verify' || step.laneId === 'verify')
            .map((step) => ({ ...step, kind: 'turn' }))
        graph.episodes = graph.episodes.slice(0, 2).map((episode) => ({
            ...episode,
            stepIds: episode.stepIds.filter((id) => graph.steps.some((step) => step.id === id))
        }))
        const drawing = layoutTrail(graph)
        const common = drawing.paths.find((shape) => shape.id === 'lane:root')!
        const current = drawing.paths.find((shape) => shape.id === 'lane:verify')!
        expect(common.samples.at(-1)).toEqual(current.samples[0])
        expect(drawing.tips.map((tip) => tip.lane.id)).toEqual(['verify'])
    })
})
