import { resolveSandboxWorkFor } from './sandbox-work-for'

describe('Sandbox binding selection', () => {
    it('keeps an explicit environment stable across projects', () => {
        for (const projectId of ['project-a', 'project-b', null]) {
            expect(resolveSandboxWorkFor({ environmentId: 'environment', projectId, userId: 'user' })).toEqual({
                type: 'environment',
                id: 'environment'
            })
        }
    })

    it('uses the same project binding for different authorized actors when no environment is selected', () => {
        for (const userId of ['user-a', 'user-b']) {
            expect(resolveSandboxWorkFor({ environmentId: null, projectId: 'project', userId })).toEqual({
                type: 'project',
                id: 'project'
            })
        }
    })

    it('uses the actor binding for personal work without an explicit environment', () => {
        expect(resolveSandboxWorkFor({ userId: 'user-a' })).toEqual({ type: 'user', id: 'user-a' })
        expect(resolveSandboxWorkFor({ environmentId: null, projectId: null, userId: 'user-b' })).toEqual({
            type: 'user',
            id: 'user-b'
        })
    })
})
