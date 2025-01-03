/**
 * Check is function .
 * @param item
 * @returns {boolean}
 */
export function isFunction(item: any): boolean {
	if (isEmpty(item)) {
		return false;
	}
	return typeof item === 'function';
}

/**
 * Check is object.
 * @param item
 * @returns {boolean}
 */
export function isObject(item: any): boolean {
	if (isEmpty(item)) {
		return false;
	}
	return typeof item === 'object';
}

/**
 * Check is object or function.
 * @param item
 * @returns {boolean}
 */
export function isObjectOrFunction(item: any): boolean {
	if (isEmpty(item)) {
		return false;
	}
	return isFunction(item) || isObject(item);
}

/**
 * Check is class instance.
 * @param item
 * @returns {boolean}
 */
export function isClassInstance(item: any): boolean {
	return isObject(item) && item.constructor.name !== 'Object';
}

/**
 * Check value not empty.
 * @param item
 * @returns {boolean}
 */
export function isNotEmpty(item: any): boolean {
	return !isEmpty(item);
}

/**
 * Check value empty.
 * @param item
 * @returns {boolean}
 */
export function isEmpty(item: any) {
	if (item instanceof Array) {
		item = item.filter((val) => !isEmpty(val));
		return item.length === 0;
	} else if (item && typeof item === 'object') {
		for (var key in item) {
			if (
				item[key] === null ||
				item[key] === undefined ||
				item[key] === ''
			) {
				delete item[key];
			}
		}
		return Object.keys(item).length === 0;
	} else {
		return (
			!item ||
			(item + '').toLocaleLowerCase() === 'null' ||
			(item + '').toLocaleLowerCase() === 'undefined'
		);
	}
}

export function isJsObject(object: any) {
	return (
		object !== null && object !== undefined && typeof object === 'object'
	);
}

/*
 * Get average value column in array object
 */
export function average(items: any, column: string) {
	let sum = 0;
	if (items.length > 0) {
		items.forEach((item) => {
			sum += parseFloat(item[column]);
		});
	}
	return sum / items.length;
}

export const ArraySum = function (t, n) {
	return parseFloat(t) + parseFloat(n);
};


/**
 * Converts a given input into a boolean value.
 * If the input is `undefined` or `null`, it returns `false`.
 *
 * @param value - The input to convert to a boolean.
 * @returns {boolean} - A boolean representation of the given input.
 */
export const parseToBoolean = (value: any): boolean => {
    if (value === undefined || value === null) {
        return false; // Return false for undefined or null
    }

    try {
        const parsed = JSON.parse(value); // Attempt to parse as JSON
        if (typeof parsed === 'boolean') {
            return parsed; // Return if it's already a boolean
        }

        // Convert numbers: 0 is false, other numbers are true
        if (typeof parsed === 'number') {
            return parsed !== 0;
        }

        // Convert common truthy/falsy strings
        if (typeof parsed === 'string') {
            const lowerCase = parsed.toLowerCase().trim();
            return lowerCase === 'true' || lowerCase === '1'; // Consider 'true' and '1' as true
        }

        return Boolean(parsed); // Fallback to Boolean conversion
    } catch (error) {
        // Handle JSON parse errors
        return false; // Return false on parsing errors
    }
};

/**
 * Remove duplicates from an array
 *
 * @param data
 * @returns
 */
export function removeDuplicates(data: string[]) {
	return [...new Set(data)];
}