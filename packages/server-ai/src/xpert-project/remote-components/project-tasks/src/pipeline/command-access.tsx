import { useState } from 'react'
import type { ProjectPipelineCommandCapability } from '@xpert-ai/contracts'
import { Button } from '@xpert-ai/shadcn-ui'
import { openProjectWorkspace } from './navigation'

export function PipelineCommandAccess({
    capability,
    projectId,
    locale
}: {
    capability?: ProjectPipelineCommandCapability
    projectId?: string
    locale: string
}) {
    const [opening, setOpening] = useState(false)
    const [failed, setFailed] = useState(false)
    if (capability?.allowed) return null
    const zh = locale.startsWith('zh')
    const failure = zh
        ? '无法打开项目管理页面。请在平台中打开此项目的“流水线”页面，使用有相应项目权限的用户账号登录后继续。'
        : 'Could not open Project management. Open this Project’s Pipelines page in the platform and sign in with a user account that has the required Project access.'
    return (
        <div className="space-y-3 rounded-md border p-3 text-sm">
            <p role="status">
                {capability
                    ? zh
                        ? '当前会话可查看流水线，但不支持保存配置或执行流水线操作。请在项目管理页面使用有相应项目权限的用户账号继续。'
                        : 'This session can view pipelines but cannot save configurations or perform pipeline actions. Continue in Project management with a user account that has the required Project access.'
                    : zh
                      ? '服务尚未确认当前会话的流水线操作权限。请刷新页面；若问题仍存在，请联系管理员升级服务。'
                      : 'The service has not confirmed pipeline command access for this session. Refresh the page, or ask an administrator to update the service.'}
            </p>
            {capability && projectId && (
                <Button
                    variant="outline"
                    size="sm"
                    disabled={opening}
                    onClick={async () => {
                        setOpening(true)
                        setFailed(false)
                        try {
                            await openProjectWorkspace(projectId, 'pipelines', failure)
                        } catch {
                            setFailed(true)
                        } finally {
                            setOpening(false)
                        }
                    }}
                >
                    {opening
                        ? zh
                            ? '正在打开…'
                            : 'Opening…'
                        : zh
                          ? '打开项目流水线管理'
                          : 'Open Project pipeline management'}
                </Button>
            )}
            {failed && (
                <p role="alert" className="text-destructive">
                    {failure}
                </p>
            )}
        </div>
    )
}
