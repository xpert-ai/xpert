import { IsNull, type Repository } from 'typeorm'
import type { Artifact, ArtifactVersion } from './entities'

/** Load only the active pointers of the already-authorized page, with the same resource and tenant scope. */
export async function loadArtifactCurrentVersions(
    artifacts: Artifact[],
    repository: Pick<Repository<ArtifactVersion>, 'find'>
): Promise<Map<string, ArtifactVersion>> {
    const where = artifacts
        .filter((artifact) => artifact.currentVersionId)
        .map((artifact) => ({
            id: artifact.currentVersionId!,
            artifactId: artifact.id,
            tenantId: artifact.tenantId,
            organizationId: artifact.organizationId ?? IsNull(),
            status: 'active' as const
        }))
    if (!where.length) return new Map()
    const versions = await repository.find({ where })
    return new Map(versions.map((version) => [version.artifactId, version]))
}
