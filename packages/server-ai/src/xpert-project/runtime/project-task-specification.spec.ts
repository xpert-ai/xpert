import { projectTaskSpecificationSchema } from '@xpert-ai/contracts'
import {
    createProjectTaskSpecificationSnapshot,
    parseProjectTaskSpecificationSnapshot
} from './project-task-specification'

const specification = projectTaskSpecificationSchema.parse({
    version: 1,
    title: 'Create report',
    requirements: ['Cite evidence'],
    steps: [
        { stepIndex: 2, description: 'Write' },
        { stepIndex: 1, description: 'Read' }
    ]
})

describe('project task specification identity', () => {
    it('is stable across property/step order and omitted empty description', () => {
        const snapshot = createProjectTaskSpecificationSnapshot(specification)
        expect(
            createProjectTaskSpecificationSnapshot({
                steps: [...specification.steps].reverse(),
                requirements: specification.requirements,
                title: specification.title,
                description: '',
                version: 1
            }).digest
        ).toBe(snapshot.digest)
        expect(parseProjectTaskSpecificationSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot)
        expect(specification.steps[0].stepIndex).toBe(2)
    })

    it('changes on each semantic requirement change, but never includes task progress fields', () => {
        const snapshot = createProjectTaskSpecificationSnapshot(specification)
        for (const change of [
            { title: 'Other report' },
            { description: 'Additional context' },
            { requirements: ['New requirement'] },
            { steps: [{ stepIndex: 1, description: 'Other step' }] }
        ])
            expect(createProjectTaskSpecificationSnapshot({ ...specification, ...change }).digest).not.toBe(
                snapshot.digest
            )
        const withProgress = { ...specification, revision: 20, status: 'in_progress', progress: 90 }
        expect(createProjectTaskSpecificationSnapshot(withProgress)).toEqual(snapshot)
    })

    it('rejects changed content with an old digest and injected persisted fields', () => {
        const snapshot = createProjectTaskSpecificationSnapshot(specification)
        expect(() =>
            parseProjectTaskSpecificationSnapshot({
                ...snapshot,
                specification: { ...snapshot.specification, requirements: ['Forged'] }
            })
        ).toThrow()
        expect(() => parseProjectTaskSpecificationSnapshot({ ...snapshot, status: 'done' })).toThrow()
        expect(() => parseProjectTaskSpecificationSnapshot({ ...snapshot, digest: 'invalid' })).toThrow()
    })
})
