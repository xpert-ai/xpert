import {
    readI18nMetadataValue,
    readMetadataProperty,
    readToolDisplayMetadata,
    resolveToolActivityDisplay
} from './tool-display'

describe('tool display metadata helpers', () => {
    it('reads localized display metadata from unknown values', () => {
        const metadata = {
            displayTitle: {
                en_US: 'Move project tasks',
                zh_Hans: '移动项目任务'
            },
            displayMessage: {
                en_US: 'Moving project tasks',
                zh_Hans: '正在移动项目任务'
            }
        }

        expect(readToolDisplayMetadata(metadata)).toEqual(metadata)
    })

    it('trims i18n values and rejects values without en_US', () => {
        expect(
            readI18nMetadataValue({
                en_US: '  Dispatch runnable tasks  ',
                zh_Hans: '  投递可执行任务  '
            })
        ).toEqual({
            en_US: 'Dispatch runnable tasks',
            zh_Hans: '投递可执行任务'
        })
        expect(readI18nMetadataValue({ zh_Hans: '缺少英文 fallback' })).toBeUndefined()
    })

    it('resolves activity display with compatibility fallbacks', () => {
        expect(
            resolveToolActivityDisplay(
                {
                    toolDisplayTitle: {
                        en_US: 'Legacy title'
                    },
                    toolDisplayMessage: {
                        en_US: 'Legacy message'
                    }
                },
                'moveProjectTasks'
            )
        ).toEqual({
            title: {
                en_US: 'Legacy title'
            },
            message: {
                en_US: 'Legacy message'
            }
        })

        expect(resolveToolActivityDisplay({ toolName: 'Configured name' }, 'moveProjectTasks')).toEqual({
            title: 'Configured name',
            message: undefined
        })
        expect(resolveToolActivityDisplay({}, 'moveProjectTasks')).toEqual({
            title: 'moveProjectTasks',
            message: undefined
        })
    })

    it('reads properties without broad object casts', () => {
        expect(readMetadataProperty({ displayTitle: 'Title' }, 'displayTitle')).toBe('Title')
        expect(readMetadataProperty(null, 'displayTitle')).toBeUndefined()
    })
})
