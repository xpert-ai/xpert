import type { IPagination } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import type { Knowledgebase } from '../persistence/knowledgebase.entity'
import type { TenantLibraryAccessService } from './tenant-library-access.service'

/** Add explicitly requested public tenant libraries without changing caller scope or private-library grants. */
export async function includeTenantLibrariesForSearch(
    result: IPagination<Knowledgebase>,
    ids: string[] | undefined,
    tenantId: string,
    access?: Pick<TenantLibraryAccessService, 'find'>
): Promise<IPagination<Knowledgebase>> {
    if (!ids?.length || !access || tenantId !== RequestContext.currentTenantId()) return result
    const present = new Set(result.items.map((item) => item.id))
    const requested = [...new Set(ids)].filter((id) => !present.has(id))
    const matches = await Promise.all(requested.map((id) => access.find(id)))
    const shared = matches.filter((item): item is Knowledgebase => item !== null && item !== undefined)
    return { ...result, items: [...result.items, ...shared], total: result.total + shared.length }
}
