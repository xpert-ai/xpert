export enum PlanningToolEnum {
    CREATE_PLAN = 'create_plan',
    LIST_PLANS = 'list_plans',
    DELETE_PLAN = 'delete_plan',
    UPDATE_PLAN_STEP = 'update_plan_step',
}

export type TStepStatus = 'in_progress' | 'completed' | 'blocked'
export type TPlan = {
	id: string
	title: string
	steps: {
        content: string
        status: TStepStatus
        notes: string
    }[]
}