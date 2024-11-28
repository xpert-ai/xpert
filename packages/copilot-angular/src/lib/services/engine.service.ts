import { CdkDragDrop } from '@angular/cdk/drag-drop'
import { Injectable, TemplateRef, computed, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { AIMessage, BaseMessage, HumanMessage, isAIMessage } from '@langchain/core/messages'
import { StringOutputParser } from '@langchain/core/output_parsers'
import { Runnable } from '@langchain/core/runnables'
import { ToolInputParsingException } from '@langchain/core/tools'
import { PregelInputType } from '@langchain/langgraph/dist/pregel'
import { BaseCheckpointSaver, END, GraphValueError, StateGraph } from '@langchain/langgraph/web'
import {
  CopilotAgentType,
  CopilotChatConversation,
  CopilotChatMessage,
  CopilotChatMessageRoleEnum,
  CopilotChatOptions,
  CopilotCommand,
  CopilotContext,
  CopilotEngine,
  getCommandPrompt,
  MessageDataType,
  nanoid,
  SuggestionOutput,
  SuggestionOutputTool,
  TAgentConfig
} from '@metad/copilot'
import { TranslateService } from '@ngx-translate/core'
import { AgentExecutor, createOpenAIToolsAgent } from 'langchain/agents'
import { compact, flatten } from 'lodash-es'
import { NGXLogger } from 'ngx-logger'
import { DropAction, NgmCopilotChatMessage } from '../types'
import { injectCreateChatAgent } from './agent-free'
import { NgmCopilotContextToken, recognizeContext, recognizeContextParams } from './context.service'
import { NgmCopilotService } from './copilot.service'
import { formatDocumentsAsString } from 'langchain/util/document'

export const AgentRecursionLimit = 20

let uniqueId = 0

@Injectable()
export class NgmCopilotEngineService implements CopilotEngine {
  readonly #logger? = inject(NGXLogger, { optional: true })
  readonly #translate? = inject(TranslateService, { optional: true })
  readonly copilot = inject(NgmCopilotService)
  readonly copilotContext = inject(NgmCopilotContextToken)
  readonly checkpointSaver = inject(BaseCheckpointSaver)
  readonly createChatAgent = injectCreateChatAgent()

  public name?: string
  private api = signal('/api/chat')
  private chatId = `chat-${uniqueId++}`
  private key = computed(() => `${this.api()}|${this.chatId}`)

  placeholder?: string

  // aiOptions = {} as AIOptions

  // readonly #aiOptions = signal<AIOptions>({
  //   model: DefaultModel
  // } as AIOptions)


  readonly agentConfig$ = signal<TAgentConfig>({
    recursionLimit: AgentRecursionLimit
  })
  get agentConfig() {
    return this.agentConfig$()
  }
  set agentConfig(value: TAgentConfig) {
    this.agentConfig$.set(value)
  }

  readonly verbose = computed(() => this.agentConfig$().verbose)

  readonly llm = toSignal(this.copilot.llm$)

  // routeTemplate: TemplateRef<any> | null = null

  /**
   * One conversation including user and assistant messages
   * This is a array of conversations
   */
  readonly conversations$ = signal<Array<CopilotChatConversation>>([])
  readonly #conversationId = signal<string>(nanoid())

  readonly conversations = computed(() => this.conversations$())
  readonly conversation = computed(() => this.conversations$()[this.conversations$().length - 1])
  readonly messages = computed(() => flatten(this.conversations$().map((c) => c.messages)))

  readonly lastConversation = computed(() => {
    const conversation =
      this.conversations$()[this.conversations$().length - 1] ??
      ({ messages: [], command: null } as CopilotChatConversation)

    // Get last conversation messages
    const lastMessages = []
    let lastUserMessage = null
    for (let i = conversation.messages.length - 1; i >= 0; i--) {
      const message = conversation.messages[i]
      if (message.role === CopilotChatMessageRoleEnum.User) {
        if (lastUserMessage) {
          lastUserMessage.content = message.content + '\n' + lastUserMessage.content
        } else {
          lastUserMessage = {
            role: CopilotChatMessageRoleEnum.User,
            content: message.content
          }
        }
      } else if (message.role !== CopilotChatMessageRoleEnum.Info) {
        if (lastUserMessage) {
          lastMessages.push(lastUserMessage)
          lastUserMessage = null
        }
        lastMessages.push(message)
      }
    }
    if (lastUserMessage) {
      lastMessages.push(lastUserMessage)
    }
    return {
      ...conversation,
      messages: lastMessages.reverse()
    }
  })

  readonly lastUserMessages = computed(() => {
    const conversation = this.conversations$()[this.conversations$().length - 1]
    const messages: BaseMessage[] = []
    if (!conversation) {
      return messages
    }
    for (let i = conversation.messages.length - 1; i >= 0; i--) {
      const message = conversation.messages[i]
      if (message.role === CopilotChatMessageRoleEnum.User && !message.command) {
        messages.push(message.lcMessage)
      } else {
        break
      }
    }
    return messages
  })

  readonly currentConversation = computed(() => this.conversations$()[this.conversations$().length - 1])
  readonly currentCommand = computed(() => this.currentConversation()?.command)
  readonly currentConversationId = computed(() => this.currentConversation()?.id)

  readonly chatHistoryMessages = computed(() => {
    const conversation =
      this.conversations$()[this.conversations$().length - 1] ?? ({ messages: [] } as CopilotChatConversation)
    return conversation.messages.map(({ lcMessage }) => lcMessage).filter((m) => !!m)
  })

  readonly commands = computed(() => this.copilotContext.commands())

  readonly #dropActions = signal<Record<string, DropAction>>({})

  // Chat States
  readonly error = signal<undefined | Error>(undefined)
  // readonly streamData = signal<JSONValue[] | undefined>(undefined)
  readonly isLoading = signal(false)

  // readonly agentMemory = new MemorySaver()

  constructor() {
    //   effect(() => {
    //     console.log('conversations:', this.conversations$())
    //     console.log('last conversation:', this.lastConversation())
    //     console.log('last user messages:', this.lastUserMessages())
    //   })
  }

  updateAgentConfig(config?: Partial<TAgentConfig>) {
    this.agentConfig$.update((state) => ({ ...state, ...config }))
  }

  /**
   * Find command by name or alias
   *
   * @param name Name or alias of command
   * @returns AI Command
   */
  getCommand(name: string) {
    return this.copilotContext.getCommand(name)
  }

  getCommandWithContext(name: string) {
    return this.copilotContext.getCommandWithContext(name)
  }

  registerDropAction(dropAction: DropAction) {
    this.#dropActions.update((state) => ({
      ...state,
      [dropAction.id]: dropAction
    }))
  }
  unregisterDropAction(id: string) {
    this.#dropActions.update((state) => {
      delete state[id]
      return {
        ...state
      }
    })
  }

  /**
   * Chat with prompt, split it to command and free chat
   *
   * @param prompt
   * @param options
   * @returns
   */
  async chat(prompt: string, options?: CopilotChatOptions) {
    this.#logger?.debug(`process copilot ask: ${prompt}`)

    let { command } = options ?? {}
    const { conversationId } = options ?? {}

    let conversation = null
    if (command && conversationId) {
      conversation = this.conversations().find((item) => item.id === conversationId)
    }

    // deconstruct prompt to get command and prompt
    if (!command && prompt) {
      const data = getCommandPrompt(prompt)
      command = data.command
      prompt = data.prompt
    }

    const commandWithContext = this.getCommandWithContext(command)
    if (command && !commandWithContext?.command) {
      prompt = `/${command} ${prompt}`
      this.#logger?.warn(`Copilot command '${command}' is not found`)
    }

    if (command && commandWithContext?.command) {
      // Initialize conversation
      if (!conversation) {
        this.upsertConversation({
          id: conversationId,
          type: 'command',
          command: commandWithContext.command
        })
      }

      const _command = commandWithContext.command

      // Exec command implementation
      if (_command.implementation) {
        this.upsertMessage({
          id: nanoid(),
          role: CopilotChatMessageRoleEnum.User,
          content: prompt,
          command,
          lcMessage: new HumanMessage({ content: prompt })
        })
        const result = await _command.implementation()
        if (typeof result === 'string') {
          this.upsertMessage({
            id: nanoid(),
            role: CopilotChatMessageRoleEnum.Assistant,
            content: result,
            status: 'done',
            lcMessage: new AIMessage({ content: result })
          })
        }
        return
      } else {
        return await this.callCommand(_command, prompt, { ...(options ?? {}), context: commandWithContext.context })
      }
    } else {
      if (this.currentCommand()?.agent?.conversation) {
        const _command = this.currentCommand()
        const commandWithContext = this.getCommandWithContext(_command.name)

        return await this.callCommand(_command, prompt, { ...(options ?? {}), context: commandWithContext.context })
      }

      /**
       * @todo Use langchain agent to execute free chat conversation
       */

      const freeCommand: CopilotCommand = {
        name: 'free',
        description: 'free chat',
        hidden: true,
        agent: {
          type: CopilotAgentType.Graph
        },
        createGraph: this.createChatAgent
      }
      this.upsertConversation({
        id: conversationId,
        type: 'free',
        command: freeCommand
      })
      // Last conversation messages before append new messages
      const lastConversation = this.lastConversation()

      return await this.triggerGraphAgent(prompt, lastConversation, freeCommand, { context: this.copilotContext })
    }
  }

  /**
   * Execute command prompt
   *
   * @param _command
   * @param prompt
   * @param options
   * @returns
   */
  async callCommand(_command: CopilotCommand, prompt: string, options: CopilotChatOptions) {
    const { conversationId, context, interactive } = options ?? {}

    // For agent command
    if (_command.agent) {
      return await this.triggerCommandAgent(prompt, _command, {
        conversationId,
        context: context,
        interactive
      })
    }
  }

  /**
   * Execute agent command
   *
   * @param content
   * @param command
   * @param options
   * @returns
   */
  async triggerCommandAgent(content: string, command: CopilotCommand, options?: CopilotChatOptions) {
    const { conversationId } = options ?? {}
    let currentConversation = this.currentConversation()
    if (conversationId) {
      currentConversation = this.conversations().find((c) => c.id === conversationId)
    }
    
    switch (command.agent.type) {
      case CopilotAgentType.Default:
        return await this.triggerDefaultAgent(content, currentConversation, command, options)
      case CopilotAgentType.Graph:
        return await this.triggerGraphAgent(content, currentConversation, command, options)
    }
  }

  async triggerDefaultAgent(content: string, conversation: CopilotChatConversation, command: CopilotCommand, options?: CopilotChatOptions) {
    // ------------------------- 重复，需重构
    const conversationId = conversation.id
    const { context } = options ?? {}
    const abortController = new AbortController()

    // Get chat history messages
    const chatHistoryMessages = this.chatHistoryMessages()

    // Context content
    const { systemPrompt, contextContent } = await this.upsertUserInputMessage(command, content, context)

    const assistantId = nanoid()

    this.upsertMessage({
      id: assistantId,
      role: CopilotChatMessageRoleEnum.Assistant,
      content: '',
      status: 'thinking',
      historyCursor: command.historyCursor?.()
    })

    this.updateConversation(conversationId, (state) => {
      return {
        ...state,
        status: 'answering',
        abortController
      }
    })

    // Remove thinking message when abort
    const removeMessageWhenAbort = () => {
      this.stopMessage(assistantId)
    }
    abortController.signal.addEventListener('abort', removeMessageWhenAbort)
    // ------------------------- 重

    try {
      let chain: Runnable = null
      const llm = this.llm()
      const verbose = this.verbose()
      if (llm) {
        if (!command.prompt) {
          throw new Error(`Prompt should be provided for agent command '${command.name}'`)
        }

        switch (command.agent.type) {
          case CopilotAgentType.Default: {
            const agent = await createOpenAIToolsAgent({
              llm,
              tools: command.tools,
              prompt: command.prompt
            })
            chain = new AgentExecutor({
              agent,
              tools: command.tools,
              verbose
            }) as unknown as Runnable
            break
          }
          case CopilotAgentType.LangChain: {
            chain = command.prompt.pipe(this.llm()).pipe(new StringOutputParser())
            break
          }
          default:
            throw new Error(`Agent type '${command.agent.type}' is not supported`)
        }
      } else {
        throw new Error('LLM is not available')
      }

      // For few shot when first ask question
      if (command.fewShotPrompt && !chatHistoryMessages.length) {
        content = await command.fewShotPrompt.format({ input: content, context: contextContent })
        this.#logger?.debug(`[Command] [${command.name}] few shot input: ${content}`)
      }

      let verboseContent = ''
      const result = await chain.invoke(
        {
          input: content,
          system_prompt: systemPrompt,
          context: contextContent,
          role: this.copilot.rolePrompt(),
          chat_history: chatHistoryMessages
        },
        {
          callbacks: [
            {
              handleLLMEnd: async (output) => {
                const text = output.generations[0][0].text
                if (text) {
                  if (verbose) {
                    verboseContent += '\n\n✨ ' + text
                  } else {
                    verboseContent = text
                  }
                  this.upsertMessage({
                    id: assistantId,
                    role: CopilotChatMessageRoleEnum.Assistant,
                    content: verboseContent
                  })
                }
              }
            }
          ]
        }
      )

      this.#logger?.debug(`Agent command '${command.name}' result:`, result)

      this.upsertMessage({
        id: assistantId,
        role: CopilotChatMessageRoleEnum.Assistant,
        content: verboseContent,
        status: 'done',
        lcMessage: new AIMessage({ content: verboseContent })
      })

      this.updateConversation(conversationId, (state) => {
        return {
          ...state,
          status: 'completed'
        }
      })
      return null
    } catch (err: any) {
      console.error(err)
      this.upsertMessage({
        id: assistantId,
        role: CopilotChatMessageRoleEnum.Assistant,
        // content: '',
        status: 'error',
        error: err.message
      })
      this.updateConversation(conversationId, (state) => {
        return {
          ...state,
          status: 'error'
        }
      })
      return
    } finally {
      abortController.signal.removeEventListener('abort', removeMessageWhenAbort)
    }
  }

  async triggerGraphAgent(
    content: string | null,
    conversation: CopilotChatConversation,
    command: CopilotCommand,
    options?: CopilotChatOptions
  ) {
    // ------------------------- 重复，需重构
    const { context, interactive } = options ?? {}

    const abortController = new AbortController()

    // Get chat history messages
    // const chatHistoryMessages = this.chatHistoryMessages()
    const lastUserMessages = this.lastUserMessages()

    // Context content
    let contextContent = null
    if (content) {
      const result = await this.upsertUserInputMessage(command, content, context)
      if (result.error) {
        return ''
      }
      contextContent = result.contextContent
    }

    // Update conversation status to 'answering'
    this.updateConversation(conversation.id, (conversation) => ({
      ...conversation,
      status: 'answering',
      abortController
    }))

    // Update last ai message to 'done', and update graph state if message is a route
    const lastMessage = conversation.messages[conversation.messages.length - 1]
    if (lastMessage && lastMessage.role === CopilotChatMessageRoleEnum.Assistant && lastMessage.status === 'pending') {
      this.upsertMessage({
        id: lastMessage.id,
        status: 'done'
      })
    }

    // New ai message is thinking
    const assistantId = nanoid()
    this.upsertMessage({
      id: assistantId,
      role: CopilotChatMessageRoleEnum.Assistant,
      content: '',
      status: 'thinking',
      historyCursor: command.historyCursor?.()
    })

    // Remove thinking message when abort
    const abort = signal(false)
    const removeMessageWhenAbort = () => {
      this.stopMessage(assistantId)
      abort.set(true)
    }
    abortController.signal.addEventListener('abort', removeMessageWhenAbort)
    // --------------------------

    // Compile state graph
    let references = null
    let graph = conversation.graph
    if (!graph) {
      try {
        graph = await this.createCommandGraph(command, interactive)

        this.updateConversation(conversation.id, (conversation) => ({
          ...conversation,
          graph
        }))

        // For few shot
        if (command.fewShotPrompt) {
          content = await command.fewShotPrompt.format({ input: content, context: '' })
          this.#logger?.debug(`[Command] [${command.name}] few shot input: ${content}`)
        }

        if (command.agent.referencesRetriever) {
          references = await command.agent.referencesRetriever.pipe(formatDocumentsAsString).invoke(content)
        }
      } catch (err: any) {
        console.error(err)
        this.upsertMessage({
          id: assistantId,
          role: CopilotChatMessageRoleEnum.Assistant,
          status: 'error',
          error: err.message
        })
        this.updateConversation(conversation.id, (conversation) => ({
          ...conversation,
          status: 'error'
        }))
        return
      }
    }

    try {
      let inputState: PregelInputType = null
      const messages = [...lastUserMessages]
      if (content) {
        messages.push(new HumanMessage({ content }))
        inputState = {
          input: content,
          messages,
          context: contextContent ? contextContent : null,
          references
        }
      }

      const eventStream = await graph.streamEvents(
        inputState
          ? {
              ...inputState,
              role: this.copilot.rolePrompt(),
              language: this.copilot.languagePrompt()
            }
          : null,
        {
          version: 'v2',
          configurable: {
            thread_id: conversation.id,
            checkpoint_ns: '',
          },
          recursionLimit: this.agentConfig.recursionLimit ?? AgentRecursionLimit,
          signal: abortController.signal
        })
      let verboseContent = ''
      const eventStack = []
      for await (const event of eventStream) {
        
        switch(event.event) {
          case('on_chain_start'): {
            eventStack.push(event.event)
            break
          }
          case('on_chain_end'): {
            eventStack.pop()
            if (eventStack.length === 0) {
              this.upsertMessage({
                id: assistantId,
                status: 'done'
              })
            }
            break
          }
          case('on_tool_start'): {
            eventStack.push(event.event)
            // console.log(event)
            this.upsertMessage({
              id: assistantId,
              data: {
                type: MessageDataType.ToolsCall,
                data: [
                  {
                    id: event.run_id,
                    name: event.name,
                    args: event.data.input.input
                  }
                ]
              }
            })

            break
          }
          case('on_tool_end'): {
            eventStack.pop()
            // console.log(event)
            this.upsertMessage({
              id: assistantId,
              data: null
            })
            break
          }
          case('on_chain_stream'): {
            if (event.data?.chunk?.agent?.messages?.[0]?.content) {
              verboseContent += event.data?.chunk.agent.messages[0].content
            } else {
              // console.log(event)
            }
            this.upsertMessage({
                id: assistantId,
                content: verboseContent
              })
          }
        }
      }

      if (eventStack.length > 0) {
        this.upsertMessage({
          id: assistantId,
          status: 'error'
        })
      }

      this.updateConversation(conversation.id, (conversation) => ({
        ...conversation,
        status: 'completed' // end ?  : 'interrupted'
      }))

      return verboseContent

      // const streamResults = await graph.stream(
      //   inputState
      //     ? {
      //         ...inputState,
      //         role: this.copilot.rolePrompt(),
      //         language: this.copilot.languagePrompt()
      //       }
      //     : null,
      //   {
      //     configurable: {
      //       thread_id: conversation.id
      //     },
      //     recursionLimit: this.aiOptions.recursionLimit ?? AgentRecursionLimit,
      //     signal: abortController.signal
      //   }
      // )

      // let verboseContent = ''
      // let end = false
      // try {
      //   for await (const output of streamResults) {
      //     if (!output?.__end__) {
      //       const message = {data: null} as NgmCopilotChatMessage
      //       let content = ''
      //       Object.entries(output).forEach(
      //         ([key, value]: [
      //           string,
      //           {
      //             messages?: HumanMessage[]
      //             next?: string
      //             instructions?: string
      //             reasoning?: string
      //           }
      //         ]) => {
      //           content += content ? '\n' : ''
      //           // Prioritize Routes
      //           if (value.next) {
      //             if (value.next === 'FINISH' || value.next === END) {
      //               end = true
      //             } else {
      //               // message.templateRef = this.routeTemplate
      //               message.data = {
      //                 type: MessageDataType.Route,
      //                 data: {
      //                   next: value.next,
      //                   instructions: value.instructions,
      //                   reasoning: value.reasoning
      //                 }
      //               }
      //               content +=
      //                 `<b>${key}</b>` +
      //                 '\n\n<b>' +
      //                 this.#translate.instant('Copilot.Invoke', { Default: 'Invoke' }) +
      //                 `</b>: ${value.next}` +
      //                 '\n\n<b>' +
      //                 this.#translate.instant('Copilot.Instructions', { Default: 'Instructions' }) +
      //                 `</b>: ${value.instructions || ''}` +
      //                 '\n\n<b>' +
      //                 this.#translate.instant('Copilot.Reasoning', { Default: 'Reasoning' }) +
      //                 `</b>: ${value.reasoning || ''}`
      //             }
      //           } else if (value.messages) {
      //             const _message = value.messages[0]
      //             if (isAIMessage(_message)) {
      //               if (_message.tool_calls?.length > 0) {
      //                 message.data = {
      //                   type: MessageDataType.ToolsCall,
      //                   data: _message.tool_calls.map(({name, args, id}) => ({name, args: JSON.stringify(args), id}))
      //                 }
      //               } else if (_message.content) {
      //                 if (this.verbose()) {
      //                   content += `<b>${key}</b>\n`
      //                 }
      //                 content += value.messages.map((m) => m.content).join('\n\n')
      //               }
      //             }
      //           }
      //         }
      //       )

      //       if (content) {
      //         if (this.verbose()) {
      //           if (verboseContent) {
      //             verboseContent += '\n\n<br>'
      //           }
      //           verboseContent += '✨ ' + content
      //         } else {
      //           verboseContent = content
      //         }
      //       }
      //       if (content || message.data) {
      //         this.upsertMessage({
      //           ...message,
      //           id: assistantId,
      //           role: CopilotChatMessageRoleEnum.Assistant,
      //           status: 'thinking',
      //           content: verboseContent
      //         })
      //       }
      //       if (abort()) {
      //         break
      //       }
      //     }
      //   }
      // } catch (err: any) {
      //   if (err instanceof ToolInputParsingException) {
      //     this.#logger.error(err.message, err.output)
      //     throw err
      //   } else if (err instanceof GraphValueError) {
      //     end = true
      //   } else {
      //     throw err
      //   }
      // }

      // this.updateConversation(conversation.id, (conversation) => ({
      //   ...conversation,
      //   status: end ? 'completed' : 'interrupted'
      // }))

      // const lastMessage = this.getMessage(assistantId)
      // if (lastMessage.content || lastMessage.data) {
      //   this.upsertMessage({
      //     id: assistantId,
      //     role: CopilotChatMessageRoleEnum.Assistant,
      //     status: end ? 'done' : 'pending'
      //   })
      // } else {
      //   this.deleteMessage(assistantId)
      // }

      // return lastMessage.content
    } catch (err: any) {
      console.error(err)
      this.upsertMessage({
        id: assistantId,
        role: CopilotChatMessageRoleEnum.Assistant,
        status: 'error',
        error: err.message
      })

      this.updateConversation(this.currentConversationId(), (conversation) => ({
        ...conversation,
        status: 'error'
      }))

      throw err
    } finally {
      abortController.signal.removeEventListener('abort', removeMessageWhenAbort)
    }
  }

  async continue(conversation: CopilotChatConversation) {
    await this.triggerGraphAgent(null, conversation, conversation.command)
  }

  async finish(conversation: CopilotChatConversation) {
    this.updateConversation(conversation.id, (conversation) => ({
      ...conversation,
      status: 'completed'
    }))
  }

  /**
   * Create graph for command
   *
   * @param command
   * @param interactive
   * @returns CompiledStateGraph
   */
  private async createCommandGraph(command: CopilotCommand, interactive?: boolean) {
    const options = { checkpointer: this.checkpointSaver, interruptBefore: null, interruptAfter: null }
    if (interactive ?? this.agentConfig$().interactive) {
      options.interruptBefore = command.agent.interruptBefore
      options.interruptAfter = command.agent.interruptAfter
    }

    const _graph = await command.createGraph({ ...options, llm: this.llm(), }) // secondaryChatModel: this.secondaryLLM() })
    if (_graph instanceof StateGraph) {
      return _graph.compile(options)
    } else {
      return _graph
    }
  }

  private async upsertUserInputMessage(command: CopilotCommand, content: string, context: CopilotContext) {
    const messages: NgmCopilotChatMessage[] = []
    let systemPrompt = ''
    let contextContent = null
    try {
      contextContent = context ? await recognizeContext(content, context) : null
      const params = await recognizeContextParams(content, context)
      if (contextContent) {
        this.updateLastConversation((conversation) => ({
          ...conversation,
          context: contextContent
        }))
      }

      // Get System prompt
      if (command.systemPrompt) {
        systemPrompt = await command.systemPrompt({ params })
      }

      messages.push({
        id: nanoid(),
        role: CopilotChatMessageRoleEnum.User,
        content: content,
        command: command.name,
        lcMessage: new HumanMessage({ content })
      })

      return { systemPrompt, contextContent }
    } catch (err: any) {
      messages.push({
        id: nanoid(),
        role: CopilotChatMessageRoleEnum.User,
        content: content,
        command: command.name,
        error: err.message
      })
      return { systemPrompt, contextContent, error: err }
    } finally {
      this.upsertMessage(...messages)
    }
  }

  generateId() {
    return nanoid()
  }

  newConversation(value: Partial<CopilotChatConversation>) {
    const conversation = this.#newConversation(value)
    this.#conversationId.set(conversation.id)
    this.conversations$.update((conversations) => [...conversations, conversation])
  }

  #newConversation(value: Partial<CopilotChatConversation>): CopilotChatConversation {
    return {
      ...value,
      id: value.id ?? nanoid(),
      messages: value.messages ?? []
    } as CopilotChatConversation
  }

  upsertConversation(value: Partial<CopilotChatConversation>) {
    const conversations = this.conversations$()
    const lastConversation = conversations[conversations.length - 1]
    if (lastConversation?.type) {
      // Don't create new conversation only if two types are the same 'free'
      if (!(value.type === 'free' && lastConversation.type === 'free')) {
        this.newConversation(value)
      }
    } else {
      this.updateLastConversation((conversation) => ({
        ...(conversation ?? this.#newConversation(value)),
        ...value,
        id: value.id ?? conversation?.id ?? nanoid()
      }))
    }
  }

  clear() {
    this.conversations$.set([])
  }

  updateConversations(fn: (conversations: Array<CopilotChatConversation>) => Array<CopilotChatConversation>): void {
    this.conversations$.update(fn)
  }

  updateConversation(id: string, fn: (conversation: CopilotChatConversation) => CopilotChatConversation): void {
    this.conversations$.update((conversations) => {
      const index = conversations.findIndex((conversation) => conversation.id === id)
      if (index > -1) {
        conversations[index] = fn(conversations[index])
      }
      return compact(conversations)
    })
  }

  updateLastConversation(fn: (conversations: CopilotChatConversation) => CopilotChatConversation): void {
    this.conversations$.update((conversations) => {
      const lastIndex = conversations.length - 1 < 0 ? 0 : conversations.length - 1
      const lastConversation = conversations[lastIndex]
      conversations[lastIndex] = fn(lastConversation)
      return compact(conversations)
    })
  }

  updateConversationState(id: string, value: Record<string, any>) {
    const conversation = this.conversations().find((conversation) => conversation.id === id)
    if (conversation.graph) {
      conversation.graph.updateState(
        {
          configurable: {
            thread_id: id
          }
        },
        value
      )
    }
  }

  /**
   * Get message by id from current conversation
   *
   * @param id
   */
  getMessage(id: string) {
    return this.currentConversation()?.messages.find((message) => message.id === id)
  }

  /**
   * Update or insert message in last conversation
   *
   * @param messages
   */
  upsertMessage(...messages: Partial<NgmCopilotChatMessage>[]) {
    this.conversations$.update((conversations) => {
      const lastConversation = conversations[conversations.length - 1]
      const lastMessages = lastConversation.messages
      messages.forEach((message) => {
        const index = lastMessages.findIndex((item) => item.id === message.id)
        if (index > -1) {
          lastMessages[index] = { ...lastMessages[index], ...message }
        } else {
          lastMessages.push(message as CopilotChatMessage)
        }
      })
      return [
        ...conversations.slice(0, conversations.length - 1),
        {
          ...lastConversation,
          messages: lastMessages
        }
      ]
    })
  }

  /**
   * Remove message from conversation, then remove the conversation if it has been empty
   *
   * @param message Message or message id
   */
  deleteMessage(message: CopilotChatMessage | string) {
    const messageId = typeof message === 'string' ? message : message.id
    this.conversations$.update((conversations) => {
      const _conversations = []
      conversations.forEach((conversation) => {
        const index = conversation.messages.findIndex((item) => item.id === messageId)
        if (index > -1) {
          const messages = conversation.messages.filter((item) => item.id !== messageId)
          if (messages.length) {
            _conversations.push({ ...conversation, messages })
          }
        } else {
          _conversations.push(conversation)
        }
      })
      return _conversations
    })
  }

  stopMessage(id: string) {
    this.updateLastConversation((conversation) => {
      const message = conversation.messages.find((m) => m.id === id)
      if (message) {
        message.status = 'done'
      }
      return conversation
    })
  }

  async dropCopilot(event: CdkDragDrop<any[], any[], any>) {
    const dropActions = this.#dropActions()
    if (dropActions[event.previousContainer.id]) {
      const dropMessage = await dropActions[event.previousContainer.id].implementation(event, this)
      const messages = Array.isArray(dropMessage) ? dropMessage : [dropMessage]

      const currentConversation = this.currentConversation()
      const currentCommand = this.currentCommand()
      if (!currentConversation || (currentConversation.type === 'command' && !currentCommand?.agent?.conversation)) {
        this.newConversation({})
      }

      this.upsertMessage(
        ...messages.map((message) => ({ ...message, lcMessage: new HumanMessage({ content: message.content }) }))
      )
    }
  }

  async executeCommandSuggestion(
    input: string,
    options: { command: CopilotCommand; context: CopilotContext; signal?: AbortSignal }
  ): Promise<SuggestionOutput> {
    const { command, signal } = options

    if (command.fewShotPrompt) {
      input = await command.fewShotPrompt.format({ input })
    }

    try {
      const llm = this.llm()
      // const secondaryLLM = this.secondaryLLM()
      const verbose = this.verbose()
      if (llm) {
        if (command.suggestion?.promptTemplate) {
          const chain = command.suggestion.promptTemplate.pipe((llm).bindTools([SuggestionOutputTool]))
            .pipe(new StringOutputParser())
          return await chain.invoke({
            input,
            role: this.copilot.rolePrompt(),
            language: this.copilot.languagePrompt(),
            signal,
            verbose
          })
        } else {
          throw new Error('No completion template found')
        }
      } else {
        throw new Error('LLM is not available')
      }
    } catch (err: any) {
      throw new Error('Error: ' + err.message)
    }
  }

  stopConversation() {
    if (this.currentConversation().abortController && !this.currentConversation().abortController.signal.aborted) {
      this.currentConversation().abortController.abort()
    }
  }
}
