import { Body, Controller, HttpCode, HttpStatus, Post, UseInterceptors } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { TransformInterceptor } from '@xpert-ai/server-core'
import { XpertProjectInvitationService } from './services/project-invitation.service'

@ApiTags('XpertProjectInvitation')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller('invitations')
export class XpertProjectInvitationController {
    constructor(private readonly invitationService: XpertProjectInvitationService) {}

    @Post('accept')
    accept(@Body() input: { token: string }) {
        return this.invitationService.accept(input.token)
    }

    @Post('decline')
    @HttpCode(HttpStatus.OK)
    decline(@Body() input: { token: string }) {
        return this.invitationService.decline(input.token)
    }
}
