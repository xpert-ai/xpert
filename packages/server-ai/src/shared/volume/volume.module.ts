import { Global, Injectable, Module } from '@nestjs/common'
import {
    createRuntimeVolumeClient,
    getWorkspacePathMapperForProvider,
    VOLUME_CLIENT,
    VolumeClient,
    WorkspacePathMapper
} from './volume'
import { KnowledgeWorkAreaResolver, XpertWorkAreaResolver } from './work-area'

@Injectable()
export class WorkspacePathMapperFactory {
    forProvider(provider?: string | null): WorkspacePathMapper {
        return getWorkspacePathMapperForProvider(provider)
    }
}

@Global()
@Module({
    providers: [
        {
            provide: VOLUME_CLIENT,
            useFactory: (): VolumeClient => createRuntimeVolumeClient()
        },
        WorkspacePathMapperFactory,
        KnowledgeWorkAreaResolver,
        XpertWorkAreaResolver
    ],
    exports: [VOLUME_CLIENT, WorkspacePathMapperFactory, KnowledgeWorkAreaResolver, XpertWorkAreaResolver]
})
export class VolumeModule {}
