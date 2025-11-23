import { DestroyRef, Injectable, InjectionToken, computed, inject, signal } from '@angular/core'
import { ChatOpenAI, ChatOpenAICallOptions } from '@langchain/openai'
import {
  CopilotCommand,
  CopilotContext,
  CopilotContextItem,
  CopilotContextParam,
} from '@metad/copilot'
import { AgentExecutor } from 'langchain/agents'
import { Observable, firstValueFrom, map } from 'rxjs'
import { ISelectOption } from '../types'

/**
 * @deprecated use ChatKit instead
 */
export const NgmCopilotContextToken = new InjectionToken<NgmCopilotContextService>('NgmCopilotContextToken')

/**
 * @deprecated use ChatKit instead
 */
@Injectable()
export class NgmCopilotContextService implements CopilotContext {
  readonly destroyRef = inject(DestroyRef)
  readonly parentContext? = inject(NgmCopilotContextToken, { optional: true, skipSelf: true })

  readonly children = signal(new Set<NgmCopilotContextService>())

  // Commands
  readonly #commands = signal<
    Record<
      string,
      CopilotCommand & {
        llm?: ChatOpenAI<ChatOpenAICallOptions>
        agentExecutor?: AgentExecutor
      }
    >
  >({})

  readonly commands = computed(() => {
    const children = this.children()
    const commands = [...Object.values(this.#commands())]
    for (const child of children) {
      commands.push(...child.commands())
    }
    return commands
  })

  /**
   * Contexts
   */
  /**
   * Observable to get all cubes:
   * 
   * ```typescript
   * this.copilotContext.cubes.update(() => this.modelCubes$.pipe(shareReplay(1)))
   * ```
   */
  readonly cubes = signal<Observable<ISelectOption<{
    dataSource?: string;
    serizalize: () => Promise<string>
  }>[]>>(null)

  readonly items = computed(() =>
    this.cubes()?.pipe(
      map((cubes) =>
        cubes.map((cube) => ({
          key: cube.key,
          caption: cube.caption,
          uKey: cube.key.split(' ').join('_'),
          serizalize: cube.value.serizalize,
          value: {
            ...cube.value,
          }
        }))
      )
    )
  )

  constructor() {
    this.parentContext?.registerChild(this)

    this.destroyRef.onDestroy(() => {
      console.log('destroyed')
      this.parentContext?.unregisterChild(this)
    })
  }

  registerChild(child: NgmCopilotContextService) {
    this.children.update((children) => new Set(children.add(child)))
  }

  unregisterChild(child: NgmCopilotContextService) {
    this.children.update((children) => {
      const newChildren = new Set(children)
      newChildren.delete(child)
      return newChildren
    })
  }

  async registerCommand(name: string, command: CopilotCommand | Promise<CopilotCommand>) {
    let _command: CopilotCommand = null
    if (command instanceof Promise) {
      _command = await command
    } else {
      _command = command
    }
    this.#commands.update((state) => ({
      ...state,
      [name]: {
        ..._command,
        name
      }
    }))
  }

  unregisterCommand(name: string) {
    this.#commands.update((state) => {
      delete state[name]
      return {
        ...state
      }
    })
  }

  getContextObservable(): Observable<CopilotContextItem[]> {
    const items = this.items()
    if (items) {
      return items
    }

    const children = this.children()
    for (const child of children) {
      const childContext = child.getContextObservable()
      if (childContext) {
        return childContext
      }
    }
    return null
  }

  /**
   * Find command by name or alias
   *
   * @param name Name or alias of command
   * @returns AI Command
   */
  getCommand(name: string) {
    const { command } = this.getCommandWithContext(name) ?? {}
    return command
  }

  getCommandWithContext(name: string): { command: CopilotCommand; context: CopilotContext } | null {
    const command = this.#commands()[name] ?? Object.values(this.#commands()).find((command) => command.alias === name)
    if (command) {
      return { command, context: this }
    }

    const children = this.children()
    for (const child of children) {
      const { command, context } = child.getCommandWithContext(name) ?? {}
      if (command) {
        return { command, context }
      }
    }

    return null
  }

  async getContextItem(uKey: string) {
    const itemsObservable = this.getContextObservable()
    if (itemsObservable) {
      const items = await firstValueFrom(itemsObservable)
      return items.find((item) => item.uKey === uKey)
    }
    return null
  }
}

// 识别 prompt 中的 context 提示
export async function recognizeContext(prompt: string, context: CopilotContext) {
  const params = await recognizeContextParams(prompt, context)

  let contextContent = ''
  for(const param of params) {
    if (param.item) {
      contextContent += await param.item.serizalize()
    }
  }
  return contextContent
}

export async function recognizeContextParams(prompt: string, context: CopilotContext) {
  const params: CopilotContextParam[] = []
  const words = prompt.split(' ')
  for (const word of words) {
    if (context && word.startsWith('@')) {
      params.push({
        content: word.slice(1),
        context,
        item: await context.getContextItem(word.slice(1))
      })
    }
  }

  return params
}