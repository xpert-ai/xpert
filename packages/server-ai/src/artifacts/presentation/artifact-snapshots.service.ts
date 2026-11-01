import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import type { ArtifactPresentation } from '@xpert-ai/contracts'
import type { ArtifactSnapshotContext } from '@xpert-ai/plugin-sdk'
import { ArtifactsService } from '../artifacts.service'
import { ArtifactTypesService } from '../types/artifact-types.service'
import { runWithCapturedRequestContext } from '../../shared/request-context'

type ReadInput = Parameters<ArtifactsService['resolveForPublicAccess']>[0]

/** Snapshot providers cannot declare a query channel or borrow the creator's identity. */
@Injectable()
export class ArtifactSnapshotsService {
    constructor(
        private readonly artifacts: ArtifactsService,
        private readonly types: ArtifactTypesService
    ) {}

    async read(input: ReadInput) {
        const resolved = await this.artifacts.resolveForPublicAccess(input)
        const provider = this.types.provider(resolved.artifact)
        if (provider.definition.presentation.mode !== 'snapshot' || !provider.snapshot) throw new NotFoundException()
        const principal = input.principal
        const context: ArtifactSnapshotContext = {
            source: resolved.artifact,
            content: resolved.buffer,
            viewer:
                principal?.tenantId && principal.userId
                    ? { kind: 'authenticated', actor: { tenantId: principal.tenantId, userId: principal.userId } }
                    : { kind: 'anonymous' }
        }
        const snapshot = provider.snapshot
        // Rendering a frozen export grants no ambient identity for calling source APIs.
        const { data, entry } = await runWithCapturedRequestContext({ user: null, headers: {} }, async () => ({
            data: await snapshot.read(context),
            entry: snapshot.kind === 'plugin' ? await snapshot.getEntry() : null
        }))
        await this.artifacts.assertPublishedTarget(input, resolved.version.id)
        if (this.types.provider(resolved.artifact) !== provider) throw new ConflictException()
        return { resolved, data, entry }
    }

    async presentation(input: ReadInput): Promise<ArtifactPresentation> {
        const { resolved, data, entry } = await this.read(input)
        if (!entry) throw new NotFoundException()
        return {
            schemaVersion: 1,
            target: { artifactId: resolved.artifact.id, versionId: resolved.version.id },
            title: resolved.version.title ?? resolved.version.fileName ?? '',
            versionNumber: resolved.version.versionNumber,
            readOnly: true,
            entry,
            data,
            operations: [],
            expiresAt: resolved.link.expiresAt?.toISOString() ?? null
        }
    }
}
