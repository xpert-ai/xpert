import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common'
import { LanguagesEnum } from '@xpert-ai/contracts'
import type { PendingSsoBindingFlow } from '@xpert-ai/plugin-sdk'
import bcrypt from 'bcryptjs'
import { AccountBindingService } from '../../account-binding'
import { RequestContext } from '../../core/context'
import { UserService } from '../../user'
import { AuthService } from '../auth.service'
import {
  PendingSsoBindingChallengeRecord,
  PendingSsoBindingChallengeService
} from './pending-sso-binding-challenge.service'

export interface AuthSsoBindChallengeView {
  provider: string
  displayName?: string
  avatarUrl?: string
  tenantScoped: true
  expiresAt: string
}

export interface CompleteSsoBindingInput {
  ticket?: string
  userName?: string
  password?: string
}

export interface CompleteCurrentUserSsoBindingInput {
  ticket?: string
}

export interface RegisterAndBindSsoInput {
  ticket?: string
  email?: string
  password?: string
  confirmPassword?: string
}

export interface CompletedSsoBindingResult {
  location: string
}

@Injectable()
export class AuthSsoBindingService {
  constructor(
    private readonly pendingSsoBindingChallengeService: PendingSsoBindingChallengeService,
    private readonly accountBindingService: AccountBindingService,
    private readonly authService: AuthService,
    private readonly userService: UserService
  ) {}

  async getChallenge(ticket?: string): Promise<AuthSsoBindChallengeView> {
    const challenge = await this.getRequiredChallenge(ticket, 'anonymous_bind')
    return this.toChallengeView(challenge)
  }

  async getCurrentUserChallenge(ticket?: string): Promise<AuthSsoBindChallengeView> {
    const challenge = await this.getRequiredCurrentUserChallenge(ticket)
    return this.toChallengeView(challenge)
  }

  async completeBinding(input: CompleteSsoBindingInput): Promise<CompletedSsoBindingResult> {
    const challenge = await this.getRequiredChallenge(input?.ticket, 'anonymous_bind')
    const userName = this.requireValue(input?.userName, 'userName')
    const password = this.requireValue(input?.password, 'password')
    const normalizedUserName = userName.toLowerCase()

    const user = await this.userService.findOneByOptions({
      where: [
        {
          tenantId: challenge.tenantId,
          email: normalizedUserName,
          emailVerified: true
        },
        {
          tenantId: challenge.tenantId,
          username: normalizedUserName
        }
      ]
    })

    if (!user?.id || !user?.hash || !(await bcrypt.compare(password, user.hash))) {
      throw new UnauthorizedException('Incorrect account or password.')
    }

    await this.bindUserToChallenge(challenge, user.id)

    const tokens = await this.authService.issueTokensForUser(user.id)
    await this.pendingSsoBindingChallengeService.delete(challenge.ticket)

    return {
      location: this.buildSignInSuccessLocation(tokens, challenge.returnTo ?? undefined)
    }
  }

  async completeCurrentUserBinding(
    input: CompleteCurrentUserSsoBindingInput
  ): Promise<CompletedSsoBindingResult> {
    const challenge = await this.getRequiredCurrentUserChallenge(input?.ticket)
    const userId = RequestContext.currentUserId()

    if (!userId) {
      throw new UnauthorizedException('Current login is required.')
    }

    await this.bindUserToChallenge(challenge, userId)
    await this.pendingSsoBindingChallengeService.delete(challenge.ticket)

    return {
      location: this.buildPostBindingLocation(challenge.returnTo ?? undefined)
    }
  }

