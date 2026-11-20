import type { PlaceReference } from 'src/modules/budget/places/places-models';
import type { OperationRow } from 'src/modules/budget/places/places-service';
import { placeReferenceOf } from 'src/modules/budget/places/places-service';
import type { Maybe } from 'src/shared/models';

/**
 * @constant REFERENCE_MONTHS
 * @description How many past months "usual" is measured on, at most.
 */
const REFERENCE_MONTHS = 6;

/**
 * @constant TREND_MONTHS
 * @description How many months the trends cover, the current one included.
 */
const TREND_MONTHS = 12;

/**
 * @constant HABIT_DAYS
 * @description How many days back the habits are measured on.
 */
const HABIT_DAYS = 90;

/**
 * @constant TOP_PLACES
 * @description How many places the habits list.
 */
const TOP_PLACES = 5;

/**
 * @constant WORD_SEPARATORS
 * @description What separates the words of a name or a place, so a suggestion matches from any of its words.
 */
const WORD_SEPARATORS = /[\s'’-]+/u;

/**
 * @interface Spending
 * @description Euros spent, in all and per category id.
 */
export interface Spending {
    spent: number; /*!< Euros spent */
    byCategory: Record<string, number>; /*!< Euros spent per category id */
}

/**
 * @interface MonthComparison
 * @description The current month so far against what the reference months usually had by the same day.
 */
export interface MonthComparison {
    referenceCount: number; /*!< How many past months "usual" is measured on, 0 without history */
    current: Spending; /*!< What the current month spent so far */
    usual: Spending; /*!< What the reference months usually spent by the same day */
}

/**
 * @interface MonthTotal
 * @description What a month spent, in all and per category.
 */
export interface MonthTotal extends Spending {
    month: string; /*!< The month, as `YYYY-MM` */
    isCurrent: boolean; /*!< Whether it is the current month, still under way */
}

/**
 * @interface WeekdaySpend
 * @description What a weekday usually costs.
 */
export interface WeekdaySpend {
    weekday: number; /*!< The weekday, 0 for Sunday */
    average: number; /*!< Euros spent on such a day, on average */
}

/**
 * @interface PlaceSpend
 * @description Where money goes, place by place.
 */
export interface PlaceSpend {
    place: Maybe<PlaceReference>; /*!< The city, as last chosen, if any */
    location: Maybe<string>; /*!< The place as last written, for an operation logged before cities were checked */
    spent: number; /*!< Euros spent there */
    count: number; /*!< How many operations */
}

/**
 * @interface SpendingHabits
 * @description How the recent spending is spread, recurring operations left out.
 */
export interface SpendingHabits {
    since: string; /*!< The first day measured, as `YYYY-MM-DD` */
    weekdays: WeekdaySpend[]; /*!< Each weekday, Monday first */
    online: number; /*!< Euros spent online */
    inPerson: number; /*!< Euros spent in person */
    places: PlaceSpend[]; /*!< The places most spent at, the largest first */
}

/**
 * @function euroAmount
 * @description An operation's amount in euros.
 */
export function euroAmount(row: Pick<OperationRow, 'amount' | 'rateToEuro'>): number {
    return row.amount * row.rateToEuro;
}

/**
 * @function monthOf
 * @description The month of a day, as `YYYY-MM`.
 */
export function monthOf(day: string): string {
    return day.slice(0, 7);
}

/**
 * @function shiftMonth
 * @description The month a number of months after another, as `YYYY-MM`.
 */
export function shiftMonth(month: string, months: number): string {
    const [year = 1970, index = 1] = month.split('-').map(Number);

    return new Date(Date.UTC(year, index - 1 + months, 1)).toISOString().slice(0, 7);
}

/**
 * @function shiftDay
 * @description The day a number of days after another, as `YYYY-MM-DD`.
 */
export function shiftDay(day: string, days: number): string {
    const date = new Date(`${day}T00:00:00.000Z`);

    date.setUTCDate(date.getUTCDate() + days);

    return date.toISOString().slice(0, 10);
}

/**
 * @function weekdayOf
 * @description The weekday of a day, 0 for Sunday.
 */
function weekdayOf(day: string): number {
    return new Date(`${day}T00:00:00.000Z`).getUTCDay();
}

/**
 * @function dayOfMonth
 * @description The day of the month of a day, from 1.
 */
function dayOfMonth(day: string): number {
    return Number(day.slice(8, 10));
}

/**
 * @function spendingOf
 * @description What operations spent, in all and per category, each divided by a number of months to give an average.
 */
export function spendingOf(rows: readonly Pick<OperationRow, 'amount' | 'rateToEuro' | 'categoryId'>[], divisor: number = 1): Spending {
    const byCategory: Record<string, number> = {};
    let spent = 0;

    for (const row of rows) {
        byCategory[row.categoryId] = (byCategory[row.categoryId] ?? 0) + euroAmount(row) / divisor;
        spent += euroAmount(row) / divisor;
    }

    return { spent, byCategory };
}

/**
 * @function compareMonth
 * @description The current month so far against the same point of the reference months, the latest six past months
 * holding operations: by today's day of the month, or by their last day when they are shorter. Comparing at the same
 * day keeps a rent paid on the 1st, or a month only half gone, from reading as a rise or a fall.
 *
 * @param {readonly OperationRow[]} rows Every operation in the budget.
 * @param {string} today The owner's day, as `YYYY-MM-DD`.
 *
 * @returns {MonthComparison} The comparison.
 */
export function compareMonth(rows: readonly Pick<OperationRow, 'day' | 'amount' | 'rateToEuro' | 'categoryId'>[], today: string): MonthComparison {
    const month = monthOf(today);
    const byToday = dayOfMonth(today);
    const references = new Set([...new Set(rows.map((row) => monthOf(row.day)).filter((key) => key < month))].sort().reverse().slice(0, REFERENCE_MONTHS));
    const current = rows.filter((row) => monthOf(row.day) === month && dayOfMonth(row.day) <= byToday);
    const past = rows.filter((row) => references.has(monthOf(row.day)) && dayOfMonth(row.day) <= byToday);

    return { referenceCount: references.size, current: spendingOf(current), usual: spendingOf(past, Math.max(1, references.size)) };
}

/**
 * @function monthTotals
 * @description What each of the last twelve months spent, in all and per category, the oldest first. The months before
 * the first operation are left out.
 *
 * @param {readonly OperationRow[]} rows Every operation in the budget.
 * @param {string} today The owner's day, as `YYYY-MM-DD`.
 *
 * @returns {MonthTotal[]} The months.
 */
export function monthTotals(rows: readonly Pick<OperationRow, 'day' | 'amount' | 'rateToEuro' | 'categoryId'>[], today: string): MonthTotal[] {
    const current = monthOf(today);
    const earliest = rows.reduce((first, row) => (monthOf(row.day) < first ? monthOf(row.day) : first), current);
    const oldest = shiftMonth(current, 1 - TREND_MONTHS);
    const totals: MonthTotal[] = [];

    for (let month = earliest > oldest ? earliest : oldest; month <= current; month = shiftMonth(month, 1)) {
        totals.push({ month, isCurrent: month === current, ...spendingOf(rows.filter((row) => monthOf(row.day) === month)) });
    }

    return totals;
}

/**
 * @function placeKeyOf
 * @description What tells one place from another: its city, else the place as written, regardless of case. Empty when
 * the operation names no place.
 */
function placeKeyOf(row: OperationRow): string {
    return row.placeId ?? row.location?.trim().toLowerCase() ?? '';
}

/**
 * @function spendingHabits
 * @description How the last ninety days were spent, recurring operations left out: what each weekday costs on average,
 * the share paid online, and the places most spent at, each named as last written.
 *
 * @param {readonly OperationRow[]} rows Every operation in the budget.
 * @param {string} today The owner's day, as `YYYY-MM-DD`.
 *
 * @returns {SpendingHabits} The habits.
 */
export function spendingHabits(rows: readonly OperationRow[], today: string): SpendingHabits {
    const since = shiftDay(today, 1 - HABIT_DAYS);
    const operations = rows.filter((row) => row.recurringId === null && row.day >= since && row.day <= today).sort((left, right) => `${left.day} ${left.time}`.localeCompare(`${right.day} ${right.time}`));
    const totals = Array.from({ length: 7 }, () => 0);
    const counts = Array.from({ length: 7 }, () => 0);
    const places = new Map<string, PlaceSpend>();

    for (let day = since; day <= today; day = shiftDay(day, 1)) {
        counts[weekdayOf(day)] = (counts[weekdayOf(day)] ?? 0) + 1;
    }

    for (const row of operations) {
        const key = placeKeyOf(row);

        totals[weekdayOf(row.day)] = (totals[weekdayOf(row.day)] ?? 0) + euroAmount(row);

        if (!row.isOnline && key !== '') {
            const known = places.get(key);

            places.set(key, { place: placeReferenceOf(row.place), location: row.location, spent: (known?.spent ?? 0) + euroAmount(row), count: (known?.count ?? 0) + 1 });
        }
    }

    const weekdays = [1, 2, 3, 4, 5, 6, 0].map((weekday) => ({ weekday, average: (totals[weekday] ?? 0) / Math.max(1, counts[weekday] ?? 0) }));
    const online = operations.filter((row) => row.isOnline).reduce((total, row) => total + euroAmount(row), 0);
    const inPerson = operations.filter((row) => !row.isOnline).reduce((total, row) => total + euroAmount(row), 0);

    return { since, weekdays, online, inPerson, places: [...places.values()].sort((left, right) => right.spent - left.spent).slice(0, TOP_PLACES) };
}

/**
 * @function foldText
 * @description Reduces a text for matching what is typed against it: trimmed, in lower case and without accents.
 */
export function foldText(text: string): string {
    return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

/**
 * @function rankMatch
 * @description How well a text matches what is typed, already folded: 2 when it starts with it, 1 when one of its other
 * words does, 0 when it doesn't match.
 */
export function rankMatch(text: string, typed: string): number {
    const folded = foldText(text);

    if (folded.startsWith(typed)) {
        return 2;
    }

    return folded.split(WORD_SEPARATORS).some((word) => word.startsWith(typed)) ? 1 : 0;
}

/**
 * @interface NameUse
 * @description How an operation name has been used, to rank it among the suggestions.
 */
interface NameUse {
    name: string; /*!< The name, as last written */
    rank: number; /*!< How well it matches what is typed */
    count: number; /*!< How many operations bear it */
    latest: string; /*!< When it was last used, as `YYYY-MM-DD HH:MM` */
}

/**
 * @function compareNameUses
 * @description Orders the names suggested: the best match first, then the most used, then the latest.
 */
function compareNameUses(left: NameUse, right: NameUse): number {
    return right.rank - left.rank || right.count - left.count || right.latest.localeCompare(left.latest);
}

/**
 * @function nameSuggestions
 * @description The names of earlier operations matching what is typed, each once as last written, the best match, the
 * most used and the latest first. The name typed in full is left out: there is nothing left to complete.
 *
 * @param {readonly OperationRow[]} rows Every operation in the budget.
 * @param {string} typed What is typed.
 * @param {number} limit How many names to suggest.
 *
 * @returns {string[]} The names.
 */
export function nameSuggestions(rows: readonly Pick<OperationRow, 'name' | 'day' | 'time'>[], typed: string, limit: number = 5): string[] {
    const folded = foldText(typed);
    const uses = new Map<string, NameUse>();

    if (folded === '') {
        return [];
    }

    for (const row of rows) {
        const key = foldText(row.name);
        const rank = rankMatch(row.name, folded);
        const time = `${row.day} ${row.time}`;
        const known = uses.get(key);

        if (key === folded || rank === 0) {
            continue;
        }

        if (known === undefined) {
            uses.set(key, { name: row.name.trim(), rank, count: 1, latest: time });
            continue;
        }

        known.count += 1;

        if (time > known.latest) {
            known.latest = time;
            known.name = row.name.trim();
        }
    }

    return [...uses.values()].sort(compareNameUses).slice(0, limit).map((use) => use.name);
}

/**
 * @function placeMatch
 * @description How well a city matches what is typed, already folded, under either of its names: 0 when neither matches,
 * and also when one is typed in full, as there is nothing left to complete.
 */
function placeMatch(place: PlaceReference, typed: string): number {
    if (foldText(place.nameEn) !== typed && foldText(place.nameFr) !== typed) {
        return Math.max(rankMatch(place.nameEn, typed), rankMatch(place.nameFr, typed));
    }

    return 0;
}

/**
 * @function recentPlaces
 * @description The cities operations took place in, most recent first and each only once.
 *
 * @param {readonly OperationRow[]} rows Every operation in the budget, the latest first.
 *
 * @returns {PlaceReference[]} The cities.
 */
function recentPlaces(rows: readonly OperationRow[]): PlaceReference[] {
    const places = new Map<string, PlaceReference>();

    for (const row of rows) {
        const place = placeReferenceOf(row.place);

        if (place !== null && !places.has(place.id)) {
            places.set(place.id, place);
        }
    }

    return [...places.values()];
}

/**
 * @function placeSuggestions
 * @description The cities of earlier operations matching what is typed, under either of their names, the best match
 * first, then the most recent.
 *
 * @param {readonly OperationRow[]} rows Every operation in the budget, the latest first.
 * @param {string} typed What is typed.
 * @param {number} limit How many cities to suggest.
 *
 * @returns {PlaceReference[]} The cities.
 */
export function placeSuggestions(rows: readonly OperationRow[], typed: string, limit: number = 3): PlaceReference[] {
    const folded = foldText(typed);

    if (folded === '') {
        return [];
    }

    const matching = recentPlaces(rows).filter((place) => placeMatch(place, folded) > 0);

    return matching.sort((left, right) => placeMatch(right, folded) - placeMatch(left, folded)).slice(0, limit);
}

/**
 * @function latestPlace
 * @description The city of the most recent in-person operation that has one, to suggest it for the next one.
 *
 * @param {readonly OperationRow[]} rows Every operation in the budget, the latest first.
 *
 * @returns {Maybe<PlaceReference>} The city, if any.
 */
export function latestPlace(rows: readonly OperationRow[]): Maybe<PlaceReference> {
    const latest = rows.find((row) => !row.isOnline && row.place !== null);

    return latest !== undefined ? placeReferenceOf(latest.place) : null;
}
