import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import { parse } from 'yaml'
import { z } from 'zod'

const teamMetadata = z.object({
  team: z.object({
    name: z.string(),
    title: z.string(),
    description: z.string(),
    version: z.string(),
    features: z.object({ opener: z.object({ questions: z.array(z.string()) }) })
  })
})

export function customerIntentTemplates(): XpertTemplateContribution[] {
  return ['xpert-customer-intent', 'customer-service-assistant'].map((key) => {
    const dslContent = readFileSync(join(__dirname, 'templates', key + '.yaml'), 'utf8')
    const { team } = teamMetadata.parse(parse(dslContent))
    return {
      key,
      name: key,
      xpertName: team.name,
      title: team.title,
      description: team.description,
      category: 'Assistant',
      type: XpertTypeEnum.Agent,
      version: team.version,
      startPrompts: team.features.opener.questions,
      dslContent
    }
  })
}
