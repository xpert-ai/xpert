import { ChecklistItem, RuleValidator } from '@metad/contracts'
import { PropertyLevel, Schema } from '@metad/ocap-core'

export class LevelValidator implements RuleValidator {
    async validate(level: PropertyLevel, params: { schema: Schema; }): Promise<ChecklistItem[]> {
        const issues: ChecklistItem[] = []

        if (!level.name) {
            issues.push({
                ruleCode: 'LEVEL_NAME_REQUIRED',
                field: 'name',
                value: level.name,
                message: {
                    en_US: `Level Name is required`,
                    zh_Hans: '层级名称是必需的'
                },
                level: 'error'
            })
        }
        if (!level.column && !level.keyExpression) {
            issues.push({
                field: 'column',
                value: level.column,
                message: {
                    en_US: 'Level `column` or `keyExpression` is required',
                    zh_Hans: '层级“表字段”或“键表达式”是必需的'
                },
                level: 'error',
                ruleCode: 'LEVEL_COLUMN_REQUIRED'
            })
        }
        
        return issues
    }
}
