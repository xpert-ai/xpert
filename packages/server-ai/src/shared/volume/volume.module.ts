import { Global, Injectable, Module } from '@nestjs/common'
import {
    createRuntimeVolumeClient,
    getWorkspacePathMapperForProvider,
    VOLUME_CLIENT,
    VolumeClient,
    WorkspacePathMapper
} from './volume'

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
        WorkspacePathMapperFactory
    ],
    exports: [VOLUME_CLIENT, WorkspacePathMapperFactory]
})
export class VolumeModule {}
