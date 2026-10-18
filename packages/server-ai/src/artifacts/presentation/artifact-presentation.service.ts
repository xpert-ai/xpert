// Invariants: a share grants published content only; each query rechecks its current policy.
// Provider calls run as the viewer in the authorized Artifact organization, never as its creator.
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import type { ArtifactPresentation, ArtifactPresentationQuery, ArtifactPresentationTarget } from '@xpert-ai/contracts'
import { ArtifactPresentationRegistry, artifactPresentationKey, RequestContext } from '@xpert-ai/plugin-sdk'
import type { ArtifactPresentationContext } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { captureRequestContext, runWithCapturedRequestContext } from '../../shared/request-context'
import { ArtifactsService, ArtifactResolvedVersion } from '../artifacts.service'
import { serializeArtifact, serializeArtifactVersion } from '../artifact-records'

@Injectable()
export class ArtifactPresentationService {
    constructor(
        private readonly artifacts: ArtifactsService,
        private readonly registry: ArtifactPresentationRegistry
    ) {}

    async read(slug: string): Promise<ArtifactPresentation> {
        const resolved = await this.artifacts.resolveForAuthenticatedAccess({ slug })
        return this.withViewer(resolved, async (context) => {
            const provider = this.provider(context)
            const [entry, data] = await Promise.all([provider.getEntry(), provider.read(context)])
            await this.assertCurrent(slug, { artifactId: context.artifact.id, versionId: context.version.id })
            return {
                schemaVersion: 1,
                target: { artifactId: context.artifact.id, versionId: context.version.id },
                title: context.version.title ?? context.version.fileName ?? '',
                versionNumber: context.version.versionNumber,
                readOnly: true,
                entry,
                data,
                operations: [...provider.operations]
            }
        })
    }

    async query(slug: string, request: ArtifactPresentationQuery): Promise<object> {
        const resolved = await this.artifacts.resolveForAuthenticatedAccess({ slug })
        this.assertTarget(resolved, request.target)
        return this.withViewer(resolved, async (context) => {
            const provider = this.provider(context)
            if (!provider.operations.includes(request.operation)) {
                throw new ForbiddenException(
                    t('server-ai:Error.ArtifactPresentationOperationDenied', {
                        defaultValue: 'This operation is not available in a read-only presentation.'
                    })
                )
            }
            const result = await provider.query(context, request)
            // Do not release an in-flight result after revocation or a latest-version change.
            await this.assertCurrent(slug, request.target)
            return result
        })
    }

    private async assertCurrent(slug: string, target: ArtifactPresentationTarget) {
        this.assertTarget(await this.artifacts.resolveDescriptorForAuthenticatedAccess({ slug }), target)
    }

    private assertTarget(
        resolved: { artifact: { id?: string }; version: { id?: string } },
        target: ArtifactPresentationTarget
    ) {
        if (resolved.artifact.id !== target.artifactId || resolved.version.id !== target.versionId) {
            throw new ConflictException(
                t('server-ai:Error.ArtifactPresentationChanged', {
                    defaultValue: 'The published version changed. Reopen the shared page to load it.'
                })
            )
        }
    }

    private provider(context: ArtifactPresentationContext) {
        const key = artifactPresentationKey(context.artifact)
        const registration = this.registry
            .listRegistrations(context.actor.organizationId)
            .find((item) => item.type === key)
        if (
            !registration ||
            registration.source.kind !== 'plugin' ||
            registration.source.pluginName !== context.artifact.pluginName
        ) {
            throw new NotFoundException(
                t('server-ai:Error.ArtifactPresentationUnavailable', {
                    defaultValue: 'The presentation plugin is unavailable.'
                })
            )
        }
        return registration.strategy
    }

    private withViewer<T>(
        resolved: ArtifactResolvedVersion,
        work: (context: ArtifactPresentationContext) => Promise<T>
    ) {
        const userId = RequestContext.currentUserId()
        const { tenantId, organizationId } = resolved.artifact
        if (
            !userId ||
            !tenantId ||
            !organizationId ||
            tenantId !== RequestContext.currentTenantId() ||
            !['organization_all', 'workspace_all', 'owner_only'].includes(resolved.link.accessMode)
        ) {
            throw new ForbiddenException(
                t('server-ai:Error.ArtifactPresentationAccessDenied', {
                    defaultValue: 'An authenticated team share is required.'
                })
            )
        }
        return runWithCapturedRequestContext(captureRequestContext({ tenantId, organizationId }), () =>
            work({
                actor: { tenantId, organizationId, userId },
                artifact: serializeArtifact(resolved.artifact),
                version: serializeArtifactVersion(resolved.version),
                content: resolved.buffer
            })
        )
    }
}
