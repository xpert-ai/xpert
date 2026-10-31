/**
 * Invariants: 应用受益用户与初始化服务身份分离，服务身份仍受普通角色权限约束。
 * 默认授权仅在首次创建角色时写入；重试不得恢复已撤销的权限或停用状态。
 * 服务账号只用于后台资源初始化，不向受益用户授予编排或管理能力。
 */
import { userHasPermission } from '../../shared/service-operation'
import { platformFailure } from './platform-error'
import { Injectable } from '@nestjs/common'
import { AIPermissionsEnum, IUser, RolesEnum, UserType } from '@xpert-ai/contracts'
import { Role, RolePermission, User, UserOrganization } from '@xpert-ai/server-core'
import { DataSource } from 'typeorm'
import { AppPlatformDelivery } from './app-platform-delivery.entity'

@Injectable()
export class PlatformMaintenanceActorService {
    constructor(private readonly database: DataSource) {}

    /** 校验当前受益用户的应用使用权限和组织状态，不依赖 AppUser 等角色名称。 */
    async beneficiary(delivery: AppPlatformDelivery): Promise<User> {
        const user = await this.database.getRepository(User).findOne({
            where: {
                id: delivery.userId,
                tenantId: delivery.tenantId,
                type: UserType.USER,
                emailVerified: true,
                isActive: true
            },
            relations: ['role', 'role.rolePermissions']
        })
        const member = await this.database.getRepository(UserOrganization).exists({
            where: {
                tenantId: delivery.tenantId,
                organizationId: delivery.organizationId,
                userId: delivery.userId,
                isActive: true,
                organization: { isActive: true }
            }
        })
        if (!user || !userHasPermission(user, AIPermissionsEnum.APPLICATION_USE) || !member)
            throw platformFailure('application_user_unavailable', 403)
        return user
    }

    /**
     * 幂等创建或复用交付记录的无登录密码服务账号，并返回其当前角色权限。
     * 调用方仍需独立校验受益用户，并在执行资源操作时检查服务账号的实际权限。
     */
    async ensure(delivery: AppPlatformDelivery): Promise<IUser> {
        return this.database.transaction(async (manager) => {
            // 同一交付记录串行创建账号；租户锁另行保护多份交付共享的角色初始化。
            const row = await manager.getRepository(AppPlatformDelivery).findOneOrFail({
                where: { id: delivery.id, tenantId: delivery.tenantId },
                lock: { mode: 'pessimistic_write' }
            })
            await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
                `application-service-role:${row.tenantId}`
            ])
            const roles = manager.getRepository(Role),
                users = manager.getRepository(User)
            let role = await roles.findOneBy({ tenantId: row.tenantId, name: RolesEnum.APPLICATION_PROVISIONER })
            // 已存在的角色保持管理员配置，不能在每次初始化时重新补齐默认权限。
            if (!role) {
                role = await roles.save(
                    roles.create({ tenantId: row.tenantId, name: RolesEnum.APPLICATION_PROVISIONER, isSystem: true })
                )
                await manager
                    .getRepository(RolePermission)
                    .save(
                        [
                            AIPermissionsEnum.APPLICATION_INSTALL,
                            AIPermissionsEnum.XPERT_VIEW,
                            AIPermissionsEnum.XPERT_EDIT,
                            AIPermissionsEnum.KNOWLEDGEBASE_EDIT
                        ].map((permission) => ({ tenantId: row.tenantId, roleId: role.id, permission, enabled: true }))
                    )
            }
            let actor = row.maintenanceUserId
                ? await users.findOne({
                      where: {
                          id: row.maintenanceUserId,
                          tenantId: row.tenantId,
                          type: UserType.COMMUNICATION
                      },
                      relations: ['role']
                  })
                : null
            // 已绑定身份失效时停止，避免通过创建替代账号绕过管理员的停用决定。
            if (row.maintenanceUserId && (!actor || actor.isActive === false))
                throw platformFailure('application_maintenance_actor_invalid', 403)
            if (!actor) {
                actor = await users.save(
                    users.create({
                        tenantId: row.tenantId,
                        roleId: role.id,
                        type: UserType.COMMUNICATION,
                        email: `app-platform-${row.id}@internal.invalid`,
                        username: `app-platform-${row.id}`,
                        firstName: 'App Platform',
                        lastName: 'Provisioner',
                        hash: null,
                        emailVerified: false
                    })
                )
                await manager.getRepository(AppPlatformDelivery).update(row.id, { maintenanceUserId: actor.id })
            } else if (actor.role?.name === RolesEnum.APP_USER) {
                // 仅迁移旧版 COMMUNICATION 技术账号的 AppUser 角色，保留显式指定的其他角色。
                await users.update(actor.id, { roleId: role.id })
            }
            const memberships = manager.getRepository(UserOrganization)
            const identity = { tenantId: row.tenantId, organizationId: row.organizationId, userId: actor.id }
            const membership = await memberships.findOneBy(identity)
            if (membership?.isActive === false) throw platformFailure('application_maintenance_actor_invalid', 403)
            if (!membership) await memberships.save(memberships.create({ ...identity, isActive: true }))
            delivery.maintenanceUserId = actor.id
            return users.findOneOrFail({ where: { id: actor.id }, relations: ['role', 'role.rolePermissions'] })
        })
    }
}
