import i18next from 'i18next'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { projectTaskRuntimeError } from './project-task-runtime.errors'

it.each(['en', 'en-US', 'zh-Hans'])('returns actionable ownership recovery copy in %s', async (lng) => {
    const previousLanguage = i18next.language
    try {
        await i18next.init({
            lng,
            resources: {
                [lng]: { 'server-ai': JSON.parse(readFileSync(join(__dirname, '../../i18n', `${lng}.json`), 'utf8')) }
            }
        })
        const error = projectTaskRuntimeError('AssigneeRequired')
        expect(error.getStatus()).toBe(409)
        expect(error.message).toBe(i18next.t('server-ai:Error.ProjectTaskRuntimeAssigneeRequired'))
        expect(error.message).toContain(lng === 'zh-Hans' ? '重试' : 'retry')
        expect(error.message).toContain(lng === 'zh-Hans' ? '最新任务版本' : 'latest task revision')
        expect(error.message).not.toContain('server-ai:')
    } finally {
        if (previousLanguage) await i18next.changeLanguage(previousLanguage)
    }
})
