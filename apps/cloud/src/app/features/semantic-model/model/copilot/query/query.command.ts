import { Signal, WritableSignal, computed, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { CopilotAgentType, createAgentStepsInstructions } from '@metad/copilot'
import { createAgentPromptTemplate, injectCopilotCommand } from '@metad/copilot-angular'
import {
  PROMPT_RETRIEVE_DIMENSION_MEMBER,
  injectDimensionMemberRetrieverTool,
  makeCubeRulesPrompt,
  markdownEntityType
} from '@metad/core'
import { EntityType } from '@metad/ocap-core'
import { serializeName } from '@metad/ocap-sql'
import { TranslateService } from '@ngx-translate/core'
import { injectAgentFewShotTemplate } from '../../../../../@core/copilot'
import { NGXLogger } from 'ngx-logger'

import { ModelEntityService } from '../../entity/entity.service'
import { SemanticModelService } from '../../model.service'
import { injectSelectTablesTool } from '../tools'
import { injectCreateQueryTool, injectQueryTablesTool } from './tools'

export function injectQueryCommand(
  statement: WritableSignal<string>,
  context: Signal<{
    dialect: string
    isMDX: boolean
    entityTypes: EntityType[]
  }>,
  callback: (query: string) => Promise<any>
) {
  const logger = inject(NGXLogger)
  const translate = inject(TranslateService)
  const modelService = inject(SemanticModelService)
  const entityService = inject(ModelEntityService, { optional: true })

  const selectTablesTool = injectSelectTablesTool()
  const queryTablesTool = injectQueryTablesTool()
  const createQueryTool = injectCreateQueryTool(statement, callback)

  let memberRetrieverTool: DynamicStructuredTool = null
  if (entityService) {
    const defaultModel = toSignal(modelService.modelId$)
    const defaultEntity = toSignal(entityService.entityName$)
    memberRetrieverTool = injectDimensionMemberRetrieverTool(defaultModel, defaultEntity)
  }

  const isMDX = computed(() => context().isMDX)

  // Table info
  const promptTables = computed(() => {
    const { isMDX, entityTypes } = context()
    return entityTypes?.map((entityType) => {
      return `${isMDX ? 'Cube' : 'Table'} name: "${entityType.name}",
  caption: "${entityType.caption || ''}",
  ${isMDX ? 'dimensions and measures' : 'columns'} : [${Object.keys(entityType.properties)
    .map(
      (key) =>
        `${serializeName(key, entityType.dialect)} ${entityType.properties[key].dataType}` +
        (entityType.properties[key].caption ? ` ${entityType.properties[key].caption}` : '')
    )
    .join(', ')}]`
    })
  })
  const promptCubes = computed(() => {
    const { entityTypes } = context()
    return entityTypes?.map((entityType) => {
      return `- Cube [${entityType.name}]
  ${markdownEntityType(entityType)}
`
    })
  })
  const dbTablesPrompt = computed(() => {
    const { isMDX, entityTypes } = context()
    const _promptTables = promptTables()
    const _promptCubes = promptCubes()

    return isMDX
      ? `The source dialect is '${entityTypes[0]?.dialect}', the cubes information are \n${_promptCubes?.join('\n\n')}`
      : `The database dialect is '${entityTypes[0]?.dialect}', the tables information are \n${_promptTables?.join('\n\n')}`
  })

  const systemContext = async () => {
    const { dialect, isMDX, entityTypes } = context()

    let prompt = ''
    if (isMDX) {
      prompt +=
        `Assuming you are an expert in MDX programming, provide a prompt if the system does not offer information on the cubes.` +
        makeCubeRulesPrompt() +
        `The cube information is:` +
        dbTablesPrompt() +
        ` Please provide the corresponding MDX statement for the given question.`
      if (statement()) {
        prompt += `Current mdx statement: 
${statement()}
`
      }
    } else {
      prompt +=
        `Assuming you are an expert in SQL programming, provide a prompt if the system does not offer information on the database tables.` +
        ` The table information is:

${dbTablesPrompt()}

Please provide the corresponding SQL statement for the given question.
Note: Table fields are case-sensitive and should be enclosed in double quotation marks.`
      if (statement()) {
        prompt += `\nCurrent sql statement:
${statement()}
`
      }
    }

    return prompt
  }

  const tools: any[] = [selectTablesTool, queryTablesTool, createQueryTool]
  if (memberRetrieverTool) {
    tools.push(memberRetrieverTool)
  }

  const commandName = 'query'
  const fewShotPrompt = injectAgentFewShotTemplate(commandName)

  return injectCopilotCommand(
    commandName,
    (async () => {
      let _prompt = `You are a cube modeling expert. Let's all 'createQuery' tool with a query statement to query data!` +
                      `\n{role}\n`
      if (isMDX()) {
        _prompt += createAgentStepsInstructions(
          PROMPT_RETRIEVE_DIMENSION_MEMBER,
          `根据用户输入的逻辑和获取到的维度成员信息创建一个 MDX 查询语句。`,
          `最终调用 "createQuery" 工具来执行查询语句。`,
          `得到查询结果后如果有错误则重新修正查询语句，直到得到正确的查询结果。`
        )
      } else {
        _prompt += ` If the user does not provide a table, use 'selectTables' tool to get the table, and then select a table related to the requirement to query.` +
              ` If the user does not provide the table field information, use the 'queryTables' tool to obtain the table field structure.`
      }

      const prompt = await createAgentPromptTemplate(_prompt + `\n{context}\n` + `{system}`).partial({
        system: systemContext,
      })

      return {
        alias: 'q',
        description: translate.instant('PAC.MODEL.Copilot.Examples.QueryDBDesc', {
          Default: 'Describe the data you want to query'
        }),
        agent: {
          type: CopilotAgentType.Default,
          conversation: true
        },
        tools,
        fewShotPrompt,
        prompt
      }
    })()
  )
}
