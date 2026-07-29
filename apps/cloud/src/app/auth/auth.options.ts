import { HttpRequest } from '@angular/common/http'
import { InjectionToken } from '@angular/core'
import { XpAuthToken, XpAuthTokenClass } from './services/token/token'
import { XpAuthStrategy } from './strategies/auth-strategy'
import { XpAuthStrategyOptions } from './strategies/auth-strategy-options'

export type XpAuthStrategyClass = new (...params: any[]) => XpAuthStrategy

export type XpAuthStrategies = [XpAuthStrategyClass, XpAuthStrategyOptions][]

export interface XpAuthOptions {
  forms?: any
  strategies?: XpAuthStrategies
}

export interface NbAuthSocialLink {
  link?: string
  url?: string
  target?: string
  title?: string
  icon?: string
}

const socialLinks: NbAuthSocialLink[] = []

export const defaultAuthOptions: any = {
  strategies: [],
  forms: {
    login: {
      redirectDelay: 500, // delay before redirect after a successful login, while success message is shown to the user
      strategy: 'email', // provider id key. If you have multiple strategies, or what to use your own
      rememberMe: true, // whether to show or not the `rememberMe` checkbox
      showMessages: {
        // show/not show success/error messages
        success: true,
        error: true
      },
      socialLinks: socialLinks // social links at the bottom of a page
    },
    register: {
      redirectDelay: 500,
      strategy: 'email',
      showMessages: {
        success: true,
        error: true
      },
      terms: true,
      enablePublicSignup: true,
      socialLinks: socialLinks
    },
    requestPassword: {
      redirectDelay: 500,
      strategy: 'email',
      showMessages: {
        success: true,
        error: true
      },
      socialLinks: socialLinks
    },
    resetPassword: {
      redirectDelay: 500,
      strategy: 'email',
      showMessages: {
        success: true,
        error: true
      },
      socialLinks: socialLinks
    },
    logout: {
      redirectDelay: 500,
      strategy: 'email'
    },
    validation: {
      password: {
        required: true,
        minLength: 4,
        maxLength: 50
      },
      email: {
        required: true
      },
      fullName: {
        required: false,
        minLength: 4,
        maxLength: 50
      }
    }
  }
}

export const XP_AUTH_OPTIONS = new InjectionToken<XpAuthOptions>('Metad Auth Options')
export const XP_AUTH_USER_OPTIONS = new InjectionToken<XpAuthOptions>('Metad User Auth Options')
export const XP_AUTH_STRATEGIES = new InjectionToken<XpAuthStrategies>('Metad Auth Strategies')
export const XP_AUTH_TOKENS = new InjectionToken<XpAuthTokenClass<XpAuthToken>[]>('Metad Auth Tokens')
export const XP_AUTH_INTERCEPTOR_HEADER = new InjectionToken<string>('Metad Simple Interceptor Header')
export const XP_AUTH_TOKEN_INTERCEPTOR_FILTER = new InjectionToken<(req: HttpRequest<any>) => boolean>(
  'Metad Interceptor Filter'
)
export const XP_API_BASE_URL = new InjectionToken<string>('Metad API Base Url')
