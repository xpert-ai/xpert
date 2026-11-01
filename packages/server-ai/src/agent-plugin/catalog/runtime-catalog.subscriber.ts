import { Injectable } from '@nestjs/common'
import type {
    EntitySubscriberInterface,
    InsertEvent,
    UpdateEvent,
    RemoveEvent,
    SoftRemoveEvent,
    RecoverEvent,
    QueryRunner,
    TransactionCommitEvent,
    TransactionRollbackEvent
} from 'typeorm'
import { DataSource } from 'typeorm'
import { RuntimeResourceCatalogCache } from './runtime-catalog.cache'

// Include join tables: membership/grant mutations can arrive without an entity instance.
const dependencies = new Set([
    'agent_plugin_package',
    'agent_resource_binding',
    'xpert',
    'xpert_agent',
    'xpert_workspace',
    'xpert_workspace_member',
    'xpert_to_user_group',
    'user_group',
    'user_group_to_user',
    'xpert_access_request',
    'user',
    'role',
    'role_permission',
    'user_organization',
    'xpert_project',
    'xpert_project_member',
    'xpert_project_membership',
    'xpert_project_xpert',
    'xpert_connector',
    'xpert_connector_personal_account',
    'xpert_connector_personal_grant',
    'plugin_instance',
    'view_extension'
])
type Change =
    | InsertEvent<unknown>
    | UpdateEvent<unknown>
    | RemoveEvent<unknown>
    | SoftRemoveEvent<unknown>
    | RecoverEvent<unknown>

@Injectable()
export class RuntimeCatalogSubscriber implements EntitySubscriberInterface {
    private readonly pending = new WeakSet<QueryRunner>()
    constructor(
        database: DataSource,
        private readonly cache: RuntimeResourceCatalogCache
    ) {
        database.subscribers.push(this)
    }
    afterInsert(event: InsertEvent<unknown>) {
        return this.changed(event)
    }
    afterUpdate(event: UpdateEvent<unknown>) {
        return this.changed(event)
    }
    afterRemove(event: RemoveEvent<unknown>) {
        return this.changed(event)
    }
    afterSoftRemove(event: SoftRemoveEvent<unknown>) {
        return this.changed(event)
    }
    afterRecover(event: RecoverEvent<unknown>) {
        return this.changed(event)
    }
    async afterTransactionCommit(event: TransactionCommitEvent) {
        if (!event.queryRunner.isTransactionActive && this.pending.delete(event.queryRunner))
            await this.cache.invalidate()
    }
    afterTransactionRollback(event: TransactionRollbackEvent) {
        if (!event.queryRunner.isTransactionActive) this.pending.delete(event.queryRunner)
    }
    private changed(event: Change) {
        if (!dependencies.has(event.metadata.tableName)) return
        if (event.queryRunner.isTransactionActive) this.pending.add(event.queryRunner)
        else return this.cache.invalidate()
    }
}
