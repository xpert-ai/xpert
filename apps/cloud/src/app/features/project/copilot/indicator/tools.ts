import { inject, NgZone } from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { Indicator } from '@metad/cloud/state'
import { IndicatorFormulaSchema, IndicatorSchema, markdownEntityType } from '@metad/core'
import { NgmDSCoreService } from '@metad/ocap-angular/core'
import { EntitySelectDataType, EntitySelectResultType, NgmEntityDialogComponent } from '@metad/ocap-angular/entity'
import { uuid } from 'apps/cloud/src/app/@core'
import { NGXLogger } from 'ngx-logger'
import { firstValueFrom } from 'rxjs'
import z from 'zod'
import { ProjectService } from '../../project.service'

import { ZardDialogService } from '@xpert-ai/headless-ui'
export function injectCreateIndicatorTool() {
  const logger = inject(NGXLogger)
  const router = inject(Router)
  const route = inject(ActivatedRoute)
  const zone = inject(NgZone)
  const projectService = inject(ProjectService)

  const businessAreas = projectService.businessAreas

  const createIndicatorTool = new DynamicStructuredTool({
    name: 'createIndicator',
    description: 'Create new or edit indicator.',
    schema: IndicatorSchema,
    func: async (indicator) => {
      logger.debug(`Execute copilot action 'createIndicator':`, indicator)

      indicator.id ||= uuid()
      if (indicator.calendar) {
        const [hierarchy, level] = indicator.calendar.split('].[')
        indicator.calendar = level ? `${hierarchy}]` : indicator.calendar
      }
      projectService.upsertIndicator({
        ...indicator,
        filters: [...(indicator.variables ?? []), ...(indicator.filters ?? [])],
        visible: true,
        isActive: true,
        businessArea: businessAreas().find((item) => item.id === indicator.businessAreaId),
        createdAt: new Date(),
      } as Indicator)

      zone.run(async () => {
        await router.navigate(['indicators', indicator.id], {
          relativeTo: route
        })
      })

      return `Created indicator with id '${indicator.id}'!`
    }
  })

  return createIndicatorTool
}

export function injectCreateFormulaTool() {
  const logger = inject(NGXLogger)
  const router = inject(Router)
  const route = inject(ActivatedRoute)
  const projectService = inject(ProjectService)

  const createFormulaTool = new DynamicStructuredTool({
    name: 'createFormula',
    description: 'Create formula for the indicator.',
    schema: IndicatorFormulaSchema,
    func: async ({ formula, unit }) => {
      logger.debug(`Execute copilot action 'reviseFormula':`, `formula:`, formula, `unit:`, unit)

      // todo: validate formula

      return `The formula "${formula}" and unit "${unit || ''}" for indicator is valid!`
    }
  })

  return createFormulaTool
}

/**
 * Select default cube
 * 
 */
export function injectPickCubeTool() {
  const logger = inject(NGXLogger)
  const projectService = inject(ProjectService)
  const dsCoreService = inject(NgmDSCoreService)
  const _dialog = inject(ZardDialogService)

  const pickCubeTool = new DynamicStructuredTool({
    name: 'pickCube',
    description: 'Pick a cube.',
    schema: z.object({}),
    func: async () => {
      logger.debug(`Execute copilot action 'pickCube'`)

      const dataSources = projectService.dataSources()
      const result = await firstValueFrom<EntitySelectResultType>(
        _dialog
          .open<NgmEntityDialogComponent, EntitySelectDataType, EntitySelectResultType>(NgmEntityDialogComponent, {
            data: {
              dataSources,
              dsCoreService: dsCoreService,
              registerModel: projectService.registerModel.bind(projectService)
            }
          })
          .afterClosed()
      )

      const cube = result?.entities[0]
      if (result?.dataSource && cube) {
        const entityType = await firstValueFrom(projectService.selectEntityType(result.dataSource, cube))
        return `Use model id: '${result.modelId}' and cube: '${cube}'\n` + markdownEntityType(entityType)
      }

      return ''
    }
  })

  return pickCubeTool
}
