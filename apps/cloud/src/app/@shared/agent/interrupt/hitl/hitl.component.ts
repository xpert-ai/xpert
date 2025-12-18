import { CommonModule } from '@angular/common'
import { Component, computed, effect, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { injectI18nService } from '@cloud/app/@shared/i18n'
import { attrModel, NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { AbstractInterruptComponent } from '../../types'

export type DecisionType = 'approve' | 'reject' | 'edit'
/**
 * Represents an action request with a name, arguments, and description.
 */
export interface ActionRequest {
  /**
   * The name of the action being requested.
   */
  name: string
  /**
   * Key-value pairs of arguments needed for the action (e.g., {"a": 1, "b": 2}).
   */
  args: Record<string, any>
  /**
   * The description of the action to be reviewed.
   */
  description?: string
}

/**
 * Policy for reviewing a HITL request.
 */
export interface ReviewConfig {
  /**
   * Name of the action associated with this review configuration.
   */
  actionName: string
  /**
   * The decisions that are allowed for this request.
   */
  allowedDecisions: DecisionType[]
  /**
   * JSON schema for the arguments associated with the action, if edits are allowed.
   */
  argsSchema?: Record<string, any>
}

export interface HITLRequest {
  /**
   * A list of agent actions for human review.
   */
  actionRequests?: ActionRequest[]
  /**
   * Review configuration for all possible actions.
   */
  reviewConfigs?: ReviewConfig[]
}

/**
 * Represents an action with a name and arguments.
 */
export interface Action {
  /**
   * The type or name of action being requested (e.g., "add_numbers").
   */
  name: string
  /**
   * Key-value pairs of arguments needed for the action (e.g., {"a": 1, "b": 2}).
   */
  args: Record<string, any>
}

export type Decision =
  | { type: 'approve' }
  | { type: 'reject'; message?: string }
  | { type: 'edit'; editedAction: Action }

export interface HITLResponse {
  decisions?: Decision[]
}

/**
 * Human-in-the-Loop (HITL) Interrupt Component
 * 
 * The event data structure for an interrupt event looks like this:
 * ```json
{
  "type": "event",
  "event": "on_interrupt",
  "data": {
    "tasks": [
      {
        "id": "e9c2dc37-9d8e-5c8b-bc7b-78f71eafad6c",
        "name": "Middleware_cSWoPhmYvm_after_model",
        "path": ["__pregel_pull", "Middleware_cSWoPhmYvm_after_model"],
        "interrupts": [
          {
            "id": "90e686dba96895ab5c6bd94c1717c0f2",
            "value": {
              "actionRequests": [
                {
                  "name": "tavily_search",
                  "args": { "query": "南京今天天气" },
                  "description": "Tool execution requires approval\n\nTool: tavily_search\nArgs: {\n  \"query\": \"南京今天天气\"\n}"
                }
              ],
              "reviewConfigs": [{ "actionName": "tavily_search", "allowedDecisions": ["approve", "edit", "reject"] }]
            }
          }
        ]
      }
    ]
  }
}
 */
@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, NgmI18nPipe],
  selector: 'xp-agent-interrupt-hitl',
  templateUrl: 'hitl.component.html',
  styleUrls: ['hitl.component.scss']
})
export class XpAgentInterruptHitlComponent extends AbstractInterruptComponent<HITLRequest, HITLResponse> {
  readonly i18nService = injectI18nService()

  readonly request = computed(() => this.message() as HITLRequest)
  readonly actions = computed(() => this.request()?.actionRequests ?? [])
  readonly configs = computed(() => this.request()?.reviewConfigs ?? [])

  readonly decisions = attrModel(this.value, 'decisions')
  readonly editedActions = signal<Action[]>([])
  readonly argsText = signal<string[]>([])
  readonly parseErrors = signal<(string | null)[]>([])

  constructor() {
    super()

    effect(() => console.log(this.value()))

    effect(() => {
      const actions = this.actions()
      if (!actions?.length) {
        return
      }

      const newArgsText = actions.map((action) => JSON.stringify(action.args ?? {}, null, 2))
      const defaults = actions.map((action, index) =>
        this.createDecision(this.defaultDecisionType(action), index, action)
      )
      const edits = actions.map((action) => ({ name: action.name, args: { ...(action.args ?? {}) } }))

      this.argsText.set(newArgsText)
      this.decisions.set(defaults)
      this.editedActions.set(edits)
      this.parseErrors.set(actions.map(() => null))
      this.value.set({ decisions: defaults })
    }, { allowSignalWrites: true })

    effect(() => {
      const decisions = this.decisions()
      if (decisions?.length) {
        this.value.set({ decisions })
      }
    }, { allowSignalWrites: true })
  }

  decisionFor(index: number) {
    return this.decisions()?.[index]
  }
  decisionMessageFor(index: number) {
    const decision = this.decisions()?.[index]
    if (decision?.type === 'reject') {
      return decision.message
    }
    return ''
  }

  allowedDecisions(action: ActionRequest) {
    return this.configs()?.find((config) => config.actionName === action.name)?.allowedDecisions ?? [
      'approve',
      'edit',
      'reject'
    ]
  }

  onDecisionSelect(index: number, type: DecisionType) {
    const actions = this.actions()
    if (!actions?.length || !actions[index]) return

    const next = [...this.decisions()]
    next[index] = this.createDecision(type, index, actions[index])
    this.decisions.set(next)
  }

  onActionNameChange(index: number, value: string) {
    const edits = [...this.editedActions()]
    if (!edits[index]) return
    edits[index] = { ...edits[index], name: value }
    this.editedActions.set(edits)

    if (this.decisions()?.[index]?.type === 'edit') {
      this.replaceDecision(index, { ...edits[index] })
    }
  }

  onArgsChange(index: number, text: string) {
    const argsText = [...this.argsText()]
    argsText[index] = text
    this.argsText.set(argsText)

    const errors = [...this.parseErrors()]
    try {
      const parsed = text ? JSON.parse(text) : {}
      errors[index] = null
      this.parseErrors.set(errors)

      const edits = [...this.editedActions()]
      edits[index] = { ...(edits[index] ?? { name: this.actions()[index]?.name }), args: parsed }
      this.editedActions.set(edits)
      if (this.decisions()[index]?.type === 'edit') {
        this.replaceDecision(index, { ...edits[index] })
      }
    } catch (err) {
      errors[index] = (err as Error).message || 'Invalid JSON'
      this.parseErrors.set(errors)
    }
  }

  onRejectMessageChange(index: number, message: string) {
    const next = [...this.decisions()]
    const decision = next[index]
    if (decision?.type === 'reject') {
      next[index] = { ...decision, message }
      this.decisions.set(next)
    }
  }

  private replaceDecision(index: number, editedAction: Action) {
    const next = [...this.decisions()]
    next[index] = { type: 'edit', editedAction }
    this.decisions.set(next)
  }

  private defaultDecisionType(action: ActionRequest): DecisionType {
    const allowed = this.allowedDecisions(action)
    if (allowed.includes('approve')) {
      return 'approve'
    }
    return allowed[0] ?? 'approve'
  }

  private createDecision(type: DecisionType, index: number, action: ActionRequest): Decision {
    switch (type) {
      case 'approve':
        return { type: 'approve' }
      case 'reject':
        return { type: 'reject' }
      case 'edit': {
        const editedAction = this.editedActions()[index] ?? { name: action.name, args: { ...(action.args ?? {}) } }
        return { type: 'edit', editedAction }
      }
      default:
        return { type: 'approve' }
    }
  }
}
