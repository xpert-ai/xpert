import { useEffect, useRef, useState } from 'react'
import { Settings2, X } from 'lucide-react'
import {
    Button,
    Dialog,
    DialogContent,
    DialogTitle,
    DialogDescription,
    Input,
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem
} from '@xpert-ai/shadcn-ui'
import {
    checkProjectPipelineHostCompatibility,
    configureProjectPipelineFromForm,
    projectPipelineCatalogSchema,
    projectPipelineConfigurationPageSchema,
    type ProjectPipelineCatalog,
    type ProjectPipelineNativeModelBudget,
    type ProjectPipelineConfiguration,
    type ProjectPipelineSavedConfiguration,
    type ProjectPipelineJsonValue,
    type ProjectPipelineParameterField,
    type ProjectPipelineRuntimeSelection
} from '@xpert-ai/contracts'
import { z } from 'zod'
import { request } from '../bridge'
import { openProjectWorkspace } from './navigation'
import { RuntimeConfiguration } from './runtime-configuration'
import { initialRuntimeSelections, runtimeSelectionState } from './runtime-selection'
import { BudgetConfiguration } from './budget-configuration'

const zh = {
    configure: '配置流水线',
    choose: '选择模板',
    description: '选择执行器并设置此模板开放的参数。',
    assistants: '执行智能体',
    parameters: '流程参数',
    save: '保存配置',
    close: '关闭',
    empty: '暂无可用模板',
    noAssistants: '项目中暂无可用的已发布智能体，请先在项目设置中绑定。',
    chooseAssistant: '选择智能体',
    provider: '此流水线的配置由接入应用管理。',
    saved: '配置已保存，可由接入应用使用此配置发起流水线。',
    failed: '配置未保存，请检查输入和当前权限后重试。',
    unavailable: '无法读取流水线配置，请重试。',
    lines: '每行一项',
    saving: '正在保存…',
    version: '版本',
    loading: '正在读取配置…',
    savedList: '已保存配置',
    copy: '复制配置',
    more: '加载更多',
    unavailableBindings:
        '以下角色的已保存绑定在当前会话中不可选。原配置未更改；请在 Project 管理页面配置，或重新选择当前可用的智能体：'
}
const en: { [K in keyof typeof zh]: string } = {
    configure: 'Configure pipeline',
    choose: 'Choose a template',
    description: 'Select executors and set the parameters exposed by this template.',
    assistants: 'Execution Assistants',
    parameters: 'Parameters',
    save: 'Save configuration',
    close: 'Close',
    empty: 'No templates available',
    noAssistants: 'No published Assistants are available. Bind Assistants in Project settings first.',
    chooseAssistant: 'Choose an Assistant',
    provider: 'Configure this pipeline in its connected application.',
    saved: 'Configuration saved. The connected application can use it to start a pipeline.',
    failed: 'Configuration was not saved. Check the inputs and your current access, then retry.',
    unavailable: 'Unable to load pipeline configuration. Please retry.',
    lines: 'One item per line',
    saving: 'Saving…',
    version: 'Version',
    loading: 'Loading configuration…',
    savedList: 'Saved configurations',
    copy: 'Copy configuration',
    more: 'Load more',
    unavailableBindings:
        'Saved bindings for these roles are unavailable in this session. The saved configuration is unchanged. Use Project management or select currently available Assistants:'
}
type Label = { en_US: string; zh_Hans?: string }
const label = (value: Label, locale: string) => (locale.startsWith('zh') ? (value.zh_Hans ?? value.en_US) : value.en_US)
const itemKey = (item: ProjectPipelineCatalog['items'][number]) =>
    JSON.stringify([item.contributionKey, item.configuration.binding.templateRef])