  async registerAndBind(
    input: RegisterAndBindSsoInput,
    languageCode: LanguagesEnum
  ): Promise<CompletedSsoBindingResult> {
    const challenge = await this.getRequiredChallenge(input?.ticket, 'anonymous_bind')
    const email = this.requireValue(input?.email, 'email').toLowerCase()
    const password = this.requireValue(input?.password, 'password')
    const confirmPassword = this.requireValue(input?.confirmPassword, 'confirmPassword')

    if (password !== confirmPassword) {
      throw new BadRequestException('The password and confirmation password must match.')
    }

    const existingBoundUser = await this.accountBindingService.resolveUser({
      tenantId: challenge.tenantId,
      provider: challenge.provider,
      subjectId: challenge.subjectId
    })

    if (existingBoundUser?.id) {
      throw new ConflictException(
        `This ${challenge.provider} identity is already bound to another Xpert account. Please contact your administrator.`
      )
    }

    const user = await this.authService.register(
      {
        user: {
          email,
          tenant: {
            id: challenge.tenantId
          } as any
        },
        password,
        confirmPassword,
        organizationId: challenge.organizationId ?? undefined
      },
      languageCode
    )

    await this.bindUserToChallenge(challenge, user.id)

    const tokens = await this.authService.issueTokensForUser(user.id)
    await this.pendingSsoBindingChallengeService.delete(challenge.ticket)

    return {
      location: this.buildSignInSuccessLocation(tokens, challenge.returnTo ?? undefined)
    }
  }

  private async getRequiredChallenge(
    ticket: string | undefined,
    expectedFlow: PendingSsoBindingFlow
  ) {
    const normalizedTicket = this.requireValue(ticket, 'ticket')
    const challenge = await this.pendingSsoBindingChallengeService.get(normalizedTicket)

    if (!challenge) {
      throw new BadRequestException('SSO binding session has expired. Please sign in again.')
    }

    if (challenge.flow !== expectedFlow) {
      throw new BadRequestException('SSO binding session has expired. Please sign in again.')
    }

    return challenge
  }

  private async getRequiredCurrentUserChallenge(ticket?: string) {
    const challenge = await this.getRequiredChallenge(ticket, 'current_user_confirm')
    const currentUserId = RequestContext.currentUserId()
    const currentTenantId = RequestContext.getScope().tenantId

    if (!currentUserId) {
      throw new UnauthorizedException('Current login is required.')
    }

    if (!currentTenantId || currentTenantId !== challenge.tenantId) {
      throw new BadRequestException('SSO binding session is invalid. Please start again.')
    }

    return challenge
  }

  private toChallengeView(challenge: PendingSsoBindingChallengeRecord): AuthSsoBindChallengeView {
    return {
      provider: challenge.provider,
      displayName: challenge.displayName ?? undefined,
      avatarUrl: challenge.avatarUrl ?? undefined,
      tenantScoped: true,
      expiresAt: challenge.expiresAt
    }
  }

  private async bindUserToChallenge(
    challenge: PendingSsoBindingChallengeRecord,
    userId: string
  ): Promise<void> {
    const existingUserBinding = await this.accountBindingService.getUserBinding({
      tenantId: challenge.tenantId,
      userId,
      provider: challenge.provider
    })

    if (existingUserBinding?.subjectId && existingUserBinding.subjectId !== challenge.subjectId) {
      throw new ConflictException(
        `This Xpert account is already bound to another ${challenge.provider} identity. Please unbind it first or contact your administrator.`
      )
    }

    try {
      await this.accountBindingService.bindUser({
        tenantId: challenge.tenantId,
        userId,
        provider: challenge.provider,
        subjectId: challenge.subjectId,
        profile: challenge.profile ?? undefined
      })
    } catch (error) {
      const message = (error as Error)?.message || 'Failed to complete SSO binding.'
      if (
        message.includes('already bound to another user') ||
        message.includes('already occupied by another user')
      ) {
        throw new ConflictException(
          `This ${challenge.provider} identity is already bound to another Xpert account. Please contact your administrator.`
        )
      }
      throw error
    }
  }

  private requireValue(value: string | undefined, field: string): string {
    const normalized = typeof value === 'string' ? value.trim() : ''
    if (!normalized) {
      throw new BadRequestException(`'${field}' is required.`)
    }
    return normalized
  }

  private buildSignInSuccessLocation(
    tokens: { jwt: string; refreshToken: string; userId: string },
    returnTo?: string
  ): string {
    const params = new URLSearchParams({
      jwt: tokens.jwt,
      refreshToken: tokens.refreshToken,
      userId: tokens.userId
    })

    if (returnTo) {
      params.set('returnTo', returnTo)
    }

    return `/sign-in/success?${params.toString()}`
  }

  private buildPostBindingLocation(returnTo?: string): string {
    return typeof returnTo === 'string' && returnTo.trim().length > 0 ? returnTo : '/'
  }
}
