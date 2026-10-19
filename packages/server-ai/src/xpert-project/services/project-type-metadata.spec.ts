import { projectApplicationDefinitions } from './project-type-metadata'

function metadata(taskConcurrency?: object) {
    return {
        xpert: {
            marketplace: {
                contents: [
                    {
                        type: 'app',
                        name: 'test',
                        projectTypes: [
                            {
                                key: 'test',
                                title: 'Test',
                                binding: { kind: 'entity', providerKey: 'test.project' },
                                taskConcurrency
                            }
                        ]
                    }
                ]
            }
        }
    }
}

describe('Project type business-task policy', () => {
    it('retains a typed policy for the owning business dispatcher', () => {
        expect(projectApplicationDefinitions(metadata({ maxConcurrentTasks: 4 }))[0]?.projectTypes[0]).toMatchObject({
            taskConcurrency: { maxConcurrentTasks: 4 },
            binding: { kind: 'entity' }
        })
    })
    it('leaves other project types unchanged when no policy is declared', () => {
        expect(projectApplicationDefinitions(metadata())[0]?.projectTypes[0]?.taskConcurrency).toBeUndefined()
    })
    it.each([0, -1, 1.5, NaN, Infinity, '4', null])('rejects an invalid capacity %s', (maxConcurrentTasks) => {
        expect(() => projectApplicationDefinitions(metadata({ maxConcurrentTasks }))).toThrow()
    })
})
