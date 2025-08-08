import { ChecklistItem, RuleValidator } from '@metad/contracts'
import { Schema, VirtualCube } from '@metad/ocap-core'

export class VirtualCubeValidator implements RuleValidator {
    async validate(cube: VirtualCube, params: { schema: Schema }): Promise<ChecklistItem[]> {
        const issues: ChecklistItem[] = []

        if (!cube.name) {
            issues.push({
                message: { en_US: 'Virtual cube name is required', zh_Hans: '虚拟立方体名称是必需的' },
                level: 'error',
                field: 'name',
                ruleCode: 'VCUBE_NAME_REQUIRED'
            })
        }

        if (!cube.cubeUsages || cube.cubeUsages.length === 0) {
            issues.push({
                message: { en_US: 'At least two cube usage is required', zh_Hans: '至少需要两个立方体' },
                level: 'error',
                field: 'cubeUsages',
                ruleCode: 'VCUBE_CUBEUSAGES_REQUIRED'
            })
        }

        // if (!cube.virtualCubeDimensions || cube.virtualCubeDimensions.length === 0) {
        //     issues.push({
        //         message: { en_US: 'At least one common dimension is required', zh_Hans: '至少需要一个共同维度' },
        //         level: 'error',
        //         field: 'virtualCubeDimensions',
        //         ruleCode: 'VCUBE_DIMENSIONS_REQUIRED'
        //     })
        // }

        if (!cube.virtualCubeMeasures || cube.virtualCubeMeasures.length === 0) {
            issues.push({
                message: { en_US: 'At least one virtual cube measure is required', zh_Hans: '至少需要一个虚拟立方体度量' },
                level: 'error',
                field: 'virtualCubeMeasures',
                ruleCode: 'VCUBE_MEASURES_REQUIRED'
            })
        }

        // Check calculated members
        if (cube.calculatedMembers?.length > 0) {
            for (const member of cube.calculatedMembers) {
                if (!member.name) {
                    issues.push({
                        message: { en_US: 'Calculated member name is required', zh_Hans: '计算成员名称是必需的' },
                        level: 'error',
                        field: 'calculatedMembers.name',
                        ruleCode: 'VCUBE_CALCULATED_MEMBER_NAME_REQUIRED'
                    })
                }
                // Additional validations for calculated members can be added here
                if (!member.formula) {
                    issues.push({
                        message: { en_US: 'Calculated member formula is required', zh_Hans: '计算成员公式是必需的' },
                        level: 'error',
                        field: 'calculatedMembers.formula',
                        ruleCode: 'VCUBE_CALCULATED_MEMBER_FORMULA_REQUIRED'
                    })
                }
            }
        }
        return issues
    }
}
