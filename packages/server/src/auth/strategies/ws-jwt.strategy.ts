import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { IRolePermission, IUser } from '@metad/contracts'
import { AuthService } from '../auth.service'

type JwtPayload = {
  id: string
  thirdPartyId?: string
  employeeId?: string
  permissions?: string[]
}

function attachTokenPermissions(user: IUser, permissions?: string[]) {
  if (!user?.role || !permissions?.length) {
    return
  }

  const roleId = user.roleId ?? user.role.id
  user.role = {
    ...user.role,
    rolePermissions: permissions.map<IRolePermission>((permission) => ({
      roleId,
      role: user.role,
      tenantId: user.tenantId,
      permission,
      enabled: true
    }))
  }
}

@Injectable()
export class WsJwtStrategy extends PassportStrategy(Strategy, 'ws-jwt') {
  constructor(private readonly authService: AuthService, private readonly configService: ConfigService) {
    super({
      // jwtFromRequest: ExtractJwt.fromUrlQueryParameter('jwt-token'),
      /**
       * https://socket.io/docs/v4/middlewares/#sending-credentials
       */
      jwtFromRequest: ExtractJwt.fromExtractors([(request) => {
        return (<any & {auth: {token: string}}>request).auth.token
      }]),
      secretOrKey: configService.get('JWT_SECRET')
    })
  }

  async validate(payload: JwtPayload, done: any) {
    try {
      // We use this to also attach the user object to the request context.
      const user: IUser = await this.authService.getAuthenticatedUser(
        payload.id,
        payload.thirdPartyId
      )

      if (!user) {
        return done(new UnauthorizedException('unauthorized'), false)
      } else {
        user.employeeId = payload.employeeId
        attachTokenPermissions(user, payload.permissions)

        // You could add a function to the authService to verify the claims of the token:
        // i.e. does the user still have the roles that are claimed by the token
        // const validClaims = await this.authService.verifyTokenClaims(payload);

        // if (!validClaims)
        //    return done(new UnauthorizedException('invalid token claims'), false);

        done(null, user)
      }
    } catch (err) {
      console.error(err)
      return done(new UnauthorizedException('unauthorized', err.message), false)
    }
  }
}