export function PipelineConfiguration({
    locale,
    projectId,
    initialOpen = false
}: {
    locale: string
    projectId?: string
    initialOpen?: boolean
}) {
    const t = locale.startsWith('zh') ? zh : en
    const [catalog, setCatalog] = useState<ProjectPipelineCatalog | null>(null),
        [open, setOpen] = useState(initialOpen)
    const [selected, setSelected] = useState(''),
        [assistants, setAssistants] = useState<Record<string, string>>({})
    const [runtimes, setRuntimes] = useState<Record<string, ProjectPipelineRuntimeSelection>>({})
    const [parameters, setParameters] = useState<Record<string, ProjectPipelineJsonValue>>({})
    const [nativeModelBudget, setNativeModelBudget] = useState<ProjectPipelineNativeModelBudget>()
    const [formRevision, setFormRevision] = useState(0)
    const [error, setError] = useState(''),
        [busy, setBusy] = useState(false),
        [saved, setSaved] = useState(false)
    const [bindings, setBindings] = useState<ProjectPipelineSavedConfiguration[]>([]),
        [next, setNext] = useState<string | null>(null)
    const requestKey = useRef<{ input: string; id: string } | null>(null)
    useEffect(() => {
        let active = true
        void request('executeAction', { actionKey: 'pipeline-catalog', input: { protocol: 2 } })
            .then((value) => {
                const result = z.object({ success: z.literal(true), data: projectPipelineCatalogSchema }).parse(value)
                if (active) {
                    setCatalog(result.data)
                    setError('')
                }
            })
            .catch(() => {
                if (active) setError(t.unavailable)
            })
        return () => {
            active = false
        }
    }, [open, t.unavailable])
    useEffect(() => {
        if (!open || !catalog?.canManage) return
        let active = true
        void request('executeAction', { actionKey: 'pipeline-configurations', input: { protocol: 2 } })
            .then((value) => {
                const page = z
                    .object({ success: z.literal(true), data: projectPipelineConfigurationPageSchema })
                    .parse(value).data
                if (active) {
                    setBindings(page.items)
                    setNext(page.next)
                }
            })
            .catch(() => {
                if (active) setError(t.unavailable)
            })
        return () => {
            active = false
        }
    }, [open, catalog?.canManage, saved, t.unavailable])
    const item = catalog?.items.find((item) => itemKey(item) === selected)
    const incompatible =
        !!item &&
        checkProjectPipelineHostCompatibility(
            item.configuration.template,
            item.configuration.binding,
            catalog?.hostCapabilities ?? { protocols: [], features: {} }
        ).length > 0
    const unavailableSlots =
        item?.form?.assistantSlots.filter(
            (field) =>
                assistants[field.slot] &&
                !catalog?.assistants.some((assistant) => assistant.id === assistants[field.slot])
        ) ?? []
    const incompleteSelection = item?.form?.assistantSlots.some((field) => !assistants[field.slot]) ?? false
    const runtimeState =
        item?.form && catalog
            ? runtimeSelectionState(item.form, runtimes, catalog)
            : { unavailable: [], incomplete: false }
    const choose = (key: string, copy?: ProjectPipelineConfiguration) => {
        const selected = catalog?.items.find((item) => itemKey(item) === key)
        const configuration = copy ?? selected?.configuration
        requestKey.current = null
        setSelected(key)
        setSaved(false)
        setError('')
        setFormRevision((revision) => revision + 1)
        setNativeModelBudget(
            selected?.form?.nativeModelBudget ? configuration?.binding.limits?.nativeModelBudget : undefined
        )
        setParameters(
            Object.fromEntries(
                (selected?.form?.parameters ?? []).map((field) => [
                    field.key,
                    configuration!.binding.parameters[field.key]
                ])
            )
        )
        setAssistants(
            Object.fromEntries(
                (selected?.form?.assistantSlots ?? []).map((field) => {
                    const id = configuration!.binding.executorBindings?.[field.slot].selectionKey
                    return [
                        field.slot,
                        copy ? (id ?? '') : catalog?.assistants.some((item) => item.id === id) ? id! : ''
                    ]
                })
            )
        )
        setRuntimes(
            selected?.form && configuration && catalog
                ? initialRuntimeSelections(configuration, selected.form, catalog, !!copy)
                : {}
        )
    }
    const save = async () => {
        if (
            !item?.form ||
            incompatible ||
            busy ||
            saved ||
            unavailableSlots.length ||
            incompleteSelection ||
            runtimeState.unavailable.length ||
            runtimeState.incomplete
        )
            return
        try {
            configureProjectPipelineFromForm(item.configuration, item.form, {
                assistants,
                runtimes,
                parameters,
                nativeModelBudget
            })
            const input = {
                contributionKey: item.contributionKey,
                templateRef: item.configuration.binding.templateRef,
                assistants,
                runtimes,
                parameters,
                ...(item.form.nativeModelBudget ? { nativeModelBudget } : {})
            }
            const key = JSON.stringify(input)
            if (requestKey.current?.input !== key) requestKey.current = { input: key, id: crypto.randomUUID() }
            setBusy(true)
            setError('')
            z.object({
                success: z.literal(true),
                data: z.object({ bindingId: z.string().uuid(), revision: z.number().int().positive() })
            }).parse(
                await request('executeAction', {
                    actionKey: 'pipeline-configure',
                    input: { ...input, requestId: requestKey.current.id }
                })
            )
            setSaved(true)
        } catch {
            setError(t.failed)
        } finally {
            setBusy(false)
        }
    }
    if (catalog && !catalog.canManage) return null
    return (
        <>
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
                <Settings2 />
                {t.configure}
            </Button>
            <Dialog
                open={open}
                onOpenChange={(value) => {
                    if (!busy) setOpen(value)
                }}
            >
                <DialogContent
                    className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
                    showCloseButton={false}
                >
                    <div className="flex items-start justify-between gap-4 border-b p-4">
                        <div className="space-y-1">
                            <DialogTitle>{t.configure}</DialogTitle>
                            <DialogDescription>{t.description}</DialogDescription>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t.close}
                            disabled={busy}
                            onClick={() => setOpen(false)}
                        >
                            <X />
                        </Button>
                    </div>
                    <div className="min-h-0 space-y-5 overflow-y-auto px-4 py-4">
                        {error && (
                            <p role="alert" className="text-sm text-destructive">
                                {error}
                            </p>
                        )}
                        {!catalog && !error && <p className="text-sm text-muted-foreground">{t.loading}</p>}
                        {catalog && !catalog.items.length && <p className="text-sm text-muted-foreground">{t.empty}</p>}
                        {!!catalog?.items.length && (
                            <Select value={selected} disabled={busy} onValueChange={choose}>
                                <SelectTrigger aria-label={t.choose}>
                                    <SelectValue placeholder={t.choose} />
                                </SelectTrigger>
                                <SelectContent>
                                    {catalog.items.map((item) => (
                                        <SelectItem key={itemKey(item)} value={itemKey(item)}>
                                            {item.configuration.template.title} · {item.configuration.template.version}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                        {item && (
                            <>
                                {incompatible && (
                                    <p role="alert" className="text-sm text-destructive">
                                        {locale.startsWith('zh')
                                            ? '当前服务未确认支持此模板所需的流水线能力。请由管理员完成服务升级后重试，原有配置和执行记录会保留。'
                                            : 'This service has not confirmed support for the pipeline capabilities required by this template. Ask an administrator to finish the service upgrade, then retry. Saved configurations and executions are preserved.'}
                                    </p>
                                )}
                                {item.form ? (
                                    <>
                                        <p className="text-sm text-muted-foreground">
                                            {label(item.form.description, locale)}
                                        </p>
                                        {!!item.form.assistantSlots.length && (
                                            <section className="space-y-3">
                                                <h3 className="text-sm font-medium">{t.assistants}</h3>
                                                {!catalog?.assistants.length && (
                                                    <p className="text-sm text-muted-foreground">{t.noAssistants}</p>
                                                )}
                                                {!!unavailableSlots.length && (
                                                    <p role="alert" className="text-sm text-destructive">
                                                        {t.unavailableBindings}{' '}
                                                        {unavailableSlots
                                                            .map((field) => label(field.label, locale))
                                                            .join('、')}
                                                    </p>
                                                )}
                                                {!!unavailableSlots.length && projectId && (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => {
                                                            void openProjectWorkspace(
                                                                projectId,
                                                                'pipelines',
                                                                t.unavailable
                                                            ).catch(() => setError(t.unavailable))
                                                        }}
                                                    >
                                                        {locale.startsWith('zh')
                                                            ? '在平台管理流水线'
                                                            : 'Manage pipelines in platform'}
                                                    </Button>
                                                )}
                                                {item.form.assistantSlots.map((field) => (
                                                    <div key={field.slot} className="space-y-1.5">
                                                        <label id={`slot-${field.slot}`} className="text-sm">
                                                            {label(field.label, locale)}
                                                        </label>
                                                        <Select
                                                            value={
                                                                unavailableSlots.some(
                                                                    (unavailable) => unavailable.slot === field.slot
                                                                )
                                                                    ? ''
                                                                    : assistants[field.slot]
                                                            }
                                                            disabled={busy}
                                                            onValueChange={(value) => {
                                                                setAssistants((previous) => ({
                                                                    ...previous,
                                                                    [field.slot]: value
                                                                }))
                                                                setSaved(false)
                                                            }}
                                                        >
                                                            <SelectTrigger aria-labelledby={`slot-${field.slot}`}>
                                                                <SelectValue placeholder={t.chooseAssistant} />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {catalog?.assistants.map((assistant) => (
                                                                    <SelectItem key={assistant.id} value={assistant.id}>
                                                                        {assistant.name} · {assistant.publishedVersion}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                        {field.description && (
                                                            <p className="text-xs text-muted-foreground">
                                                                {label(field.description, locale)}
                                                            </p>
                                                        )}
                                                    </div>
                                                ))}
                                            </section>
                                        )}
                                        {!!runtimeState.unavailable.length && (
                                            <p role="alert" className="text-sm text-destructive">
                                                {locale.startsWith('zh')
                                                    ? '已保存的 Runtime 或工作空间当前不可用，请重新选择。原配置未更改。'
                                                    : 'A saved Runtime or workspace is unavailable. Select an available grant. The saved configuration is unchanged.'}
                                            </p>
                                        )}
                                        <RuntimeConfiguration
                                            form={item.form}
                                            catalog={catalog!}
                                            selections={runtimes}
                                            locale={locale}
                                            disabled={busy}
                                            onChange={(slot, selection) => {
                                                setRuntimes((previous) => ({ ...previous, [slot]: selection }))
                                                setSaved(false)
                                            }}
                                        />
                                        {item.form.nativeModelBudget && (
                                            <BudgetConfiguration
                                                value={nativeModelBudget}
                                                maximum={item.form.nativeModelBudget}
                                                locale={locale}
                                                disabled={busy}
                                                onChange={(value) => {
                                                    setNativeModelBudget(value)
                                                    setSaved(false)
                                                }}
                                            />
                                        )}
                                        {!!item.form.runtimeSlots?.length &&
                                            !catalog?.runtimeBindings?.length &&
                                            projectId && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => {
                                                        void openProjectWorkspace(
                                                            projectId,
                                                            'pipelines',
                                                            t.unavailable
                                                        ).catch(() => setError(t.unavailable))
                                                    }}
                                                >
                                                    {locale.startsWith('zh')
                                                        ? '在平台管理流水线'
                                                        : 'Manage pipelines in platform'}
                                                </Button>
                                            )}
                                        {!!item.form.parameters.length && (
                                            <section className="space-y-3 border-t pt-4">
                                                <h3 className="text-sm font-medium">{t.parameters}</h3>
                                                {item.form.parameters.map((field) => (
                                                    <ParameterField
                                                        key={`${selected}:${formRevision}:${field.key}`}
                                                        field={field}
                                                        value={parameters[field.key]}
                                                        locale={locale}
                                                        disabled={busy}
                                                        onChange={(value) => {
                                                            setParameters((previous) => ({
                                                                ...previous,
                                                                [field.key]: value
                                                            }))
                                                            setSaved(false)
                                                        }}
                                                    />
                                                ))}
                                            </section>
                                        )}
                                    </>
                                ) : (
                                    <p className="text-sm text-muted-foreground">{t.provider}</p>
                                )}
                            </>
                        )}
                        {saved && (
                            <p role="status" className="text-sm text-primary">
                                {t.saved}
                            </p>
                        )}
                        {!!bindings.length && (
                            <section className="space-y-2 border-t pt-4">
                                <h3 className="text-sm font-medium">{t.savedList}</h3>
                                {bindings.map((binding) => {
                                    const source = catalog?.items.find(
                                        (item) =>
                                            item.configuration.binding.templateRef ===
                                            binding.configuration.binding.templateRef
                                    )
                                    return (
                                        <div
                                            key={binding.id}
                                            className="flex items-center justify-between gap-3 border-b py-2 text-sm"
                                        >
                                            <div>
                                                {binding.configuration.template.title}
                                                <p className="text-xs text-muted-foreground">
                                                    {binding.configuration.template.version} ·{' '}
                                                    {new Date(binding.createdAt).toLocaleString(locale)}
                                                </p>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                disabled={busy || !source?.form}
                                                onClick={() => {
                                                    if (source) choose(itemKey(source), binding.configuration)
                                                }}
                                            >
                                                {t.copy}
                                            </Button>
                                        </div>
                                    )
                                })}
                                {next && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={busy}
                                        onClick={() => {
                                            setBusy(true)
                                            void request('executeAction', {
                                                actionKey: 'pipeline-configurations',
                                                input: { after: next, protocol: 2 }
                                            })
                                                .then((value) => {
                                                    const page = z
                                                        .object({
                                                            success: z.literal(true),
                                                            data: projectPipelineConfigurationPageSchema
                                                        })
                                                        .parse(value).data
                                                    setBindings((previous) => [
                                                        ...previous,
                                                        ...page.items.filter(
                                                            (item) => !previous.some((saved) => saved.id === item.id)
                                                        )
                                                    ])
                                                    setNext(page.next)
                                                })
                                                .catch(() => setError(t.unavailable))
                                                .finally(() => setBusy(false))
                                        }}
                                    >
                                        {t.more}
                                    </Button>
                                )}
                            </section>
                        )}
                    </div>
                    <div className="flex justify-end gap-2 border-t bg-muted/30 p-4">
                        <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
                            {t.close}
                        </Button>
                        {item?.form && (
                            <Button
                                disabled={
                                    incompatible ||
                                    busy ||
                                    saved ||
                                    incompleteSelection ||
                                    !!unavailableSlots.length ||
                                    runtimeState.incomplete ||
                                    !!runtimeState.unavailable.length
                                }
                                onClick={() => void save()}
                            >
                                {busy ? t.saving : t.save}
                            </Button>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}

export function ParameterField({
    field,
    value,
    locale,
    disabled,
    onChange
}: {
    field: ProjectPipelineParameterField
    value: ProjectPipelineJsonValue
    locale: string
    disabled: boolean
    onChange: (value: ProjectPipelineJsonValue) => void
}) {
    const name = label(field.label, locale),
        id = `parameter-${field.key}`,
        list = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
    return (
        <div className="space-y-1.5">
            <label className="text-sm" id={`${id}-label`} htmlFor={id}>
                {name}
            </label>
            {field.type === 'boolean' ? (
                <input
                    id={id}
                    type="checkbox"
                    className="ml-3 accent-primary"
                    checked={value === true}
                    disabled={disabled}
                    onChange={(event) => onChange(event.target.checked)}
                />
            ) : field.type === 'choice' ? (
                <Select value={typeof value === 'string' ? value : ''} disabled={disabled} onValueChange={onChange}>
                    <SelectTrigger id={id} aria-labelledby={`${id}-label`}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {field.options.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                                {label(option.label, locale)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            ) : field.type === 'multi_choice' ? (
                <div role="group" aria-labelledby={`${id}-label`} className="flex flex-wrap gap-3">
                    {field.options.map((option) => (
                        <label key={option.value} className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                className="accent-primary"
                                disabled={disabled}
                                checked={list.includes(option.value)}
                                onChange={(event) =>
                                    onChange(
                                        event.target.checked
                                            ? [...list, option.value]
                                            : list.filter((value) => value !== option.value)
                                    )
                                }
                            />
                            {label(option.label, locale)}
                        </label>
                    ))}
                </div>
            ) : field.type === 'string_list' ? (
                <>
                    <textarea
                        id={id}
                        disabled={disabled}
                        className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        defaultValue={list.join('\n')}
                        onChange={(event) =>
                            onChange(
                                event.target.value
                                    .split('\n')
                                    .map((value) => value.trim())
                                    .filter(Boolean)
                            )
                        }
                    />
                    <p className="text-xs text-muted-foreground">{locale.startsWith('zh') ? zh.lines : en.lines}</p>
                </>
            ) : (
                <Input
                    id={id}
                    disabled={disabled}
                    type={field.type === 'number' ? 'number' : 'text'}
                    value={typeof value === 'string' || typeof value === 'number' ? value : ''}
                    {...(field.type === 'number'
                        ? { min: field.min, max: field.max, step: field.integer ? 1 : 'any' }
                        : { maxLength: field.maxLength })}
                    onChange={(event) =>
                        onChange(
                            field.type === 'number' && event.target.value !== ''
                                ? Number(event.target.value)
                                : event.target.value
                        )
                    }
                />
            )}
            {field.description && <p className="text-xs text-muted-foreground">{label(field.description, locale)}</p>}
        </div>
    )
}
