import { IXpert } from '@xpert-ai/contracts'

export type XpertFamilyIdentity = Pick<IXpert, 'id' | 'tenantId' | 'organizationId' | 'workspaceId' | 'type' | 'slug'>

/** Published rows are version snapshots; these fields identify the stable Xpert. */
export function isSameXpertFamily(left: XpertFamilyIdentity, right: XpertFamilyIdentity) {
    if (left.id === right.id) return true
    if (!left.tenantId || !right.tenantId || !left.slug || !right.slug) return false

    return (
        left.tenantId === right.tenantId &&
        (left.organizationId ?? null) === (right.organizationId ?? null) &&
        (left.workspaceId ?? null) === (right.workspaceId ?? null) &&
        left.type === right.type &&
        left.slug === right.slug
    )
}
