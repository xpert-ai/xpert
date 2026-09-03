import { PluginApplicationInitializeInput, RolesEnum } from '@xpert-ai/contracts'
import { RoleGuard, Roles, TransformInterceptor } from '@xpert-ai/server-core'
import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { PluginApplicationService } from './plugin-application.service'

/** HTTP boundary for trusted plugin application discovery and initialization. */
@ApiTags('PluginApplications')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller('plugin-applications')
export class PluginApplicationController {
    constructor(private readonly applications: PluginApplicationService) {}

    @Get('status')
    getStatuses() {
        return this.applications.getStatuses()
    }

    @Get('catalog')
    getCatalog() {
        return this.applications.getCatalog()
    }

    @Get('detail')
    getDetail(@Query('pluginName') pluginName: string, @Query('appName') appName: string) {
        if (!pluginName?.trim() || !appName?.trim()) {
            throw new BadRequestException('pluginName and appName are required')
        }
        return this.applications.getDetail(pluginName, appName)
    }

    @Post('initialize')
    @UseGuards(RoleGuard)
    @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN, RolesEnum.TRIAL)
    initialize(@Body() body: unknown) {
        return this.applications.initialize(parseInitializeInput(body))
    }
}

/**
 * Narrows the untrusted JSON body to the only client-selectable fields.
 * Tenant, organization, workspace, and target scope are deliberately absent.
 */
function parseInitializeInput(value: unknown): PluginApplicationInitializeInput {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new BadRequestException('Request body is required')
    }
    const pluginName = readRequiredString(value, 'pluginName')
    const appName = readRequiredString(value, 'appName')
    const embeddingModelId = readOptionalString(value, 'embeddingModelId')
    const visionModelId = readOptionalString(value, 'visionModelId')
    const operationId = readRequiredString(value, 'operationId')
    return {
        pluginName,
        appName,
        operationId,
        ...(embeddingModelId ? { embeddingModelId } : {}),
        ...(visionModelId ? { visionModelId } : {})
    }
}

function readRequiredString(value: object, key: string): string {
    const item = Reflect.get(value, key)
    if (typeof item !== 'string' || !item.trim()) {
        throw new BadRequestException(`${key} is required`)
    }
    return item.trim()
}

function readOptionalString(value: object, key: string): string | undefined {
    const item = Reflect.get(value, key)
    if (item == null || item === '') return undefined
    if (typeof item !== 'string') throw new BadRequestException(`${key} must be a string`)
    return item.trim() || undefined
}
