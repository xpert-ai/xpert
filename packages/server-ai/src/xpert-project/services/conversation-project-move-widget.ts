import type { v0_8 } from '@a2ui/lit'
import type { TMessageContentWidget } from '@xpert-ai/chatkit-types'
import type { ConversationProjectMoveOffer } from '@xpert-ai/contracts'
import { t } from 'i18next'

export function projectMoveWidget(
    move: ConversationProjectMoveOffer,
    projects: { id: string; name: string }[],
    canCreate: boolean,
    language: string
): TMessageContentWidget {
    const label = (key: string, params?: Record<string, string>) =>
        String(t('server-ai:ProjectMove.' + key, { lng: language, ...params }))
    const components: v0_8.Types.ComponentInstance[] = []
    // A2UI resolves strings matching component IDs as references, including action and context names.
    const add = (key: string, component: v0_8.Types.ComponentProperties) => {
        const id = move.requestId + ':' + key
        components.push({ id, component })
        return id
    }
    const text = (key: string, value: string) => add(key, { Text: { text: { literalString: value } } })
    const serverActions = new Set<string>()
    const button = (key: string, caption: string, name: string, mode?: 'create' | 'existing') => {
        const actionName = 'project.move.' + name
        serverActions.add(actionName)
        return add(key, {
            Button: {
                child: text(key + '-label', caption),
                primary: name === 'confirm',
                action: {
                    name: actionName,
                    context: mode
                        ? [
                              { key: 'mode', value: { literalString: mode } },
                              {
                                  key: 'target',
                                  value: move.projectId
                                      ? { literalString: mode === 'create' ? move.projectName || '' : move.projectId }
                                      : { path: '/' + mode }
                              }
                          ]
                        : []
                }
            }
        })
    }
    const children: string[] = []
    if (move.projectId) {
        children.push(text('moved', label('Moved', { name: move.projectName || '' })))
        if (!move.executionStatus) children.push(button('resume', label('Continue'), 'confirm', move.destination))
    } else {
        children.push(text('title', label('ChooseOrCreate')))
        const panel = (mode: 'existing' | 'create') => {
            const items: string[] = []
            const actions: string[] = []
            if (mode === 'existing' && !projects.length) {
                items.push(text('empty', label(canCreate ? 'NoProjects' : 'NoAvailableProjects')))
            } else {
                items.push(
                    add(
                        mode + '-field',
                        mode === 'create'
                            ? { TextField: { label: { literalString: label('Name') }, text: { path: '/create' } } }
                            : {
                                  MultipleChoice: {
                                      label: { literalString: label('Target') },
                                      selections: { path: '/existing' },
                                      maxAllowedSelections: 1,
                                      options: [
                                          { value: '', label: { literalString: label('Placeholder') } },
                                          ...projects.map((p) => ({ value: p.id, label: { literalString: p.name } }))
                                      ]
                                  }
                              }
                    )
                )
                items.push(text(mode + '-visibility', label('Visibility')))
                actions.push(button(mode + '-submit', label('Confirm'), 'confirm', mode))
            }
            actions.push(button(mode + '-cancel', label('Cancel'), 'cancel'))
            items.push(add(mode + '-actions', { Row: { children: { explicitList: actions } } }))
            return {
                title: { literalString: label(mode === 'create' ? 'Create' : 'Existing') },
                child: add(mode + '-panel', { Column: { children: { explicitList: items } } })
            }
        }
        if (canCreate) {
            const preferCreate = move.destination === 'create' || !projects.length
            children.push(
                add('modes', {
                    Tabs: {
                        tabItems: preferCreate
                            ? [panel('create'), panel('existing')]
                            : [panel('existing'), panel('create')]
                    }
                })
            )
        } else {
            children.push(panel('existing').child)
        }
    }
    const body = add('body', { Column: { children: { explicitList: children } } })
    const root = add('card', { Card: { child: body } })
    const surfaceId = 'project-move'
    const surface = {
        name: surfaceId,
        serverActions: [...serverActions],
        requiresIdleThread: true,
        messages: [
            { surfaceUpdate: { surfaceId, components } },
            { beginRendering: { surfaceId, root, styles: { tabsVariant: 'radio' } } }
        ]
    }
    return {
        id: move.requestId,
        type: 'component',
        data: { category: 'Dashboard', type: 'Widget', widgets: [surface] }
    }
}
