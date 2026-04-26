import { BaseStore } from '@langchain/langgraph'
import { IChatMessage, LongTermMemoryTypeEnum, TFile, TFileDirectory } from '@xpert-ai/contracts'
import { PaginationParams, RequestContext, TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { InjectQueue } from '@nestjs/bull'
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Queue } from 'bull'
import { DeepPartial, Repository } from 'typeorm'
import { ChatMessageService } from '../chat-message/chat-message.service'
import { CreateCopilotStoreCommand } from '../copilot-store'
import { VOLUME_CLIENT, VolumeClient, VolumeSubtreeClient } from '../shared/volume'
import { FindAgentExecutionsQuery, XpertAgentExecutionStateQuery } from '../xpert-agent-execution/queries'
import { ChatConversation } from './conversation.entity'
import { ChatConversationPublicDTO } from './dto'

@Injectable()
export class ChatConversationService extends TenantOrganizationAwareCrudService<ChatConversation> {
	private readonly logger = new Logger(ChatConversationService.name)

	constructor(
		@InjectRepository(ChatConversation)
		public repository: Repository<ChatConversation>,
		private readonly messageService: ChatMessageService,
		readonly commandBus: CommandBus,
		readonly queryBus: QueryBus,
		@InjectQueue('conversation-summary') private summaryQueue: Queue,
		@Inject(VOLUME_CLIENT)
		private readonly volumeClient: VolumeClient
	) {
		super(repository)
	}

	async findAllByXpert(xpertId: string, options: PaginationParams<ChatConversation>) {
		return this.findAll({
			...options,
			where: {
				...(options.where ?? {}),
				xpertId
			}
		})
	}

	async findOneByThreadId(threadId: string) {
		return this.findOneByOptions({
			where: {
				threadId
			}
		})
	}

	async findOneDetail(id: string, options: DeepPartial<PaginationParams<ChatConversation>>) {
		// Split executions relation
		const { relations } = options ?? {}
		const entity = await this.findOne(id, {
			...(options ?? {}),
			relations: relations?.filter((_) => _ !== 'executions')
		})

		let executions = null
		if (relations?.includes('executions')) {
			const result = await this.queryBus.execute(
				new FindAgentExecutionsQuery({ where: { threadId: entity.threadId } })
			)
			executions = result.items
		}

		return new ChatConversationPublicDTO({
			...entity,
			executions
		})
	}

	async triggerSummary(conversationId: string, type: LongTermMemoryTypeEnum, userId: string, messageId?: string) {
		let message: IChatMessage = null
		if (messageId) {
			message = await this.messageService.findOne(messageId)
		} else {
			const conversation = await this.findOne(conversationId, { relations: ['messages'] })
			if (!conversation.messages.length) {
				return
			}
			message = conversation.messages[conversation.messages.length - 1]
		}

		if (message?.summaryJob?.[type]) {
			return
		}
		return await this.summaryQueue.add({
			conversationId,
			userId,
			messageId,
			types: [type]
		})
	}

	async deleteSummary(conversationId: string, messageId: string, type: LongTermMemoryTypeEnum) {
		const conversation = await this.findOne(conversationId)
		const message = await this.messageService.findOne(messageId)
		const { tenantId, organizationId } = message
		const userId = RequestContext.currentUserId()

		const summaryJob = message.summaryJob?.[type]
		try {
			if (summaryJob?.jobId) {
				const job = await this.getJob(summaryJob.jobId)
				// cancel job
				if (job) {
					await job.discard()
					await job.moveToFailed({ message: 'Job stopped by user' }, true)
				}
			}

			if (summaryJob) {
				if (summaryJob.memoryKey) {
					const keys = Array.isArray(summaryJob.memoryKey) ? summaryJob.memoryKey : [summaryJob.memoryKey]

					const store = await this.commandBus.execute<CreateCopilotStoreCommand, BaseStore>(
						new CreateCopilotStoreCommand({
							tenantId,
							organizationId,
							userId
						})
					)

					for await (const key of keys) {
						await store.delete([conversation.xpertId], key)
					}
				}

				await this.messageService.update(messageId, {
					summaryJob: {
						...message.summaryJob,
						[type]: null
					}
				})
			}
		} catch (err) {
			this.logger.error(err)
		}
	}

	async getJob(id: number | string) {
		return await this.summaryQueue.getJob(id)
	}

	async getThreadState(id: string) {
		const conversation = await this.findOne(id, { relations: ['messages'] })
		const messages = (conversation.messages ?? []).filter(Boolean)
		const lastMessage = messages[messages.length - 1]

		if (lastMessage?.executionId) {
			return await this.queryBus.execute(new XpertAgentExecutionStateQuery(lastMessage.executionId))
		}

		return null
	}

	async getAttachments(id: string) {
		const conversation = await this.findOne(id, { relations: ['attachments'] })
		return conversation.attachments
	}

    async getWorkspaceFiles(id: string, path?: string, deepth?: number): Promise<TFileDirectory[]> {
        const conversation = await this.findOne(id)
        const { client, scopePath } = this.createWorkspaceVolumeClient(conversation)
        return client.list(scopePath, {
            path,
            deepth
        })
    }

    async readWorkspaceFile(id: string, filePath: string): Promise<TFile> {
        const conversation = await this.findOne(id)
        const { client, scopePath } = this.createWorkspaceVolumeClient(conversation)
        return client.readFile(scopePath, filePath)
    }

    async saveWorkspaceFile(id: string, filePath: string, content: string): Promise<TFile> {
        const conversation = await this.findOne(id)
        const { client, scopePath } = this.createWorkspaceVolumeClient(conversation)
        return client.saveFile(scopePath, filePath, content)
    }

    async uploadWorkspaceFile(
        id: string,
        folderPath: string,
        file: { originalname: string; buffer: Buffer; mimetype?: string }
    ): Promise<TFile> {
        const conversation = await this.findOne(id)
        const { client, scopePath } = this.createWorkspaceVolumeClient(conversation)
        return client.uploadFile(scopePath, folderPath, file)
    }

    async deleteWorkspaceFile(id: string, filePath: string): Promise<void> {
        const conversation = await this.findOne(id)
        const { client, scopePath } = this.createWorkspaceVolumeClient(conversation)
        await client.deleteFile(scopePath, filePath)
    }

    private createWorkspaceVolumeClient(conversation: ChatConversation) {
        if (conversation.projectId) {
            return {
                client: new VolumeSubtreeClient(this.createProjectVolumeHandle(conversation), {
                    allowRootWorkspace: true
                }),
                scopePath: ''
            }
        }

        if (conversation.xpertId) {
            return {
                client: new VolumeSubtreeClient(this.createXpertVolumeHandle(conversation), {
                    allowRootWorkspace: true
                }),
                scopePath: ''
            }
        }

        throw new BadRequestException('Non-project conversations require xpertId to access workspace files')
    }

    private createProjectVolumeHandle(conversation: ChatConversation) {
        return this.volumeClient.resolve({
            tenantId: conversation.tenantId,
            catalog: 'projects',
            projectId: conversation.projectId,
            userId: conversation.createdById
        })
    }

    private createXpertVolumeHandle(conversation: ChatConversation) {
        return this.volumeClient.resolve({
            tenantId: conversation.tenantId,
            catalog: 'xperts',
            userId: conversation.createdById,
            xpertId: conversation.xpertId,
            isolateByUser: true
        })
    }

}
