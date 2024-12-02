import { Component, OnInit, Input, Output, EventEmitter, forwardRef, ChangeDetectorRef, signal, computed, inject, DestroyRef } from '@angular/core';
import { ILanguage } from '@metad/contracts';
import { TranslateModule } from '@ngx-translate/core';
import { LanguagesService, Store } from '../../../@core';
import { filter, tap } from 'rxjs/operators';
import { FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatFormFieldAppearance } from '@angular/material/form-field';
import { TranslationBaseComponent } from '../translation-base.component';
import { NgmSelectComponent, NgmSpinComponent } from '@metad/ocap-angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
	standalone: true,
	imports: [
		CommonModule,
		FormsModule,
		TranslateModule,

		NgmSelectComponent,
		NgmSpinComponent
	],
	selector: 'pac-language-selector',
	templateUrl: './language-selector.component.html',
	styleUrls: ['./language-selector.component.scss'],
	providers: [
		{
			provide: NG_VALUE_ACCESSOR,
			useExisting: forwardRef(() => LanguageSelectorComponent),
			multi: true
		}
	]
})
export class LanguageSelectorComponent extends TranslationBaseComponent implements OnInit {
	readonly destroyRef = inject(DestroyRef)
	
	languages = signal<ILanguage[]>([])
	onChange: any = () => { }
	onTouch: any = () => { }

	languagesOptions = computed(() => this.languages().map((language: ILanguage) => ({key: language.code, caption: language.name})))

	@Input() appearance: MatFormFieldAppearance

	/*
	* Getter & Setter for dynamic placeholder
	*/
	_placeholder: string = this.getTranslation('MENU.LANGUAGE');
	get placeholder(): string {
		return this._placeholder;
	}
	@Input() set placeholder(value: string) {
		this._placeholder = value;
	}

	/*
	* Getter & Setter for dynamic clearable option
	*/
	_clearable: boolean;
	get clearable(): boolean {
		return this._clearable;
	}
	@Input() set clearable(value: boolean) {
		this._clearable = value;
	}

	/*
	* Getter & Setter for dynamic add tag option
	*/
	_addTag: boolean;
	get addTag(): boolean {
		return this._addTag;
	}
	@Input() set addTag(value: boolean) {
		this._addTag = value;
	}

	/*
	* Getter & Setter for automatic language selection as per selected language code
	*/
	_selectedLanguageCode: string;
	get selectedLanguageCode(): string {
		return this._selectedLanguageCode;
	}
	@Input() set selectedLanguageCode(value: string) {
		if (value) {
			this._selectedLanguageCode = value;
			this.onChange(value);
			this.onTouch(value);
		}
	}
	/*
	* Getter & Setter for automatic language selection as per selected language
	*/

	@Input() selectBy: 'code' | 'object' = 'code'

	/*
	* Getter & Setter for dynamic template
	*/
	_template: string;
	get template(): string {
		return this._template;
	}
	@Input() set template(value: string) {
		this._template = value;
	}

	@Output() selectedLanguageEvent = new EventEmitter<ILanguage>();

	// States
	readonly loading = signal(false)

	constructor(
		private readonly languagesService: LanguagesService,
		private readonly store: Store,
		private  cd: ChangeDetectorRef,
	) {
		super();
		this.store.preferredLanguage$
			.pipe(
				filter((preferredLanguage: string) => !!preferredLanguage),
				tap((preferredLanguage: string) => this.selectedLanguageCode = preferredLanguage),
				takeUntilDestroyed(this.destroyRef)
			)
			.subscribe();
	}

	onChangeLanguage(currentSelection: ILanguage) {
		let selectedLanguage: any;
		if (this.selectBy === 'object') {
			selectedLanguage = currentSelection;
		} else {
			selectedLanguage = currentSelection?.code || this.selectedLanguageCode;
		}
		this.selectedLanguageEvent.emit(selectedLanguage);
	}

	onSelectedChange(code: ILanguage['code']) {
		this.cd.detectChanges()
		let selectedLanguage: any;
		if (this.selectBy === 'object') {
			selectedLanguage = this.getLanguageByCode(code);
		} else {
			selectedLanguage = code || this.selectedLanguageCode;
		}
		this.selectedLanguageEvent.emit(selectedLanguage);
	}

	writeValue(value: string) {
		this._selectedLanguageCode = value;
	}

	registerOnChange(fn: any) {
		this.onChange = fn
	}

	registerOnTouched(fn: any) {
		this.onTouch = fn
	}

	addLanguage = async (languageName: string) => {
		const newLanguage: ILanguage = {
			name: languageName,
			color: '#' + Math.floor(Math.random() * 16777215).toString(16),
			description: ''
		};
		this.loading.set(true);
		const language = await this.languagesService.insertLanguage(
			newLanguage
		);
		this.loading.set(false);
		return language;
	};

	async ngOnInit() {
		await this.getAllLanguages();
		if (this.selectBy === 'object') {
			this.checkPreFilledLanguage()
		}
	}

	async getAllLanguages() {
		const { items } = await this.languagesService.getAllLanguages();
		this.languages.set(items)
	}

	checkPreFilledLanguage() {
		if (!this.selectedLanguageCode) {
			return;
		}
		if (this.languages()?.length > 0) {
			const selectedLanguage = this.getLanguageByCode(this.selectedLanguageCode);
			this.onChangeLanguage(selectedLanguage);
		}
	}

	getLanguageByCode(code: ILanguage['code']) {
		return this.languages().find(
			(language: ILanguage) => code === language.code
		);
	}
}
