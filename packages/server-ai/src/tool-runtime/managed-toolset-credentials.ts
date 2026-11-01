import { IsNull, Repository } from 'typeorm'
import { XpertToolset } from '../xpert-toolset/xpert-toolset.entity'
import { PlatformToolsetBinding } from '../plugin-resource/app-platform/platform-toolset-binding.entity'
import { platformFailure } from '../plugin-resource/app-platform/platform-error'

/** Call only after the persisted toolset and execution scope have been authorized. Never hydrate API DTOs. */
export async function hydrateManagedToolsetCredentials(repository: Repository<XpertToolset>, targets: XpertToolset[]) {
    for (const target of targets) {
        const binding = await repository.manager.getRepository(PlatformToolsetBinding).findOneBy({
            targetId: target.id, tenantId: target.tenantId, organizationId: target.organizationId ?? IsNull()
        })
        if (!binding) continue
        const source = await repository.findOneBy({
            id: binding.sourceId, tenantId: target.tenantId, organizationId: IsNull(), workspaceId: IsNull(),
            type: target.type, category: target.category
        })
        if (!source || source.id === target.id) throw platformFailure('application_tool_binding_unavailable')
        target.credentials = source.credentials
    }
}
