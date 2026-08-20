import { TEnterpriseH5IdentityGrant } from '@xpert-ai/contracts'
import { Public, TransformInterceptor } from '@xpert-ai/server-core'
import { Body, Controller, Get, Param, Post, UseInterceptors } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { EnterpriseChatkitSessionService, EnterpriseH5Xpert } from './enterprise-chatkit-session.service'

@ApiTags('Xpert')
@UseInterceptors(TransformInterceptor)
@Controller('xpert')
export class EnterpriseChatkitController {
    constructor(private readonly enterpriseChatkitSessionService: EnterpriseChatkitSessionService) {}

    @Public()
    @Get(':identifier/enterprise-h5/:platform/bootstrap')
    async getBootstrap(@Param('identifier') identifier: string, @Param('platform') platform: string) {
        const bootstrap = await this.enterpriseChatkitSessionService.getBootstrap(identifier, platform)
        return {
            xpert: toEnterpriseH5PublicXpert(bootstrap.xpert),
            platform: bootstrap.platform,
            clientConfig: bootstrap.clientConfig
        }
    }

    @Public()
    @Post(':identifier/enterprise-h5/:platform/session')
    createSession(
        @Param('identifier') identifier: string,
        @Param('platform') platform: string,
        @Body() body: { grant?: TEnterpriseH5IdentityGrant }
    ) {
        return this.enterpriseChatkitSessionService.createSession(identifier, platform, body)
    }
}

function toEnterpriseH5PublicXpert(xpert: EnterpriseH5Xpert) {
    return {
        id: xpert.id,
        slug: xpert.slug,
        name: xpert.name,
        type: xpert.type,
        description: xpert.description,
        avatar: xpert.avatar,
        title: xpert.title,
        titleCN: xpert.titleCN,
        version: xpert.version,
        publishAt: xpert.publishAt,
        starters: xpert.starters,
        features: xpert.features
    }
}
