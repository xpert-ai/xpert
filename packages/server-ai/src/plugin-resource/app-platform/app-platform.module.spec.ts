import { DynamicModule, Global, Module, ModuleMetadata, Provider } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { BullModule, getQueueToken } from '@nestjs/bull'
import { CqrsModule } from '@nestjs/cqrs'
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { PluginResourceModule } from '../plugin-resource.module'
import { PluginApplicationService } from '../application/plugin-application.service'
import { ApplicationInitializationLocks } from '../application/application-initialization-locks'
import { MembershipModule } from '../../membership/membership.module'
import { MembershipService } from '../../membership/membership.service'
import { RefreshMembershipModelPolicyHandler } from '../../membership/refresh-membership-model-policy.command'
import { XpertModule } from '../../xpert/xpert.module'
import { AssistantSharingModule } from '../../xpert/sharing/sharing.module'
import { AssistantSharingService } from '../../xpert/sharing/sharing.service'
import { AppPlatformController } from './app-platform.controller'
import { APP_PLATFORM_QUEUE, AppPlatformService } from './app-platform.service'
import { AppPlatformWorker } from './app-platform.worker'
import { AppPlatformDelivery } from './app-platform-delivery.entity'
import { PlatformMaintenanceActorService } from './platform-maintenance-actor.service'
import { PlatformModelsService } from './platform-models.service'
import { PlatformProvisionerService } from './platform-provisioner.service'
import { PlatformUpdateService } from './platform-update.service'
import { PlatformStorageUsageService } from './storage/platform-storage-usage.service'
import { AppPlatformStorageObject, AppPlatformStorageRoot } from './storage/platform-storage-object.entity'

const imports: NonNullable<ModuleMetadata['imports']> = Reflect.getMetadata('imports', PluginResourceModule)
const providers: Provider[] = Reflect.getMetadata('providers', PluginResourceModule)
const controllers: NonNullable<ModuleMetadata['controllers']> = Reflect.getMetadata('controllers', PluginResourceModule)
const platformProviders = [
    AppPlatformService,
    AppPlatformWorker,
    PlatformUpdateService,
    PlatformMaintenanceActorService,
    PlatformModelsService,
    PlatformProvisionerService,
    PlatformStorageUsageService,
    ApplicationInitializationLocks
]
const infrastructure = imports.filter(
    (entry): entry is DynamicModule =>
        typeof entry === 'object' &&
        'module' in entry &&
        (entry.module === TypeOrmModule || entry.module === BullModule)
)
const repository = { findOneBy: jest.fn() }
const database = { entityMetadatas: [], options: { type: 'postgres' }, getRepository: jest.fn(() => repository) }
const queue = { getJob: jest.fn(), add: jest.fn() }

@Global()
@Module({ providers: [{ provide: DataSource, useValue: database }], exports: [DataSource] })
class DatabaseBoundaryModule {}

@Module({
    providers: [
        { provide: MembershipService, useValue: {} },
        { provide: AssistantSharingService, useValue: {} }
    ],
    exports: [MembershipService, AssistantSharingService]
})
class DomainBoundaryModule {}

describe('App platform registrations in PluginResourceModule', () => {
    it('registers the platform collaborators once and exposes the HTTP controller', () => {
        for (const service of platformProviders) {
            expect(providers.filter((provider) => provider === service)).toHaveLength(1)
        }
        expect(Reflect.getMetadata('controllers', PluginResourceModule)).toContain(AppPlatformController)
        expect(imports).toContain(CqrsModule)
    })

    it('imports the domain modules that export membership, model-policy refresh and Assistant sharing', () => {
        expect(imports).toContain(MembershipModule)
        expect(Reflect.getMetadata('exports', MembershipModule)).toContain(MembershipService)
        expect(Reflect.getMetadata('providers', MembershipModule)).toContain(RefreshMembershipModelPolicyHandler)
        expect(
            imports.some(
                (entry) => typeof entry === 'object' && 'forwardRef' in entry && entry.forwardRef() === XpertModule
            )
        ).toBe(true)
        expect(Reflect.getMetadata('exports', XpertModule)).toContain(AssistantSharingModule)
        expect(Reflect.getMetadata('exports', AssistantSharingModule)).toContain(AssistantSharingService)
    })

    it('resolves the delivery graph using production queue and repository registrations', async () => {
        expect(infrastructure.some((entry) => entry.module === BullModule)).toBe(true)
        expect(infrastructure.some((entry) => entry.module === TypeOrmModule)).toBe(true)
        const queueRegistration = infrastructure.find((entry) => entry.module === BullModule)
        expect(queueRegistration.exports).toEqual(
            expect.arrayContaining([expect.objectContaining({ provide: getQueueToken(APP_PLATFORM_QUEUE) })])
        )
        const entities = [AppPlatformDelivery, AppPlatformStorageObject, AppPlatformStorageRoot]
        const ormRegistration = infrastructure.find((entry) => entry.module === TypeOrmModule)
        for (const entity of entities) {
            expect(ormRegistration.providers).toEqual(
                expect.arrayContaining([expect.objectContaining({ provide: getRepositoryToken(entity) })])
            )
        }
        // Compile the registered delivery graph without starting timers, Redis workers or database bootstrap hooks.
        const module = await Test.createTestingModule({
            imports: [DatabaseBoundaryModule, DomainBoundaryModule, CqrsModule, ...infrastructure],
            controllers: controllers.filter((controller) => controller === AppPlatformController),
            providers: [
                ...providers.filter((provider) => platformProviders.some((service) => service === provider)),
                { provide: PluginApplicationService, useValue: {} }
            ]
        })
            .overrideProvider(getQueueToken(APP_PLATFORM_QUEUE))
            .useValue(queue)
            .compile()
        try {
            for (const service of platformProviders) expect(module.get<unknown>(service)).toBeInstanceOf(service)
            expect(module.get(AppPlatformController)).toBeInstanceOf(AppPlatformController)
            expect(module.get(getQueueToken(APP_PLATFORM_QUEUE))).toBe(queue)
            for (const entity of entities) {
                expect(module.get(getRepositoryToken(entity))).toBe(repository)
                expect(database.getRepository).toHaveBeenCalledWith(entity)
            }
        } finally {
            await module.close()
        }
    })
})
