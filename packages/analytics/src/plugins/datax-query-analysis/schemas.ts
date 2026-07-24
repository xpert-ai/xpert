import { z } from 'zod'

export const DataXQueryModelContextSchema = z.object({
	modelId: z.string().trim().min(1).optional().describe('Optional semantic model id.'),
	search: z.string().trim().max(200).optional().describe('Optional model search text.')
})

export const DataXQueryExecuteSchema = z.object({
	modelId: z.string().trim().min(1).describe('Semantic model id used to execute the query.'),
	cubeName: z.string().trim().min(1).describe('Cube referenced by the MDX statement.'),
	statement: z.string().trim().min(1).max(50000).describe('MDX SELECT statement to execute.'),
	limit: z
		.number()
		.int()
		.min(1)
		.max(500)
		.default(200)
		.describe('Maximum number of rows returned to ChatKit and the Workbench.'),
	openWorkbench: z
		.boolean()
		.default(true)
		.describe('Open the query result Workbench view with the same model, cube, and statement.')
})

export const DataXQueryOpenSchema = z.object({
	modelId: z.string().trim().min(1).optional().describe('Optional semantic model id to preselect.'),
	cubeName: z.string().trim().min(1).optional().describe('Optional cube to preselect.'),
	statement: z.string().trim().max(50000).optional().describe('Optional MDX statement to prefill.'),
	autoRun: z.boolean().default(false).describe('Execute the supplied statement when the Workbench opens.')
})

export type DataXQueryExecuteInput = z.infer<typeof DataXQueryExecuteSchema>
