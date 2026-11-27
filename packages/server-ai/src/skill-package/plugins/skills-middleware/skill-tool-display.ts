import type { IconDefinition, ToolDisplayDeclaration } from '@xpert-ai/contracts'
import { toolInputTarget } from '../../../shared/tool-display'

// Lucide Wrench (ISC). Keep the action icon independent of the middleware's catalog icon.
const readSkillFileIcon: IconDefinition = {
    type: 'svg',
    color: 'currentColor',
    value: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z"/></svg>'
}

export const readSkillFileDisplayMetadata = {
    toolDisplay: {
        tool: 'read_skill_file',
        activity: { kind: 'skill', action: 'read' },
        target: toolInputTarget('path', true),
        outputMode: 'summary',
        outputSummary: { en_US: 'Skill instructions read', zh_Hans: '已读取技能说明' }
    } satisfies ToolDisplayDeclaration,
    toolName: {
        en_US: 'Read skill file',
        zh_Hans: '读取技能文件'
    },
    toolIcon: readSkillFileIcon
}
