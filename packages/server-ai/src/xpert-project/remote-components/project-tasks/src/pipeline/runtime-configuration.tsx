import type {
    ProjectPipelineCatalog,
    ProjectPipelineConfigurationForm,
    ProjectPipelineRuntimeSelection
} from '@xpert-ai/contracts'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@xpert-ai/shadcn-ui'

export function RuntimeConfiguration({
    form,
    catalog,
    selections,
    locale,
    disabled,
    onChange
}: {
    form: ProjectPipelineConfigurationForm
    catalog: ProjectPipelineCatalog
    selections: Record<string, ProjectPipelineRuntimeSelection>
    locale: string
    disabled: boolean
    onChange: (slot: string, selection: ProjectPipelineRuntimeSelection) => void
}) {
    const zh = locale.startsWith('zh'),
        candidates = catalog.runtimeBindings ?? []
    if (!form.runtimeSlots?.length) return null
    return (
        <section className="space-y-3">
            <h3 className="text-sm font-medium">{zh ? 'Runtime 执行器' : 'Runtime executors'}</h3>
            <p className="text-xs text-muted-foreground">
                {zh
                    ? '选择管理员授权的执行器及工作空间。此选择不授予编排编辑或文件访问权限。'
                    : 'Select an administrator-authorized executor and workspace. This selection does not grant authoring or file access.'}
            </p>
            {!candidates.length && (
                <p className="text-sm text-muted-foreground">
                    {zh
                        ? '当前会话中没有可用的 Runtime，请在平台管理页检查授权与绑定。'
                        : 'No Runtime is available in this session. Check grants and bindings in platform management.'}
                </p>
            )}
            {form.runtimeSlots.map((field) => {
                const selection = selections[field.slot],
                    candidate = candidates.find((item) => item.id === selection?.bindingId)
                const name = zh ? (field.label.zh_Hans ?? field.label.en_US) : field.label.en_US
                const workspace = candidate?.workspaces.find((item) => item.id === selection?.workspaceId)
                return (
                    <div className="space-y-2" key={field.slot}>
                        <label id={`runtime-${field.slot}`} className="text-sm">
                            {name}
                        </label>
                        <Select
                            value={candidate?.id ?? ''}
                            disabled={disabled}
                            onValueChange={(bindingId) => {
                                const next = candidates.find((item) => item.id === bindingId)
                                onChange(field.slot, {
                                    bindingId,
                                    workspaceId: next?.workspaces.length === 1 ? next.workspaces[0].id : ''
                                })
                            }}
                        >
                            <SelectTrigger aria-labelledby={`runtime-${field.slot}`}>
                                <SelectValue placeholder={zh ? '选择 Runtime' : 'Choose a Runtime'} />
                            </SelectTrigger>
                            <SelectContent>
                                {candidates.map((item) => (
                                    <SelectItem key={item.id} value={item.id}>
                                        {item.title} · {item.provider}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select
                            value={workspace?.id ?? ''}
                            disabled={disabled || !candidate}
                            onValueChange={(workspaceId) => {
                                if (candidate) onChange(field.slot, { bindingId: candidate.id, workspaceId })
                            }}
                        >
                            <SelectTrigger aria-label={`${name} ${zh ? '工作空间' : 'workspace'}`}>
                                <SelectValue placeholder={zh ? '选择授权工作空间' : 'Choose an authorized workspace'} />
                            </SelectTrigger>
                            <SelectContent>
                                {candidate?.workspaces.map((item) => (
                                    <SelectItem key={item.id} value={item.id}>
                                        {item.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {field.description && (
                            <p className="text-xs text-muted-foreground">
                                {zh ? (field.description.zh_Hans ?? field.description.en_US) : field.description.en_US}
                            </p>
                        )}
                    </div>
                )
            })}
        </section>
    )
}
