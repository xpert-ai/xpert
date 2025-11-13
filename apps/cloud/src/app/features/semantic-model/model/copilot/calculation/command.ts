import { Signal, inject } from '@angular/core'
import { CopilotAgentType } from '@metad/copilot'
import { injectCopilotCommand } from '@metad/copilot-angular'
import { CalculatedMember } from '@metad/ocap-core'
import { TranslateService } from '@ngx-translate/core'
import { injectAgentFewShotTemplate } from 'apps/cloud/src/app/@core/copilot'
import { NGXLogger } from 'ngx-logger'
import { injectCreateCalculatedMeasure, injectEditFormulaAgent } from './graph'

export const COPILOT_COMMAND_FORMULA_NAME = 'formula'
export const COPILOT_COMMAND_CALCULATED_NAME = 'calculated'

/**
 * @deprecated use Chatkit
 */
export function injectCalculatedCommand() {
  const logger = inject(NGXLogger)
  const translate = inject(TranslateService)

  const fewShotPrompt = injectAgentFewShotTemplate(COPILOT_COMMAND_FORMULA_NAME, { k: 1, vectorStore: null })
  const createCalculatedMeasure = injectCreateCalculatedMeasure()

  return injectCopilotCommand(COPILOT_COMMAND_CALCULATED_NAME, {
    alias: 'calc',
    description: translate.instant('PAC.MODEL.Copilot.CommandCalculatedDesc', {
      Default: 'Descripe business logic of the calculated member'
    }),
    agent: {
      type: CopilotAgentType.Graph,
      conversation: true
    },
    fewShotPrompt,
    createGraph: createCalculatedMeasure
  })
}

/**
 * @deprecated use Chatkit
 */
export function injectFormulaCommand(calculatedMember: Signal<CalculatedMember>) {
  const logger = inject(NGXLogger)
  const translate = inject(TranslateService)

  const createEditFormulaAgent = injectEditFormulaAgent(calculatedMember)

  const fewShotPrompt = injectAgentFewShotTemplate(COPILOT_COMMAND_FORMULA_NAME, { k: 1, vectorStore: null })
  return injectCopilotCommand(COPILOT_COMMAND_FORMULA_NAME, {
    alias: 'f',
    description: translate.instant('PAC.MODEL.Copilot.CommandFormulaDesc', {
      Default: 'Descripe business logic of the formula of calculated measure'
    }),
    agent: {
      type: CopilotAgentType.Graph,
      conversation: true
    },
    fewShotPrompt,
    createGraph: createEditFormulaAgent
  })
}
