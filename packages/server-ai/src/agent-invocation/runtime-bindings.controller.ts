import { BadRequestException, Body, Controller, Get, Param, Post, Put } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { AgentJson, AgentRuntimeRegistry } from '@xpert-ai/plugin-sdk'
import { randomUUID } from 'crypto'
import { In, Repository } from 'typeorm'
import { z } from 'zod/v3'
import { requireResourceAdmin } from '../agent-plugin/agent-plugin.service'
import { AgentRuntimeBindingEntity } from './invocation.entity'
import { invocationError } from './invocation-runtime'
import { XpertWorkspace } from '../xpert-workspace/workspace.entity'

const json: z.ZodType<AgentJson> = z.lazy(() =>
    z.union([z.null(), z.boolean(), z.number().finite(), z.string(), z.array(json), z.record(json)])
)
const bindingSchema = z
    .object({
        title: z.string().trim().min(1).max(200),
        workspaceIds: z.array(z.string().uuid()).min(1).max(100),
        provider: z.string().min(1).max(100),
        reference: z.string().min(1).max(200),
        configuration: z.record(json).default({})
    })
    .strict()

@Controller('agent-runtime-bindings')
export class AgentRuntimeBindingsController {
    constructor(
        @InjectRepository(AgentRuntimeBindingEntity) private readonly bindings: Repository<AgentRuntimeBindingEntity>,
        private readonly registry: AgentRuntimeRegistry
    ) {}

    @Get() list() {
        return this.bindings.find({ where: requireResourceAdmin(), order: { createdAt: 'DESC' } })
    }

    @Post() async create(@Body() body: unknown) {
        const scope = requireResourceAdmin()
        const parsed = bindingSchema.safeParse(body)
        if (!parsed.success) throw new BadRequestException(parsed.error.flatten())
        const input = parsed.data
        if (input.provider === 'xpert' || input.provider === 'xpert-task') throw invocationError('InvalidRequest')
        this.registry.get(input.provider, scope.organizationId)
        const workspaces = [...new Set(input.workspaceIds)]
        const count = await this.bindings.manager.getRepository(XpertWorkspace).countBy({
            ...scope,
            id: In(workspaces)
        })
        if (count !== workspaces.length) throw invocationError('InvalidScope')
        const id = randomUUID()
        const entity = new AgentRuntimeBindingEntity()
        Object.assign(entity, scope, {
            id,
            title: input.title,
            workspaceIds: workspaces,
            enabled: true,
            target: {
                bindingId: id,
                provider: input.provider,
                reference: input.reference,
                revision: randomUUID(),
                configuration: input.configuration
            }
        })
        await this.bindings
            .createQueryBuilder()
            .insert()
            .values({
                id,
                ...scope,
                title: entity.title,
                enabled: true,
                workspaceIds: () => ':workspaces::jsonb',
                target: () => ':target::jsonb'
            })
            .setParameters({ workspaces: JSON.stringify(entity.workspaceIds), target: JSON.stringify(entity.target) })
            .execute()
        return entity
    }

    @Put(':id') async setEnabled(@Param('id') id: string, @Body() body: unknown) {
        const scope = requireResourceAdmin()
        const parsed = z.object({ enabled: z.boolean() }).strict().safeParse(body)
        if (!parsed.success) throw new BadRequestException(parsed.error.flatten())
        const result = await this.bindings
            .createQueryBuilder()
            .update()
            .set({ enabled: parsed.data.enabled })
            .where({ id, ...scope })
            .execute()
        if (!result.affected) throw invocationError('NotFound')
        return { id, enabled: parsed.data.enabled }
    }
}
