import { Input } from '@xpert-ai/shadcn-ui'
import type { ProjectPipelineNativeModelBudget } from '@xpert-ai/contracts'

export function BudgetConfiguration({
    value,
    maximum,
    onChange,
    locale,
    disabled,
    description
}: {
    value: ProjectPipelineNativeModelBudget | undefined
    maximum: ProjectPipelineNativeModelBudget
    onChange: (value: ProjectPipelineNativeModelBudget) => void
    locale: string
    disabled: boolean
    description?: string
}) {
    const zh = locale.startsWith('zh')
    const labels = zh
        ? { maxCalls: '最多原生模型调用', maxTokens: '实例 Token 额度', reservationTokens: '每次调用预留 Token' }
        : {
              maxCalls: 'Maximum native model calls',
              maxTokens: 'Instance token budget',
              reservationTokens: 'Tokens reserved per call'
          }
    if (!value) return null
    return (
        <section className="space-y-3 border-t pt-4">
            <h3 className="text-sm font-medium">{zh ? '原生模型预算' : 'Native model budget'}</h3>
            <p className="text-xs text-muted-foreground">
                {description ??
                    (zh
                        ? '所有轮次和重试共用实例额度；未知用量保持预留。配置保存后只用于新实例，不能替换既有实例预算。不构成硬费用封顶。'
                        : 'All rounds and retries share the instance budget. Unknown usage retains its hold. Saved changes apply to new instances and cannot replace an existing budget. This is not a hard cost cap.')}
            </p>
            {(['maxCalls', 'maxTokens', 'reservationTokens'] as const).map((key) => (
                <div key={key} className="space-y-1.5">
                    <label htmlFor={`budget-${key}`} className="text-sm">
                        {labels[key]}
                    </label>
                    <Input
                        id={`budget-${key}`}
                        type="number"
                        min={1}
                        max={maximum[key]}
                        step={1}
                        disabled={disabled}
                        value={Number.isFinite(value[key]) ? value[key] : ''}
                        onChange={(event) =>
                            onChange({ ...value, [key]: event.target.value === '' ? NaN : Number(event.target.value) })
                        }
                    />
                </div>
            ))}
        </section>
    )
}
