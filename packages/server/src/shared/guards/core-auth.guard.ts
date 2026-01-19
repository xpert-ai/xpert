import { Injectable } from '@nestjs/common'
import { AuthGuard as PassportAuthGaurd } from '@nestjs/passport'

@Injectable()
export class CoreAuthGuard extends PassportAuthGaurd(['jwt', 'basic', 'oidc']) {}
