import { EntityManager, IsNull } from 'typeorm'
import { ConnectorService } from '../../../connector/connector.service'
import { XpertProject } from '../../entities/project.entity'

export async function deleteProjectRecord(
    manager: EntityManager,
    connectors: ConnectorService,
    project: Pick<XpertProject, 'id' | 'tenantId' | 'organizationId'>
) {
    await connectors.deleteProjectBindings({ projectId: project.id, tenantId: project.tenantId }, manager)
    return manager.getRepository(XpertProject).delete({
        id: project.id,
        tenantId: project.tenantId,
        organizationId: project.organizationId ?? IsNull()
    })
}
