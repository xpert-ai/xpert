import { type ProjectTaskExecutionPurpose, type ProjectTaskSpecification } from '@xpert-ai/contracts'
import { projectExecutionReviewPrompt } from './project-execution-review-prompt'

const implementationId = '611c6901-65bd-4b7b-b317-14db04072c0d'
const purpose: Extract<ProjectTaskExecutionPurpose, { type?: 'review' }> = {
    type: 'review',
    mode: 'execution',
    implementationExecutionId: '274728f7-d582-4d6d-8eca-c2bbf7317fa1',
    implementationInvocationId: implementationId,
    specificationDigest: 'sha256:' + 'a'.repeat(64),
    candidatePaths: ['plugin'],
    evidence: [
        { type: 'invocation_result', invocationId: implementationId, revision: 7 },
        {
            type: 'artifact',
            artifactId: 'daacbc77-c874-4671-990b-e34a35d0b9c2',
            versionId: '809bcc24-689b-43b8-bd73-81b0f11e8854'
        }
    ]
}
const specification: ProjectTaskSpecification = {
    version: 1,
    title: 'Verify the plugin',
    requirements: ['Return accurate totals'],
    steps: []
}

describe('Project execution-review protocol', () => {
    it('requests a plain Markdown report without encoded result examples', () => {
        const prompt = projectExecutionReviewPrompt(
            purpose,
            specification,
            'Implementation claims success',
            'Check totals'
        )
        expect(prompt).toContain('Markdown')
        expect(prompt).not.toContain('```xpert-task-result')
        expect(prompt).toContain('Implementation claims success')
    })

    it('keeps reviewer work separate from the pinned candidate and final task acceptance', () => {
        const prompt = projectExecutionReviewPrompt(
            purpose,
            specification,
            'Claimed result',
            'Reproduce F1',
            '/project'
        )
        expect(prompt).toContain('Do not modify the candidate business code or accept the Project task yourself.')
        expect(prompt).toContain('Do not publish externally or change the coordinating platform.')
        expect(prompt).not.toMatch(/review-context\.json|output\/work\/|Computer/)
        expect(prompt).toContain('Original implementation directory: "/project"')
        expect(prompt).toContain('Coordinator review scope and feedback: Reproduce F1')
    })
})
