import { Injectable, OnDestroy, inject, signal } from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { ActivatedRoute } from '@angular/router'
import { AIOptions, CopilotChatConversation, CopilotChatMessage } from '@xpert-ai/copilot'
import { nonBlank } from '@xpert-ai/core'
import { ComponentSubStore } from '@xpert-ai/store'
import { distinctUntilChanged, filter, map, startWith } from 'rxjs'
import { ModelQueryState } from '../../types'
import { QueryLabService, QueryLabState } from '../query-lab.service'

@Injectable()
export class QueryService extends ComponentSubStore<ModelQueryState, QueryLabState> implements OnDestroy {
  private readonly route = inject(ActivatedRoute)
  readonly #queryLabService = inject(QueryLabService)

  initialized = signal(false)
  conversations = toSignal(this.select((state) => state?.query?.conversations))

  private queryKeySub = this.route.paramMap
    .pipe(
      startWith(this.route.snapshot.paramMap),
      map((paramMap) => paramMap.get('id')),
      filter(nonBlank),
      map(decodeURIComponent),
      distinctUntilChanged(),
      takeUntilDestroyed()
    )
    .subscribe((key) => this.init(key))

  constructor() {
    super({} as ModelQueryState)
  }

  public init(key: string) {
    this.connect(this.#queryLabService, { parent: ['queries', key] }).subscribe(() => {
      this.initialized.set(true)
    })
  }

  setConversations = this.updater((state, conversations: Array<CopilotChatConversation>) => {
    state.query.conversations = conversations
  })
  setAIOptions = this.updater((state, options: AIOptions) => {
    state.query.aiOptions = options
  })

  ngOnDestroy(): void {
    super.onDestroy()
  }
}
