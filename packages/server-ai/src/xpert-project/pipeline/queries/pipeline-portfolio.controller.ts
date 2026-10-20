import {
    BadRequestException,
    Body,
    CanActivate,
    Controller,
    ForbiddenException,
    HttpCode,
    Injectable,
    Post,
    UseGuards
} from '@nestjs/common'
import { t } from 'i18next'
import { projectPipelinePortfolioInputSchema, type ProjectPipelinePortfolioInput } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ZodValidationPipe } from '@xpert-ai/server-core'
import { ProjectPipelinePortfolioService } from './pipeline-portfolio.service'

/** Management reports cannot widen an Assistant-delegated credential's audience. */
@Injectable()
export class ProjectPipelinePortfolioGuard implements CanActivate {
    canActivate() {
        if (
            !RequestContext.currentUserId() ||
            !RequestContext.currentTenantId() ||
            RequestContext.currentApiPrincipal()?.principalType === 'client_secret'
        )
            throw new ForbiddenException(t('server-ai:Error.ProjectTaskAccessDenied'))
        return true
    }
}

@Controller()
@UseGuards(ProjectPipelinePortfolioGuard)
export class ProjectPipelinePortfolioController {
    constructor(private readonly portfolio: ProjectPipelinePortfolioService) {}

    @Post('pipelines/analytics/portfolio')
    @HttpCode(200)
    read(
        @Body(
            new ZodValidationPipe(
                projectPipelinePortfolioInputSchema,
                () => new BadRequestException(t('server-ai:Error.ProjectPipelinePortfolioInputInvalid'))
            )
        )
        input: ProjectPipelinePortfolioInput
    ) {
        return this.portfolio.read(
            {
                tenantId: RequestContext.currentTenantId(),
                organizationId: RequestContext.getOrganizationId(),
                userId: RequestContext.currentUserId()
            },
            input
        )
    }
}
