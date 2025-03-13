export enum PlanningToolEnum {
    CREATE_PLAN = 'create_plan',
    LIST_PLANS = 'list_plans',
    DELETE_PLAN_STEP = 'delete_plan_step',
    UPDATE_PLAN_STEP = 'update_plan_step',
}

export const PLAN_TITLE_NAME = 'plan_title'
export const PLAN_STEPS_NAME = 'plan_steps'

export type TStepStatus = 'in_progress' | 'completed' | 'blocked'
export type TPlanStep = {
    index: number
    content: string
    status: TStepStatus
    notes: string
}
export type TPlan = {
	// id: string
	title: string
	steps: TPlanStep[]
}