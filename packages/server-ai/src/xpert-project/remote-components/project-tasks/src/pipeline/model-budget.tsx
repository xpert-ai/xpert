import type { PipelineGraph } from './bridge'
import type { PipelineTexts } from './i18n'

export function PipelineModelBudget({
    budget,
    locale,
    t
}: {
    budget: NonNullable<PipelineGraph['statistics']>['nativeModelBudget']
    locale: string
    t: PipelineTexts
}) {
    if (!budget) return null
    const number = new Intl.NumberFormat(locale)
    return (
        <section className="mt-6 border-t pt-4 text-sm">
            <h3 className="font-medium">{t.modelBudget}</h3>
            <p className="mt-2 text-xs text-muted-foreground">{t.modelBudgetHint}</p>
            <dl className="my-4 grid grid-cols-2 gap-4">
                <div>
                    <dt className="text-xs text-muted-foreground">{t.modelCalls}</dt>
                    <dd>
                        {number.format(budget.calls)} / {number.format(budget.policy.maxCalls)}
                    </dd>
                </div>
                <div>
                    <dt className="text-xs text-muted-foreground">{t.budgetCommittedTokens}</dt>
                    <dd>
                        {number.format(budget.chargedAndReservedTokens)} / {number.format(budget.policy.maxTokens)}
                    </dd>
                </div>
                <div>
                    <dt className="text-xs text-muted-foreground">{t.budgetActualTokens}</dt>
                    <dd>{number.format(budget.actualTokens)}</dd>
                </div>
                <div>
                    <dt className="text-xs text-muted-foreground">{t.budgetHeldCalls}</dt>
                    <dd>{number.format(budget.heldCalls)}</dd>
                </div>
            </dl>
            {budget.admissionBlocked && <p className="text-destructive">{t.budgetBlocked}</p>}
        </section>
    )
}
