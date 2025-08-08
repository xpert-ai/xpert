import { ChecklistItem, RuleValidator } from '@metad/contracts'
import { PropertyHierarchy, Schema } from '@metad/ocap-core'
import { LevelValidator } from './level';

export class HierarchyValidator implements RuleValidator {
    async validate(hierarchy: PropertyHierarchy, params: { schema: Schema; dimensionName: string }): Promise<ChecklistItem[]> {
        const issues: ChecklistItem[] = []

        if (!hierarchy.levels?.length) {
            issues.push({
                ruleCode: 'HIERARCHY_LEVELS_REQUIRED',
                field: 'levels',
                value: hierarchy.name,
                message: {
                    en_US: `Hierarchy must have at least one level`,
                    zh_Hans: '层次结构必须至少有一个层级'
                },
                level: 'error'
            })
        } else {
            for await (const level of hierarchy.levels || []) {
                const results = await new LevelValidator().validate(level, { schema: params.schema })
                issues.push(...results)
            }
        }

        return issues
    }
}
