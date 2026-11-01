/**
 * @function readList
 * @description The values of a filter in the address, which repeats its name for each value, as in
 * `year=2025&year=2024`; none when it is absent
 *
 * @param {URLSearchParams} params The address's parameters
 * @param {string} key The filter's name
 * @returns {string[]} Its values, in the order written
 */
export function readList(params: URLSearchParams, key: string): string[] {
    return params.getAll(key).filter((value) => value !== '');
}

/**
 * @function writeList
 * @description The address's parameters with a filter's values, its name repeated for each, the filter taken out when
 * it has none
 *
 * @param {URLSearchParams} params The address's parameters
 * @param {string} key The filter's name
 * @param {readonly string[]} values Its values
 * @returns {URLSearchParams} The new parameters
 */
export function writeList(params: URLSearchParams, key: string, values: readonly string[]): URLSearchParams {
    const next = new URLSearchParams(params);

    next.delete(key);

    for (const value of values) {
        next.append(key, value);
    }

    return next;
}

/**
 * @function toggled
 * @description A choice of filters with one value picked, or put back when it already was
 *
 * @param {readonly string[]} values The values picked
 * @param {string} value The value tapped
 * @returns {string[]} The values now picked
 */
export function toggled(values: readonly string[], value: string): string[] {
    return values.includes(value) ? values.filter((existing) => existing !== value) : [...values, value];
}
