import {
    ArtifactLinkDisposition,
    ArtifactLinkRecord,
    ArtifactRecord,
    ArtifactSafeHtmlProfile,
    ArtifactVersionRecord
} from '@xpert-ai/plugin-sdk'
import { Repository } from 'typeorm'
import { Artifact, ArtifactLink, ArtifactVersion } from './entities'
export type ArtifactsRuntimeScope = {
    tenantId?: string | null
    organizationId?: string | null
    userId?: string | null
    workspaceId?: string | null
    projectId?: string | null
    xpertId?: string | null
}

export type ArtifactAccessPrincipal = {
    userId?: string | null
    tenantId?: string | null
    organizationId?: string | null
}

export type ArtifactResolvedVersion = {
    link: ArtifactLink
    artifact: Artifact
    version: ArtifactVersion
    buffer: Buffer
    mimeType: string
    fileName: string
    disposition: ArtifactLinkDisposition
    safeHtmlProfile?: ArtifactSafeHtmlProfile | null
}

export type ArtifactManagementResolvedVersion = {
    artifact: ArtifactRecord
    version: ArtifactVersionRecord
    buffer: Buffer
    mimeType: string
    fileName: string
}

export type ArtifactSharedDescriptor = {
    link: ArtifactLinkRecord
    artifact: ArtifactRecord
    version: ArtifactVersionRecord
}

export type ArtifactRepositories = {
    artifact: Repository<Artifact>
    version: Repository<ArtifactVersion>
    link: Repository<ArtifactLink>
}

export type ArtifactJwtPayload = {
    id?: string
    tenantId?: string
    thirdPartyId?: string
}

export type ArtifactShareSessionPayload = {
    purpose: 'artifact_share'
    id: string
    tenantId: string
}

export type ArtifactHeaders = Record<string, string | string[] | undefined>

export type NormalizedArtifactSource = {
    pluginName: string
    resourceType: string
    resourceId: string
    checksum?: string
}

export type ArtifactHttpRequest = {
    headers: ArtifactHeaders
    ip?: string
    ips?: string[]
    socket?: {
        remoteAddress?: string
    }
}

export type ArtifactRequestSummary = {
    ipHash?: string
    userAgent?: string
}
