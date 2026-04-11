import {
	Component,
	OnInit,
	OnDestroy,
	Input,
	forwardRef,
	EventEmitter,
	Output,
	inject,
	DestroyRef
} from '@angular/core';
import { ControlValueAccessor, FormControl, FormsModule, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms';
import { filter, map } from 'rxjs';
import { IRole, IUser, RolesEnum } from '@xpert-ai/contracts';
import { RoleService, Store } from './../../../../../@core/services';

import { TranslateModule } from '@ngx-translate/core';
import { NgmSelectComponent } from '@xpert-ai/ocap-angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgmFieldAppearance } from "@xpert-ai/ocap-angular/core";
import { ZardFormImports } from '@xpert-ai/headless-ui'

@Component({
	standalone: true,
	imports: [FormsModule, ReactiveFormsModule, TranslateModule, ...ZardFormImports, NgmSelectComponent],
	selector: 'pac-role-form-field',
	templateUrl: './role.component.html',
	styleUrls: [],
	providers: [
		{
			provide: NG_VALUE_ACCESSOR,
			useExisting: forwardRef(() => RoleFormFieldComponent),
			multi: true
		}
	]
})
export class RoleFormFieldComponent implements OnInit, OnDestroy, ControlValueAccessor {
	readonly destroyRef = inject(DestroyRef)
	
	roles: IRole[] = [];
	roleOptions: Array<{ value: string; label: string }> = [];
	onChange: any = () => {};
	onTouched: any = () => {};

	@Input() appearance: NgmFieldAppearance

	/**
	 * Getter & Setter for dynamic remove role from options
	 */
	private _excludes: RolesEnum[] = [];
	get excludes(): RolesEnum[] {
		return this._excludes;
	}
	@Input() set excludes(value: RolesEnum[]) {
		this._excludes = value ?? [];
		this.updateRoleOptions();
	}

	// ID attribute for the field and for attribute for the label
	private _id: string;
	get id(): string {
		return this._id;
	}
	@Input() set id(value: string) {
		this._id = value;
	}

	/*
	* Getter & Setter for placeholder
	*/
	private _placeholder: string;
	get placeholder(): string {
		return this._placeholder;
	}
	@Input() set placeholder(value: string) {
		this._placeholder = value;
	}
	
	/*
	* Getter & Setter for label
	*/
	private _label: string;
	get label(): string {
		return this._label;
	}
	@Input() set label(value: string) {
		this._label = value;
	}

	/*
	* Getter & Setter accessor for form control
	*/
	private _ctrl: FormControl = new FormControl(); 
	get ctrl(): FormControl {
		return this._ctrl;
	}
	@Input() set ctrl(value: FormControl) {
		this._ctrl = value;
	}
	
	// private _role: IRole;
	// set role(value: IRole) {
	// 	this._role = value;
	// 	this.onChange(value);
	// 	this.onTouched(value);
	// }
	// get role(): IRole {
	// 	return this._role;
	// }

	/**
	 * Getter & Setter for internal [(NgModel)]
	 */
	private _roleId: string | null = null;
	get roleId(): string {
		return this._roleId;
	}
	set roleId(value: string | null) {
		this._roleId = value ?? null;
		this.updateRoleOptions();
		this.onChange(this._roleId)
		this.onTouched()
	}

	@Output()
	selectedChange = new EventEmitter<IRole>();

	constructor(
		private readonly store: Store,
		private readonly rolesService: RoleService
	) {}

	ngOnInit() {
		this.store.user$
			.pipe(
				filter((user: IUser) => !!user),
				takeUntilDestroyed(this.destroyRef)
			)
			.subscribe(() => this.renderRoles());
	}

	/**
	* GET all tenant roles
	* Excludes role if needed
	*/
	async renderRoles() {
		this.rolesService
			.getAll()
			.pipe(
				map(({items}) => items),
				takeUntilDestroyed(this.destroyRef)
			)
			.subscribe((roles: IRole[]) => {
				this.roles = roles;
				this.updateRoleOptions();
			});
	}

	/**
	 * Write Value
	 * @param value 
	 */
	writeValue(value: IRole | string | null) {
		this._roleId = typeof value === 'string' ? value : value?.id ?? null;
		this.updateRoleOptions();
	}

	registerOnChange(fn: (rating: number) => void): void {
		this.onChange = fn;
	}

	registerOnTouched(fn: () => void): void {
		this.onTouched = fn;
	}

	// /**
	//  * On Selection Change
	//  * @param role 
	//  */
	// onSelectionChange(roleId: IRole['id']) {
	// 	if (roleId) {
	// 		this.role = this.getRoleById(roleId);
	// 		if (this.role) {
	// 			this.selectedChange.emit(this.role);
	// 		}
	// 	}
	// }

	/**
	 * GET role by ID
	 * 
	 * @param value 
	 * @returns 
	 */
	getRoleById(value: IRole['id']) {
		return this.roles.find(
			(role: IRole) => value === role.id
		);
	}

	onRoleIdChange(value: IRole['id'] | null) {
		this.roleId = value;
		const role = value ? this.getRoleById(value) : null;
		if (role) {
			this.selectedChange.emit(role);
		}
	}

	private updateRoleOptions() {
		const nextOptions = this.roles
			.filter(
				(role: IRole) => !this.excludes.includes(role.name as RolesEnum)
			)
			.map((role) => ({
				value: role.id,
				label: role.name
			}));

		if (
			nextOptions.length === this.roleOptions.length &&
			nextOptions.every((option, index) =>
				option.value === this.roleOptions[index]?.value && option.label === this.roleOptions[index]?.label
			)
		) {
			return;
		}

		this.roleOptions = nextOptions;
	}

	ngOnDestroy() {}
}
