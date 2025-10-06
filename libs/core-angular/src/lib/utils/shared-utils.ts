import { HttpParams } from '@angular/common/http';

/**
 * Check string is null or undefined
 * From https://github.com/typeorm/typeorm/issues/873#issuecomment-502294597
 *
 * @param obj
 * @returns
 */
export function isNullOrUndefined<T>(value: T | null | undefined): value is null | undefined {
	return value === undefined || value === null;
}

/**
 * Checks if a value is not null or undefined.
 * @param value The value to be checked.
 * @returns true if the value is not null or undefined, false otherwise.
 */
export function isNotNullOrUndefined<T>(value: T | undefined | null): value is T {
	return value !== undefined && value !== null;
}

/**
 * Check if a value is null, undefined, or an empty string.
 * @param value The value to check.
 * @returns true if the value is null, undefined, or an empty string, false otherwise.
 */
export function isNotNullOrUndefinedOrEmpty<T>(value: T | undefined | null): boolean {
	return isNotNullOrUndefined(value) && value !== '';
}

// It will use for pass nested object or array in query params in get method.
export function toParams(query: any) {
	let params: HttpParams = new HttpParams();
	Object.keys(query).forEach((key) => {
		if (isObject(query[key])) {
			params = toSubParams(params, key, query[key]);
		} else {
			params = params.append(key.toString(), query[key]);
		}
	});
	return params;
}

/**
 * Checks if the given value is a JavaScript object.
 * @param object The value to check.
 * @returns `true` if the value is a JavaScript object, `false` otherwise.
 */
export function isObject(object: any): boolean {
	return object !== null && object !== undefined && typeof object === 'object';
}

// /**
//  * Check value not empty.
//  * @param item
//  * @returns {boolean}
//  */
// export function isNotEmpty(item: any): boolean {
// 	return !isEmpty(item);
// }

// /**
//  * Check value empty.
//  * @param item
//  * @returns {boolean}
//  */
// export function isEmpty(item: any): boolean {
// 	if (item instanceof Array) {
// 		item = item.filter((val) => !isEmpty(val));
// 		return item.length === 0;
// 	} else if (item && typeof item === 'object') {
// 		for (const key in item) {
// 			if (item[key] === null || item[key] === undefined || item[key] === '') {
// 				delete item[key];
// 			}
// 		}
// 		return Object.keys(item).length === 0;
// 	} else {
// 		return !item || (item + '').toLocaleLowerCase() === 'null' || (item + '').toLocaleLowerCase() === 'undefined';
// 	}
// }

function toSubParams(params: HttpParams, key: string, object: any) {
	Object.keys(object).forEach((childKey) => {
		if (isObject(object[childKey])) {
			params = toSubParams(params, `${key}[${childKey}]`, object[childKey]);
		} else {
			params = params.append(`${key}[${childKey}]`, object[childKey]);
		}
	});

	return params;
}

// It will use when file uploading from angular, just pass object of with file it will convert it to from data
export function toFormData(obj: any, form?: any, namespace?: any) {
	const fd = form || new FormData();
	let formKey;
	for (const property in obj) {
		if (obj.hasOwnProperty(property) && obj[property]) {
			if (namespace) {
				formKey = namespace + '[' + property + ']';
			} else {
				formKey = property;
			}

			// if the property is an object, but not a File, use recursively.
			if (obj[property] instanceof Date) {
				fd.append(formKey, obj[property].toISOString());
			} else if (typeof obj[property] === 'object' && !(obj[property] instanceof File)) {
				toFormData(obj[property], fd, formKey);
			} else {
				// if it's a string or a File object
				fd.append(formKey, obj[property]);
			}
		}
	}
	return fd;
}
