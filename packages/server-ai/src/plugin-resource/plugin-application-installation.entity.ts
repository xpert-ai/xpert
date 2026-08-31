import {
    IPluginApplicationInstallation,
    PLUGIN_APPLICATION_INSTALLATION_STATUS,
    PluginApplicationInstallationStatus,
    PluginApplicationScope
} from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index } from 'typeorm'

/**
 * Control-plane record for one governed plugin App installation.
 * The unique scope key is the database concurrency lock that prevents duplicate
 * resources when users retry or initialize from multiple browser sessions.
 */
@Entity('plugin_application_installation')
@Index(['tenantId', 'pluginName', 'appName', 'scopeKey'], { unique: true })
@Index(['tenantId', 'organizationId', 'status'])
export class PluginApplicationInstallation
    extends TenantOrganizationBaseEntity
    implements IPluginApplicationInstallation
{
    @Column()
    pluginName: string

    @Column()
    appName: string

    @Column({ type: 'varchar' })
    declaredScope: PluginApplicationScope

    @Column()
    scopeKey: string

    @Column({ type: 'varchar', default: PLUGIN_APPLICATION_INSTALLATION_STATUS.INITIALIZING })
    status: PluginApplicationInstallationStatus

    @Column({ nullable: true })
    pluginVersion?: string | null

    @Column({ nullable: true })
    templateId?: string | null

    @Column({ nullable: true })
    templateVersion?: string | null

    @Column({ nullable: true })
    operationId?: string | null

    @Column({ nullable: true })
    workspaceId?: string | null

    @Column({ nullable: true })
    xpertId?: string | null

    @Column({ type: 'jsonb', nullable: true })
    knowledgebaseIds?: string[] | null

    @Column({ type: 'jsonb', nullable: true })
    resourceRefs?: Record<string, string> | null

    @Column({ nullable: true })
    errorCode?: string | null

    @Column({ type: 'text', nullable: true })
    errorMessage?: string | null
}
