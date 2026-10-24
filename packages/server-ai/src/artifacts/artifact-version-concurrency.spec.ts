import { assertArtifactVersionPrecondition } from './artifact-version-concurrency'
import type { EnsureArtifactVersionInput } from '@xpert-ai/plugin-sdk'
const input: EnsureArtifactVersionInput = {
    artifactId: 'artifact',
    idempotencyKey: 'hash',
    mimeType: 'application/json',
    workspaceFileRef: { source: 'platform.workspace.files', filePath: 'a.json', workspacePath: '/workspace/a.json' }
}
describe('Artifact version compare-and-set', () => {
    it('permits a first version and an idempotent retry of the current version', () => {
        expect(() =>
            assertArtifactVersionPrecondition({ ...input, expectedCurrentVersionId: null }, null)
        ).not.toThrow()
        expect(() =>
            assertArtifactVersionPrecondition({ ...input, expectedCurrentVersionId: null }, 'version', 'version')
        ).not.toThrow()
    })
    it('rejects a concurrent update and does not replay an older save over the current version', () => {
        expect(() => assertArtifactVersionPrecondition({ ...input, expectedCurrentVersionId: 'old' }, 'new')).toThrow()
        expect(() =>
            assertArtifactVersionPrecondition({ ...input, expectedCurrentVersionId: null }, 'new', 'old')
        ).toThrow()
    })
    it('preserves callers that do not opt into the guard', () => {
        expect(() => assertArtifactVersionPrecondition(input, 'current')).not.toThrow()
    })
})
