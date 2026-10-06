import type { I18nObject } from '@xpert-ai/contracts'

export const PROJECT_TASKS_MIDDLEWARE = 'project-tasks'
export const PROJECT_TASKS_MIDDLEWARE_NODE = '__project_tasks__'

export enum ProjectToolEnum {
    ListTasks = 'project_list_tasks',
    CreateTasks = 'project_create_tasks',
    UpdateTasks = 'project_update_tasks',
    DispatchTask = 'project_dispatch_task',
    GetTask = 'project_get_task',
    ListRuntimes = 'project_list_task_runtimes'
}

export const PROJECT_TASK_TOOL_TITLES: Record<ProjectToolEnum, I18nObject> = {
    [ProjectToolEnum.ListTasks]: { en_US: 'List project tasks', zh_Hans: '列出项目任务' },
    [ProjectToolEnum.CreateTasks]: { en_US: 'Create project tasks', zh_Hans: '创建项目任务' },
    [ProjectToolEnum.UpdateTasks]: { en_US: 'Update project tasks', zh_Hans: '更新项目任务' },
    [ProjectToolEnum.DispatchTask]: { en_US: 'Delegate project task', zh_Hans: '委托项目任务' },
    [ProjectToolEnum.GetTask]: { en_US: 'View project task', zh_Hans: '查看项目任务' },
    [ProjectToolEnum.ListRuntimes]: { en_US: 'List task runtimes', zh_Hans: '列出任务执行器' }
}

export const PROJECT_TASKS_ICON = {
    type: 'svg' as const,
    value: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 6 2 2 4-4m-6 9 2 2 4-4m-6 9 2 2 4-4M12 6h9M12 13h9M12 20h9"/></svg>'
}
