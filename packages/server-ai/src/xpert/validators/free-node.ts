import { ChecklistItem, RuleValidator, TXpertTeamDraft, WorkflowNodeTypeEnum } from '@metad/contracts'
import { groupBy } from 'lodash'

export class FreeNodeValidator implements RuleValidator {
	async validate(draft: TXpertTeamDraft): Promise<ChecklistItem[]> {
		const issues: ChecklistItem[] = []

		if (draft.nodes?.length > 1) {
			// Check all nodes have been connected
			draft.nodes
				.filter((_) => !(_.type === 'workflow' && _.entity.type === WorkflowNodeTypeEnum.NOTE))
				.forEach((node) => {
					if (
						!draft.connections.some(
							(connection) => connection.from?.startsWith(node.key) || connection.to === node.key
						)
					) {
						issues.push({
							node: node.key,
							ruleCode: 'FREE_NODE_NOT_CONNECTED',
							field: 'node',
							value: node.key,
							message: {
								en_US: `Node "${node.key}" is not connected to any other node`,
								zh_Hans: `节点 "${node.key}" 没有连接到任何其他节点`
							},
							level: 'error'
						})
					}
				})
			const nameGroups = groupBy(
				draft.nodes.filter((_) => _.type !== 'workflow' && _.entity.name).map(({ entity }) => entity),
				'name'
			)
			const names = Object.entries(nameGroups)
				.map(([name, nodes]) => [name, nodes.length])
				.filter(([, length]: [string, number]) => length > 1)
			if (names.length) {
				issues.push({
					ruleCode: 'NODE_DUPLICATE_NAME',
					field: 'node',
					value: names.map(([name]) => name).join(', '),
					message: {
						en_US: `There are the following duplicate names: ${names.map(([name]) => name).join(', ')}`,
						zh_Hans: `存在以下重复名称：${names.map(([name]) => name).join(', ')}`
					},
					level: 'error'
				})
			}
		}
		return issues
	}
}
