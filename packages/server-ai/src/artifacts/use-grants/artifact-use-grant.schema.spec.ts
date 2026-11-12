import { randomUUID } from 'node:crypto'
import {
    offerArtifactUseGrantSchema,
    changeArtifactUseGrantSchema,
    readArtifactUseGrantSchema
} from './artifact-use-grant.schema'

describe('Artifact use grant adapter schemas', () => {
    const offer = {
        artifactId: randomUUID(),
        versionId: randomUUID(),
        targetGroupId: randomUUID(),
        expiresAt: '2026-12-01T00:00:00Z'
    }
    it('parses a fixed published version and expiry without accepting authority overrides', () => {
        expect(offerArtifactUseGrantSchema.parse(offer).expiresAt).toEqual(new Date(offer.expiresAt))
        for (const field of ['actor', 'ownerProjectId', 'targetProjectId', 'permission', 'status', 'versionMode']) {
            expect(offerArtifactUseGrantSchema.safeParse({ ...offer, [field]: 'override' }).success).toBe(false)
        }
        expect(offerArtifactUseGrantSchema.safeParse({ ...offer, expiresAt: 'tomorrow' }).success).toBe(false)
        expect(offerArtifactUseGrantSchema.safeParse({ ...offer, versionId: 'latest' }).success).toBe(false)
    })
    it('requires a revision for mutations and the exact audience for reads', () => {
        expect(changeArtifactUseGrantSchema.safeParse({ grantId: randomUUID(), expectedRevision: 0 }).success).toBe(
            false
        )
        expect(changeArtifactUseGrantSchema.safeParse({ grantId: randomUUID(), expectedRevision: 1 }).success).toBe(
            true
        )
        expect(readArtifactUseGrantSchema.safeParse({ grantId: randomUUID(), projectId: randomUUID() }).success).toBe(
            false
        )
        expect(
            readArtifactUseGrantSchema.safeParse({
                grantId: randomUUID(),
                groupId: randomUUID(),
                projectId: randomUUID(),
                operation: 'write'
            }).success
        ).toBe(false)
    })
})
