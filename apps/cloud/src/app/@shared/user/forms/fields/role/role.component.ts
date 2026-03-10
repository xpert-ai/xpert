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
import { filter, map, Observable, of as observableOf } from 'rxjs';
import { tap } from 'rxjs/operators';
import { IRole, IUser, RolesEnum } from '@metad/contracts';
import { RoleService, Store } from './../../../../../@core/services';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { MatSelectModule } from '@angular/material/select';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgmFieldAppearance } from "@metad/ocap-angular/core";
import { ZardFormImports } from "@xpert-ai/headless-ui";

@Component({
	standalone: true,
	imports: [CommonModule, FormsModule, ReactiveFormsModule, TranslateModule, ...ZardFormImports, MatSelectModule],
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
	roles$: Observable<IRole[]> = observableOf([]);
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
		this._excludes = value;
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
	private _roleId: string;
	get roleId(): string {
		return this._roleId;
	}
	set roleId(value: string) {
		this._roleId = value;
		this.onChange(value)
		this.onTouched(value)
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
				tap(() => this.renderRoles()),
				takeUntilDestroyed(this.destroyRef)
			)
			.subscribe();
	}

	/**
	* GET all tenant roles
	* Excludes role if needed
	*/
	async renderRoles() {
		this.roles$ = this.rolesService.getAll().pipe(
			map(({items}) => items),
			map((roles: IRole[]) => roles.filter(
				(role: IRole) => !this.excludes.includes(role.name as RolesEnum)
			)),
			tap((roles: IRole[]) => this.roles = roles),
			takeUntilDestroyed(this.destroyRef)
		);
	}

	/**
	 * Write Value
	 * @param value 
	 */
	writeValue(value: IRole) {
		if (value) {
			this.roleId = value.id;
		}
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

	ngOnDestroy() {}
}
