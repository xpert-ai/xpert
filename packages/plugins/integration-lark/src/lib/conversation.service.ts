import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { forwardRef, Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import {
  CancelConversationCommand,
  INTEGRATION_PERMISSION_SERVICE_TOKEN,
  IntegrationPermissionService,
  PluginContext,
  RequestContext,
  runWithRequestContext,
  TChatCardAction,
  TChatEventContext,
  TChatInboundMessage
} from '@xpert-ai/plugin-sdk'
import Bull, { Queue } from 'bull'
import { Cache } from 'cache-manager'
import { Repository } from 'typeorm'
import { ChatLarkMessage } from './message'
import {
  normalizeConversationUserKey,
  resolveConversationUserKey,
  toOpenIdConversationUserKey
} from './conversation-user-key'
import { translate } from './i18n'
import { LarkChannelStrategy } from './lark-channel.strategy'
import { LarkChatDispatchService } from './handoff/lark-chat-dispatch.service'
import { LARK_PLUGIN_CONTEXT } from './tokens'
import {
  ChatLarkContext,
  isConfirmAction,
  isEndAction,
  isLarkCardActionValue,
  isRejectAction,
  resolveLarkCardActionValue,
  TIntegrationLarkOptions,
  TLarkEvent
} from './types'
import { LarkConversationBindingEntity } from './entities/lark-conversation-binding.entity'
import { LarkTriggerStrategy } from './workflow/lark-trigger.strategy'

type LarkConversationQueueJob = ChatLarkContext & {
  tenantId?: string
}

type LarkActiveMessage = {
  id?: string
  thirdPartyMessage?: {
    id?: string
    messageId?: string
    language?: string
    header?: any
    elements?: any[]
    status?: string
  }
}

export type LarkDispatchExecutionContextSource = 'exact' | 'xpert-latest' | 'request-fallback'

export interface LarkDispatchExecutionContext {
  tenantId?: string
  organizationId?: string
  createdById?: string
  source: LarkDispatchExecutionContextSource
}

/**
 * Manages Lark user-to-xpert conversation lifecycle and state.
 *
 * Responsibilities:
 * - Store and restore conversation/session metadata in cache.
 * - Orchestrate card action flows (confirm/reject/end) and session cleanup.
 * - Serialize inbound user events through per-user queues to keep ordering.
 * - Delegate actual xpert dispatch to `LarkChatDispatchService`.
 */
@Injectable()
export class LarkConversationService implements OnModuleDestroy {
  private readonly logger = new Logger(LarkConversationService.name)
  private _integrationPermissionService: IntegrationPermissionService
  private _larkTriggerStrategy: LarkTriggerStrategy

  public static readonly prefix = 'lark:chat'
  private static readonly cacheTtlMs = 60 * 10 * 1000 // 10 min

  private userQueues: Map<string, Queue<LarkConversationQueueJob>> = new Map()

  constructor(
    private readonly commandBus: CommandBus,
    @Inject(forwardRef(() => LarkChatDispatchService))
    private readonly dispatchService: LarkChatDispatchService,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    private readonly larkChannel: LarkChannelStrategy,
    @InjectRepository(LarkConversationBindingEntity)
    private readonly conversationBindingRepository: Repository<LarkConversationBindingEntity>,
    @Inject(LARK_PLUGIN_CONTEXT)
    private readonly pluginContext: PluginContext
  ) {}

  private get integrationPermissionService(): IntegrationPermissionService {
    if (!this._integrationPermissionService) {
      this._integrationPermissionService = this.pluginContext.resolve(INTEGRATION_PERMISSION_SERVICE_TOKEN)
    }
    return this._integrationPermissionService
  }

  private get larkTriggerStrategy(): LarkTriggerStrategy {
    if (!this._larkTriggerStrategy) {
      this._larkTriggerStrategy = this.pluginContext.resolve(LarkTriggerStrategy)
    }
    return this._larkTriggerStrategy
  }

  /**
   * Get conversation ID for a Lark participant to xpert.
   * 
   * @param conversationUserKey 
   * @param xpertId 
   * @returns Conversation ID
   */
  async getConversation(conversationUserKey: string, xpertId: string) {
    const normalizedUserKey = normalizeConversationUserKey(conversationUserKey)
    const normalizedXpertId = normalizeConversationUserKey(xpertId)
    if (!normalizedUserKey || !normalizedXpertId) {
      return undefined
    }
    const key = this.getConversationCacheKey(normalizedUserKey, normalizedXpertId)
    const cachedConversationId = await this.cacheManager.get<string>(key)
    if (cachedConversationId) {
      return cachedConversationId
    }

    const binding = await this.conversationBindingRepository.findOne({
      where: {
        conversationUserKey: normalizedUserKey,
        xpertId: normalizedXpertId
      }
    })

    const conversationId = normalizeConversationUserKey(binding?.conversationId)
    if (!conversationId) {
      return undefined
    }

    await this.cacheConversation(normalizedUserKey, normalizedXpertId, conversationId)
    return conversationId
  }

  /**
   * Set conversation ID for a Lark participant to xpert.
   * 
   * @param conversationUserKey 
   * @param xpertId 
   * @param conversationId 
   */
  async setConversation(conversationUserKey: string, xpertId: string, conversationId: string) {
    const normalizedUserKey = normalizeConversationUserKey(conversationUserKey)
    const normalizedXpertId = normalizeConversationUserKey(xpertId)
    const normalizedConversationId = normalizeConversationUserKey(conversationId)
    if (!normalizedUserKey || !normalizedXpertId || !normalizedConversationId) {
      return
    }

    await this.cacheConversation(normalizedUserKey, normalizedXpertId, normalizedConversationId)

    const userId = this.resolveOpenIdFromConversationUserKey(normalizedUserKey)
    const bindingContext = this.resolveBindingContext()
    await this.conversationBindingRepository.upsert(
      {
        userId: userId ?? null,
        conversationUserKey: normalizedUserKey,
        xpertId: normalizedXpertId,
        conversationId: normalizedConversationId,
        tenantId: bindingContext.tenantId ?? null,
        organizationId: bindingContext.organizationId ?? null,
        createdById: bindingContext.createdById ?? null,
        updatedById: bindingContext.updatedById ?? null
      },
      userId ? ['userId'] : ['conversationUserKey', 'xpertId']
    )
  }

  async getLatestConversationBindingByUserId(
    userId: string
  ): Promise<{ xpertId: string; conversationId: string; conversationUserKey: string } | null> {
    const normalizedUserId = normalizeConversationUserKey(userId)
    if (!normalizedUserId) {
      return null
    }

    const binding = await this.conversationBindingRepository.findOne({
      where: {
        userId: normalizedUserId
      }
    })
    if (!binding?.xpertId || !binding?.conversationId || !binding?.conversationUserKey) {
      return null
    }

    return {
      xpertId: binding.xpertId,
      conversationId: binding.conversationId,
      conversationUserKey: binding.conversationUserKey
    }
  }

  async resolveDispatchExecutionContext(
    xpertId: string,
    conversationUserKey?: string
  ): Promise<LarkDispatchExecutionContext> {
    // Lark messages must execute in the xpert creator's org/user context when possible.
    // We first try exact conversation binding, then fallback to latest binding in the same xpert.
    const normalizedXpertId = normalizeConversationUserKey(xpertId)
    if (!normalizedXpertId) {
      return { source: 'request-fallback' }
    }

    const normalizedConversationUserKey = normalizeConversationUserKey(conversationUserKey)
    const exactBinding = normalizedConversationUserKey
      ? await this.conversationBindingRepository.findOne({
          where: {
            conversationUserKey: normalizedConversationUserKey,
            xpertId: normalizedXpertId
          }
        })
      : null

    const needsXpertLatestBinding = !this.hasCompleteDispatchBindingContext(exactBinding)
    const xpertLatestBinding = needsXpertLatestBinding
      ? await this.conversationBindingRepository.findOne({
          where: {
            xpertId: normalizedXpertId
          },
          // When exact binding is missing/incomplete, use the newest known xpert context.
          order: {
            updatedAt: 'DESC'
          }
        })
      : null

    const tenantId =
      this.normalizeBindingContextField(exactBinding?.tenantId) ??
      this.normalizeBindingContextField(xpertLatestBinding?.tenantId)
    const organizationId =
      this.normalizeBindingContextField(exactBinding?.organizationId) ??
      this.normalizeBindingContextField(xpertLatestBinding?.organizationId)
    const createdById =
      this.normalizeBindingContextField(exactBinding?.createdById) ??
      this.normalizeBindingContextField(xpertLatestBinding?.createdById)

    return {
      tenantId,
      organizationId,
      createdById,
      // Source marks how dispatch context was resolved for observability and debugging.
      source: exactBinding ? 'exact' : xpertLatestBinding ? 'xpert-latest' : 'request-fallback'
    }
  }

  async getActiveMessage(conversationUserKey: string, xpertId: string): Promise<LarkActiveMessage | null> {
    const normalizedUserKey = normalizeConversationUserKey(conversationUserKey)
    const normalizedXpertId = normalizeConversationUserKey(xpertId)
    if (!normalizedUserKey || !normalizedXpertId) {
      return null
    }
    const key = this.getActiveMessageCacheKey(normalizedUserKey, normalizedXpertId)
    const message = await this.cacheManager.get<LarkActiveMessage>(key)
    return message ?? null
  }

  async setActiveMessage(conversationUserKey: string, xpertId: string, message: LarkActiveMessage): Promise<void> {
    const normalizedUserKey = normalizeConversationUserKey(conversationUserKey)
    const normalizedXpertId = normalizeConversationUserKey(xpertId)
    if (!normalizedUserKey || !normalizedXpertId) {
      return
    }
    const key = this.getActiveMessageCacheKey(normalizedUserKey, normalizedXpertId)
    await this.cacheManager.set(key, message, LarkConversationService.cacheTtlMs)
  }

  async clearConversationSession(conversationUserKey: string, xpertId: string): Promise<void> {
    const normalizedUserKey = normalizeConversationUserKey(conversationUserKey)
    const normalizedXpertId = normalizeConversationUserKey(xpertId)
    if (!normalizedUserKey || !normalizedXpertId) {
      return
    }
    await this.cacheManager.del(this.getConversationCacheKey(normalizedUserKey, normalizedXpertId))
    await this.cacheManager.del(this.getActiveMessageCacheKey(normalizedUserKey, normalizedXpertId))
    await this.removeConversationBindingFromStore(normalizedUserKey, normalizedXpertId)
  }

  async ask(xpertId: string, content: string, message: ChatLarkMessage) {
    await this.dispatchService.enqueueDispatch({
      xpertId,
      input: content,
      larkMessage: message
    })
  }

  async processMessage(options: ChatLarkContext<TLarkEvent>): Promise<unknown> {
    const { userId, integrationId, message, input, senderOpenId } = options
    const integration = await this.integrationPermissionService.read(integrationId)
    if (!integration) {
      throw new Error(`Integration ${integrationId} not found`)
    }

    let text = input
    if (!text && message?.message?.content) {
      try {
        const textContent = JSON.parse(message.message.content)
        text = textContent.text as string
      } catch {
        text = message.message.content as any
      }
    }

    const normalizedSenderOpenId = normalizeConversationUserKey(senderOpenId)
    const latestBinding = normalizedSenderOpenId
      ? await this.getLatestConversationBindingByUserId(normalizedSenderOpenId)
      : null
    const triggerXpertId = latestBinding ? null : await this.larkTriggerStrategy.getBoundXpertId(integrationId)
    const fallbackXpertId = integration.options?.xpertId
    const targetXpertId = latestBinding?.xpertId ?? triggerXpertId ?? fallbackXpertId

    if (!targetXpertId) {
      await this.larkChannel.errorMessage(
        {
          integrationId,
          chatId: options.chatId
        },
        new Error('No xpertId configured for this Lark integration. Please configure xpertId first.')
      )
      return null
    }

    const conversationUserKey =
      latestBinding?.conversationUserKey ??
      resolveConversationUserKey({
        senderOpenId,
        fallbackUserId: userId
      }) ??
      userId
    if (latestBinding?.conversationUserKey && latestBinding?.conversationId) {
      await this.cacheConversation(
        latestBinding.conversationUserKey,
        latestBinding.xpertId,
        latestBinding.conversationId
      )
    }
    const activeMessage = await this.getActiveMessage(conversationUserKey, targetXpertId)
    const larkMessage = new ChatLarkMessage(
      { ...options, larkChannel: this.larkChannel },
      {
        text,
        language: activeMessage?.thirdPartyMessage?.language || integration.options?.preferLanguage
      }
    )

    if (latestBinding) {
      return await this.dispatchService.enqueueDispatch({
        xpertId: targetXpertId,
        input: text,
        larkMessage
      })
    }

    const handledByTrigger = await this.larkTriggerStrategy.handleInboundMessage({
      integrationId,
      input: text,
      larkMessage
    })
    if (handledByTrigger) {
      return larkMessage
    }

    if (fallbackXpertId) {
      return await this.dispatchService.enqueueDispatch({
        xpertId: fallbackXpertId,
        input: text,
        larkMessage
      })
    }

    await this.larkChannel.errorMessage(
      {
        integrationId,
        chatId: options.chatId
      },
      new Error('No xpertId configured for this Lark integration. Please configure xpertId first.')
    )
    return null
  }

  /**
   * Respond to card button click events.
   * 
   * @param action 
   * @param chatContext 
   * @param conversationUserKey 
   * @param xpertId 
   * @returns 
   */
  async onAction(
    action: string,
    chatContext: ChatLarkContext,
    conversationUserKey: string,
    xpertId: string,
    actionMessageId?: string
  ) {
    const conversationId = await this.getConversation(conversationUserKey, xpertId)

    if (!conversationId) {
      return this.replyActionSessionTimedOut(chatContext)
    }

    if (!isEndAction(action) && !isConfirmAction(action) && !isRejectAction(action)) {
      const user = RequestContext.currentUser()
      const userQueue = await this.getUserQueue(user.id)
      // Adding task to user's queue
      await userQueue.add({
        ...chatContext,
        tenantId: user.tenantId,
        input: action
      })
      return
    }

    const activeMessage = await this.getActiveMessage(conversationUserKey, xpertId)
    const thirdPartyMessage = activeMessage?.thirdPartyMessage

    const larkMessageId = actionMessageId || thirdPartyMessage?.id
    if (!activeMessage || !thirdPartyMessage || !larkMessageId) {
      await this.clearConversationSession(conversationUserKey, xpertId)
      return this.replyActionSessionTimedOut(chatContext)
    }

    const prevMessage = new ChatLarkMessage(
      { ...chatContext, larkChannel: this.larkChannel },
      {
        id: larkMessageId,
        messageId: activeMessage.id || thirdPartyMessage.messageId,
        language: thirdPartyMessage.language,
        header: thirdPartyMessage.header,
        elements: [...(thirdPartyMessage.elements ?? [])],
        status: thirdPartyMessage.status as any
      } as any
    )

    const newMessage = new ChatLarkMessage({ ...chatContext, larkChannel: this.larkChannel }, {
      language: thirdPartyMessage.language
    } as any)

    if (isEndAction(action)) {
      await prevMessage.end()
      await this.cancelConversation(conversationId)
      await this.clearConversationSession(conversationUserKey, xpertId)
    } else if (isConfirmAction(action)) {
      await prevMessage.done()
      await this.dispatchService.enqueueDispatch({
        xpertId,
        larkMessage: newMessage,
        options: {
          confirm: true
        }
      })
    } else if (isRejectAction(action)) {
      await prevMessage.done()
      await this.dispatchService.enqueueDispatch({
        xpertId,
        larkMessage: newMessage,
        options: {
          reject: true
        }
      })
    }
  }

  private async cacheConversation(
    conversationUserKey: string,
    xpertId: string,
    conversationId: string
  ): Promise<void> {
    const key = this.getConversationCacheKey(conversationUserKey, xpertId)
    await this.cacheManager.set(key, conversationId, LarkConversationService.cacheTtlMs)
  }

  private resolveOpenIdFromConversationUserKey(conversationUserKey: string): string | null {
    if (!conversationUserKey.startsWith('open_id:')) {
      return null
    }
    const openId = normalizeConversationUserKey(conversationUserKey.slice('open_id:'.length))
    return openId ?? null
  }

  private resolveBindingContext(): {
    tenantId: string | null
    organizationId: string | null
    createdById: string | null
    updatedById: string | null
  } {
    const tenantId = RequestContext.currentTenantId()
    const organizationId = RequestContext.getOrganizationId()
    const userId = RequestContext.currentUserId()
    return {
      tenantId: tenantId ?? null,
      organizationId: organizationId ?? null,
      createdById: userId ?? null,
      updatedById: userId ?? null
    }
  }

  private hasCompleteDispatchBindingContext(
    binding?: Pick<LarkConversationBindingEntity, 'tenantId' | 'organizationId' | 'createdById'> | null
  ): boolean {
    return Boolean(
      this.normalizeBindingContextField(binding?.tenantId) &&
        this.normalizeBindingContextField(binding?.organizationId) &&
        this.normalizeBindingContextField(binding?.createdById)
    )
  }

  private normalizeBindingContextField(value: unknown): string | undefined {
    return normalizeConversationUserKey(value) ?? undefined
  }

  private async removeConversationBindingFromStore(conversationUserKey: string, xpertId: string): Promise<void> {
    await this.conversationBindingRepository.delete({
      conversationUserKey,
      xpertId
    })
  }

  private getConversationCacheKey(conversationUserKey: string, xpertId: string): string {
    return `${LarkConversationService.prefix}:${conversationUserKey}:${xpertId}`
  }

  private getActiveMessageCacheKey(conversationUserKey: string, xpertId: string): string {
    return `${this.getConversationCacheKey(conversationUserKey, xpertId)}:active-message`
  }

  private async replyActionSessionTimedOut(chatContext: ChatLarkContext): Promise<void> {
    const { integrationId, chatId } = chatContext
    await this.larkChannel.errorMessage(
      { integrationId, chatId },
      new Error(translate('integration.Lark.ActionSessionTimedOut'))
    )
  }

  private async cancelConversation(conversationId?: string): Promise<void> {
    if (!conversationId) {
      return
    }

    try {
      await this.commandBus.execute(new CancelConversationCommand({ conversationId }))
    } catch (error) {
      this.logger.warn(
        `Failed to cancel conversation "${conversationId}" from Lark end action: ${
          (error as Error)?.message ?? error
        }`
      )
    }
  }

  /**
   * Get or create user queue
   *
   * @param userId
   * @returns
   */
  async getUserQueue(userId: string): Promise<Bull.Queue<LarkConversationQueueJob>> {
    if (!this.userQueues.has(userId)) {
      const queue = new Bull<LarkConversationQueueJob>(`lark:user:${userId}`, {
        redis: this.getBullRedisConfig()
      })

      /**
       * Bind processing logic, maximum concurrency is one
       */
      queue.process(1, async (job) => {
        const tenantId = job.data.tenantId || job.data.tenant?.id
        if (!tenantId) {
          this.logger.warn(`Missing tenantId for user ${job.data.userId}, skip job ${job.id}`)
          return
        }

        const user = await this.larkChannel.getUserById(tenantId, job.data.userId)
        if (!user) {
          this.logger.warn(`User ${job.data.userId} not found, skip job ${job.id}`)
          return
        }

        runWithRequestContext(
          {
            user,
            headers: {
              ['organization-id']: job.data.organizationId,
              ['tenant-id']: tenantId,
              ...(job.data.preferLanguage
                ? {
                    language: job.data.preferLanguage
                  }
                : {})
            }
          },
          {},
          async () => {
            try {
              await this.processMessage(job.data as ChatLarkContext<TLarkEvent>)
              return `Processed message: ${job.id}`
            } catch (err) {
              this.logger.error(err)
            }
          }
        )
      })

      // completed event
      queue.on('completed', (job) => {
        console.log(`Job ${job.id} for user ${userId} completed.`)
      })

      // failed event
      queue.on('failed', (job, error) => {
        console.error(`Job ${job.id} for user ${userId} failed:`, error.message)
      })

      queue.on('error', (error) => {
        this.logger.error(`Queue lark:user:${userId} error: ${error?.message || error}`)
      })

      // Save user's queue
      this.userQueues.set(userId, queue)
    }

    return this.userQueues.get(userId)
  }

  private getBullRedisConfig(): Bull.QueueOptions['redis'] {
    const redisUrl = process.env.REDIS_URL
    if (redisUrl) {
      return redisUrl
    }

    const host = process.env.REDIS_HOST || 'localhost'
    const portRaw = process.env.REDIS_PORT || 6379
    const username = process.env['REDIS.USERNAME'] || process.env.REDIS_USER || process.env.REDIS_USERNAME || undefined
    const password = process.env.REDIS_PASSWORD || undefined

    const port = Number(portRaw)
    const redis: Bull.QueueOptions['redis'] = {
      host,
      port: Number.isNaN(port) ? 6379 : port
    }
    if (username) {
      redis['username'] = username
    }
    if (password) {
      redis['password'] = password
    }

    const tlsFlag = process.env.REDIS_TLS
    if (tlsFlag === 'true') {
      redis['tls'] = {
        host,
        port: Number.isNaN(port) ? 6379 : port
      }
    }

    return redis
  }

  /**
   * Handle inbound message from IChatChannel
   *
   * This method is called by LarkHooksController when a message is received via webhook.
   * It creates a job in the user's queue for processing.
   *
   * @param message - Parsed inbound message
   * @param ctx - Event context containing integration info
   */
  async handleMessage(message: TChatInboundMessage, ctx: TChatEventContext<TIntegrationLarkOptions>): Promise<void> {
    const user = RequestContext.currentUser()
    if (!user) {
      this.logger.warn('No user in request context, cannot handle message')
      return
    }

    const userQueue = await this.getUserQueue(user.id)

    // Add task to user's queue
    await userQueue.add({
      tenant: ctx.integration.tenant,
      tenantId: user.tenantId || ctx.tenantId,
      organizationId: ctx.organizationId,
      integrationId: ctx.integration.id,
      preferLanguage: ctx.integration.options?.preferLanguage,
      userId: user.id,
      message: message.raw,
      chatId: message.chatId,
      chatType: message.chatType,
      senderOpenId: message.senderId // Lark sender's open_id
    })
  }

  /**
   * Handle card action from IChatChannel
   *
   * This method is called by LarkHooksController when a card button is clicked.
   *
   * @param action - Parsed card action
   * @param ctx - Event context containing integration info
   */
  async handleCardAction(action: TChatCardAction, ctx: TChatEventContext<TIntegrationLarkOptions>): Promise<void> {
    const user = RequestContext.currentUser()
    if (!user) {
      this.logger.warn('No user in request context, cannot handle card action')
      return
    }

    if (!isLarkCardActionValue(action.value)) {
      this.logger.warn(`Unsupported card action value from Lark: ${JSON.stringify(action.value)}`)
      return
    }

    const normalizedActionOpenId = normalizeConversationUserKey(action.userId)
    const conversationUserKey = toOpenIdConversationUserKey(action.userId)
    if (!conversationUserKey) {
      this.logger.warn('Missing Lark action user open_id, skip card action conversation handling')
      return
    }

    const latestBinding = normalizedActionOpenId
      ? await this.getLatestConversationBindingByUserId(normalizedActionOpenId)
      : null
    const xpertId = latestBinding?.xpertId ?? normalizeConversationUserKey(ctx.integration.options?.xpertId)
    if (!xpertId) {
      this.logger.warn('No xpertId configured for integration')
      return
    }
    const resolvedConversationUserKey = latestBinding?.conversationUserKey ?? conversationUserKey
    if (latestBinding?.conversationUserKey && latestBinding?.conversationId) {
      await this.cacheConversation(
        latestBinding.conversationUserKey,
        latestBinding.xpertId,
        latestBinding.conversationId
      )
    }

    await this.onAction(
      resolveLarkCardActionValue(action.value),
      {
        tenant: ctx.integration.tenant,
        organizationId: ctx.organizationId,
        integrationId: ctx.integration.id,
        preferLanguage: ctx.integration.options?.preferLanguage,
        userId: user.id,
        senderOpenId: action.userId,
        chatId: action.chatId
      } as ChatLarkContext,
      resolvedConversationUserKey,
      xpertId,
      action.messageId
    )
  }

  async onModuleDestroy() {
    for (const queue of this.userQueues.values()) {
      await queue.close()
    }
  }
}
