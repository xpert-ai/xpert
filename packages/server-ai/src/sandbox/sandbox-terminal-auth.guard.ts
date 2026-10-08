import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthGuard } from '@nestjs/passport'
import { WsException } from '@nestjs/websockets'
import { InjectRepository } from '@nestjs/typeorm'
import { IApiPrincipal, IUser, SandboxTerminalClientEvent } from '@xpert-ai/contracts'
import { WsJWTGuard } from '@xpert-ai/server-core'
import { Repository } from 'typeorm'
import { t } from 'i18next'
import { Socket } from 'socket.io'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { assertWorkbenchPrincipal } from '../ai/workbench-principal'

class ClientSecretSocketGuard extends AuthGuard('client-secret') {
    override getRequest(context: ExecutionContext) {
        return context.switchToWs().getClient<Socket>().handshake
    }
}

/** Revalidates each message; opening a PTY also checks the persisted Assistant scope. */
@Injectable()
export class SandboxTerminalAuthGuard extends WsJWTGuard {
    private readonly secretGuard = new ClientSecretSocketGuard()
    constructor(
        reflector: Reflector,
        @InjectRepository(ChatConversation) private readonly conversations: Repository<ChatConversation>
    ) {
        super(reflector)
    }
    override async canActivate(context: ExecutionContext): Promise<boolean> {
        const handshake = context.switchToWs().getClient<Socket>().handshake as Socket['handshake'] & {
            user?: IUser | IApiPrincipal
        }
        const token: unknown = handshake.auth?.token
        try {
            if (typeof token === 'string' && token.startsWith('cs-x-')) {
                handshake.headers['x-client-secret'] = token
                const organizationId: unknown = handshake.auth?.organizationId
                if (typeof organizationId === 'string') handshake.headers['organization-id'] = organizationId
                if (!(await this.secretGuard.canActivate(context))) return false
            } else if (!(await super.canActivate(context))) return false
            if (!handshake.user) throw new UnauthorizedException()
            assertWorkbenchPrincipal(handshake.user)
            if (context.switchToWs().getPattern() === SandboxTerminalClientEvent.Open) {
                const data = context.switchToWs().getData<{ conversationId?: string }>()
                if (typeof data?.conversationId !== 'string' || !data.conversationId.trim())
                    throw new UnauthorizedException()
                const conversation = await this.conversations.findOneByOrFail({ id: data.conversationId })
                assertWorkbenchPrincipal(handshake.user, conversation)
            }
            return true
        } catch (error) {
            if (error instanceof WsException) throw error
            throw new WsException({
                status: 403,
                message:
                    error instanceof Error
                        ? error.message
                        : t('server-ai:Error.AssistantAccessForbidden', {
                              defaultValue: 'You do not have access to this assistant.'
                          })
            })
        }
    }
}
