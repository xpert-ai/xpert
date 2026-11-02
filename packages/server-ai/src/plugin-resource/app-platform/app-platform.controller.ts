import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { Permissions } from '@xpert-ai/server-core'
import { PlatformUpdateService } from './platform-update.service'
import { platformFailure } from './platform-error'
import { Controller, Get, Post, Body, Query } from '@nestjs/common'
import { Public, ZodValidationPipe } from '@xpert-ai/server-core'
import { z } from 'zod/v3'
import { AppPlatformService } from './app-platform.service'

@Controller('app-platform')
export class AppPlatformController {
    constructor(
        private readonly platform: AppPlatformService,
        private readonly updates: PlatformUpdateService
    ) {}
    @Get('deliveries')
    @Permissions(AIPermissionsEnum.APPLICATION_INSTALL)
    deliveries(
        @Query(
            new ZodValidationPipe(
                z
                    .object({
                        userId: z.string().uuid().optional(),
                        skip: z.coerce.number().int().min(0).default(0),
                        take: z.coerce.number().int().min(1).max(100).default(50)
                    })
                    .strict(),
                () => platformFailure('invalid_application_retry')
            )
        )
        query: {
            userId?: string
            skip: number
            take: number
        }
    ) {
        return this.updates.list(query)
    }
    @Post('adopt-definition')
    @Permissions(AIPermissionsEnum.APPLICATION_INSTALL)
    adopt(
        @Body(
            new ZodValidationPipe(
                z
                    .object({ deliveryId: z.string().uuid(), expectedDigest: z.string().regex(/^[a-f0-9]{64}$/) })
                    .strict(),
                () => platformFailure('application_update_conflict')
            )
        )
        body: {
            deliveryId: string
            expectedDigest: string
        }
    ) {
        return this.updates.adopt(body.deliveryId, body.expectedDigest)
    }
    @Get('presentation')
    @Public()
    presentation() {
        return this.platform.presentation()
    }
    @Get('me')
    @Permissions(AIPermissionsEnum.APPLICATION_USE)
    status() {
        return this.platform.ensureForCurrentUser()
    }
    @Post('retry')
    @Permissions(AIPermissionsEnum.APPLICATION_USE)
    retry(
        @Body(new ZodValidationPipe(z.object({}).strict(), () => platformFailure('invalid_application_retry')))
        _body: object
    ) {
        return this.platform.ensureForCurrentUser(true)
    }
}
