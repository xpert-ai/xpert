import { Type } from '@nestjs/common'
import { MODULE_METADATA } from '@nestjs/common/constants'
import { XpertModule } from '../xpert/xpert.module'
import { XpertProjectModule } from './project.module'
import { ProjectConfigurationPluginModule } from './plugins/project-configuration/project-configuration.module'
import { ProjectConfigurationViewProvider } from './plugins/project-configuration/project-configuration.provider'
import { ProjectConfigurationRuntimeService } from './configuration/runtime/project-configuration-runtime.service'
import { RUNTIME_CAPABILITY_PROVIDER, ProjectConfigurationRuntimeCapability, ProjectTasksRuntimeCapability } from '@xpert-ai/plugin-sdk'
import { ProjectTasksRuntimeService } from './runtime/project-tasks-runtime.service'
import { ProjectTaskGraphService } from './services/project-task-graph.service'
import { ReadProjectTaskAcceptanceHandler } from './commands/handlers/read-project-task-acceptance.handler'

describe('Xpert and Project module linkage', () => {
    it('declares both sides of the circular module dependency through forwardRef', () => {
        expect(resolveForwardRefs(XpertModule)).toContain(XpertProjectModule)
        expect(resolveForwardRefs(XpertProjectModule)).toContain(XpertModule)
    })
    it('registers one task API adapter and its internal acceptance handler', () => {
        const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, XpertProjectModule)
        expect(providers).toContain(ProjectTasksRuntimeService)
        expect(providers).toContain(ReadProjectTaskAcceptanceHandler)
        expect(Reflect.getMetadata(RUNTIME_CAPABILITY_PROVIDER, ProjectTasksRuntimeService).id).toBe(ProjectTasksRuntimeCapability.id)
        expect(Reflect.getMetadata(RUNTIME_CAPABILITY_PROVIDER, ProjectTaskGraphService)).toBeUndefined()
    })
    it('imports the plugin once and keeps its providers separate from the host adapter', () => {
        const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, XpertProjectModule)
        const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, XpertProjectModule)
        expect(imports.filter((item: unknown) => item === ProjectConfigurationPluginModule)).toHaveLength(1)
        expect(providers).toContain(ProjectConfigurationRuntimeService)
        expect(providers).not.toContain(ProjectConfigurationViewProvider)
        expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, ProjectConfigurationPluginModule)).toContain(ProjectConfigurationViewProvider)
        expect(Reflect.getMetadata(RUNTIME_CAPABILITY_PROVIDER, ProjectConfigurationRuntimeService).id).toBe(ProjectConfigurationRuntimeCapability.id)
    })
})

function resolveForwardRefs(module: Type<unknown>) {
    const imports = (Reflect.getMetadata(MODULE_METADATA.IMPORTS, module) ?? []) as Array<{
        forwardRef?: () => Type<unknown>
    }>
    return imports.flatMap((item) => (typeof item?.forwardRef === 'function' ? [item.forwardRef()] : []))
}
