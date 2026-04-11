export interface PacMenuItem {
	title: string
	icon?: string
	link?: string
	pathMatch?: string
	home?: boolean
	admin?: boolean
	data: any
	children?: PacMenuItem[]
	hidden?: boolean
	// States
	expanded?: boolean
	isActive?: boolean
}
