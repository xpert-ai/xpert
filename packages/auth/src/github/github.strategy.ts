import { IApiServerOptions } from '@xpert-ai/server-common'
import { ConfigService, IEnvironment } from '@xpert-ai/server-config'
import { Injectable } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { Strategy } from 'passport-github2'

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(private readonly configService: ConfigService) {
    super(config(configService))
  }

  async validate(
    request: any,
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: (err: any, user: any, info?: any) => void
  ) {
    try {
      const { emails } = profile
      const user = {
        emails,
        accessToken
      }
      done(null, user)
    } catch (err) {
      done(err, false)
    }
  }
}

export const config = (configService: ConfigService) => {
  const GITHUB_CONFIG = configService.get('githubConfig') as IEnvironment['githubConfig']
  const { baseUrl } = configService.apiConfigOptions as IApiServerOptions

  return {
    clientID: GITHUB_CONFIG.clientId || 'disabled',
    clientSecret: GITHUB_CONFIG.clientSecret || 'disabled',
    callbackURL: GITHUB_CONFIG.callbackUrl || `${baseUrl}/api/auth/github/callback`,
    passReqToCallback: true,
    scope: ['user:email']
  }
}
