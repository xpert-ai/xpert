import { ArtifactLinkRecord } from '@xpert-ai/plugin-sdk'
import path from 'node:path'
import { serializeArtifact, serializeArtifactVersion } from './artifact-records'
import { normalizeLinkStatus, normalizeRequiredString, SIGNED_PREVIEW_QUERY_PARAM } from './artifact-utils'
import { Artifact, ArtifactLink, ArtifactVersion } from './entities'
import { ArtifactTypesService } from './types/artifact-types.service'
import { artifactPresentationUrl } from './presentation/artifact-presentation-url'

/** URL and metadata rendering without changing the stored share identity. */
export class ArtifactLinkPresentation {
    constructor(
        private readonly sourcePolicies: ArtifactTypesService,
        private readonly publicBaseUrl: () => string
    ) {}

    /**
     * Builds the browser-facing Artifact URL from the configured public base.
     *
     * The API may be configured with a `/api` base URL locally, so this strips
     * that suffix before appending `/artifacts/share/:artifactLinkSlug`.
     */
    buildPublicUrl(slug: string, previewToken?: string, artifact?: Artifact) {
        const sourceUrl = this.sourcePolicies.publicUrl(artifact, slug)
        if (sourceUrl) return sourceUrl
        const parsed = new URL(this.publicBaseUrl())
        const normalizedPathname = parsed.pathname.replace(/\/+$/, '')
        const basePath = normalizedPathname.endsWith('/api') ? normalizedPathname.slice(0, -4) : normalizedPathname
        parsed.pathname = path.posix.join(basePath || '/', 'artifacts', 'share', encodeURIComponent(slug))
        if (artifact && this.sourcePolicies.provider(artifact).definition.presentation.mode === 'snapshot')
            parsed.pathname = path.posix.join(basePath || '/', 'artifacts', 'snapshot', encodeURIComponent(slug))
        parsed.search = ''
        parsed.hash = ''
        if (previewToken) {
            parsed.searchParams.set(SIGNED_PREVIEW_QUERY_PARAM, previewToken)
        }
        return parsed.toString()
    }

    serializeLink(
        link: ArtifactLink,
        previewToken?: string,
        artifact?: Artifact,
        version?: ArtifactVersion
    ): ArtifactLinkRecord {
        const resolvedArtifact = artifact ?? link.artifact
        return {
            id: normalizeRequiredString(link.id, 'link.id'),
            artifactId: link.artifactId,
            artifactVersionId: link.artifactVersionId,
            shareKey: link.shareKey,
            versionMode: link.versionMode ?? 'latest',
            slug: link.slug,
            presentationUrl:
                link.status === 'active'
                    ? (this.sourcePolicies.presentationUrl(resolvedArtifact, link.publicUrl) ??
                      artifactPresentationUrl(this.buildPublicUrl(link.slug), link.slug))
                    : undefined,
            publicUrl:
                link.accessMode === 'signed_preview' && previewToken
                    ? this.buildPublicUrl(link.slug, previewToken)
                    : link.publicUrl,
            accessMode: link.accessMode,
            status: normalizeLinkStatus(link),
            customPrincipals: link.customPrincipals ?? null,
            expiresAt: link.expiresAt ?? null,
            revokedAt: link.revokedAt ?? null,
            accessCount: link.accessCount,
            downloadCount: link.downloadCount,
            disposition: link.disposition,
            allowDownload: link.allowDownload,
            safeHtmlProfile: link.safeHtmlProfile ?? null,
            metadata: link.metadata ?? null,
            tenantId: link.tenantId,
            organizationId: link.organizationId,
            userId: link.userId,
            workspaceId: link.workspaceId,
            projectId: link.projectId,
            xpertId: link.xpertId,
            createdAt: link.createdAt,
            updatedAt: link.updatedAt,
            ...(resolvedArtifact ? { artifact: serializeArtifact(resolvedArtifact) } : {}),
            ...(version ? { version: serializeArtifactVersion(version) } : {})
        }
    }
}
