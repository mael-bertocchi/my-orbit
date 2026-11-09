import Foundation

/**
 * @class CategoryComparison
 * @description What one category spent this month so far, against what it usually had by the same day
 */
struct CategoryComparison: Identifiable, Equatable {
    var category: Category /*!< The category */
    var spent: Double /*!< Euros spent this month so far */
    var usual: Double /*!< Euros it usually had by the same day */

    var id: String { category.id } /*!< Its identifier, the category's */
    var change: Double? { BudgetAnalysis.change(spent, from: usual) } /*!< The change as a fraction, nil when it usually spent nothing */
}

/**
 * @class MonthComparison
 * @description The current month so far against the same point of the reference months, in all and per category
 */
struct MonthComparison: Equatable {
    var referenceCount: Int /*!< How many past months "usual" is measured on, 0 without history */
    var spent: Double /*!< Euros spent this month so far */
    var usual: Double /*!< Euros usually spent by the same day */
    var categories: [CategoryComparison] /*!< Each category that spent this month or usually does, the largest rise first */

    var change: Double? { BudgetAnalysis.change(spent, from: usual) } /*!< The change as a fraction, nil when nothing was usually spent */
}

/**
 * @class MonthTotal
 * @description What a month spent, in all and per category, against its budget
 */
struct MonthTotal: Identifiable, Equatable {
    var month: Date /*!< The first day of the month */
    var spent: Double /*!< Euros spent */
    var limit: Double /*!< Its budget */
    var byCategory: [String: Double] /*!< Euros spent per category identifier */
    var isCurrent: Bool /*!< Whether it is the current month, still under way */

    var id: Date { month } /*!< Its identifier, the month */

    /**
     * @method amount
     * @description What the month spent, in all or in one category
     *
     * @param categoryId The category, or nil for all of them
     * @returns The euros spent
     */
    func amount(in categoryId: String?) -> Double {
        guard let categoryId else {
            return spent
        }
        return byCategory[categoryId] ?? 0
    }
}

/**
 * @class RecurringExpense
 * @description An expense that comes back month after month, such as the rent or a subscription
 */
struct RecurringExpense: Identifiable, Equatable {
    var name: String /*!< Its name, as last logged */
    var category: Category /*!< Its category */
    var monthly: Double /*!< What it usually costs a month, in euros */
    var months: Int /*!< In how many of the recent months it came back */
    var lastDate: Date /*!< When it was last paid */

    var id: String { category.id + "|" + name } /*!< Its identifier, by category and name */
    var yearly: Double { monthly * 12 } /*!< What it comes to over a year */
}

/**
 * @class WeekdaySpend
 * @description What a weekday usually costs
 */
struct WeekdaySpend: Identifiable, Equatable {
    var weekday: Int /*!< The weekday, 1 for Sunday like the calendar's */
    var average: Double /*!< Euros spent on such a day, on average */

    var id: Int { weekday } /*!< Its identifier, the weekday */
}

/**
 * @class PlaceSpend
 * @description Where money goes, place by place
 */
struct PlaceSpend: Identifiable, Equatable {
    var name: String /*!< The place, as last written */
    var spent: Double /*!< Euros spent there */
    var count: Int /*!< How many operations */
    var lastDate: Date /*!< When it was last spent at, which picks the spelling kept */

    var id: String { name.lowercased() } /*!< Its identifier, the name in lowercase */
}

/**
 * @class SpendingHabits
 * @description How the recent spending is spread: over the weekdays, online and in person, and over the places. Recurring
 * operations are left out, since they say nothing of habits
 */
struct SpendingHabits: Equatable {
    var since: Date /*!< The first day measured */
    var weekdays: [WeekdaySpend] /*!< Each weekday, Monday first */
    var online: Double /*!< Euros spent online */
    var inPerson: Double /*!< Euros spent in person */
    var places: [PlaceSpend] /*!< The places most spent at, the largest first */

    var total: Double { online + inPerson } /*!< Euros spent in all */
    var onlineShare: Double { total > 0 ? online / total : 0 } /*!< The share spent online, between 0 and 1 */
}

/**
 * @type BudgetAnalysis
 * @description The budget's analysis, as pure functions of the budget, the same as the web's: where the month is heading
 * and how it compares with the usual spending at the same point, for the Budget tab; and, for the Analysis tab, how the
 * spending moved over the last year, the expenses that come back every month, and the recent habits
 */
enum BudgetAnalysis {
    /**
     * @constant referenceLimit
     * @description How many past months "usual" is measured on, at most
     */
    static let referenceLimit = 6
    /**
     * @constant notableChange
     * @description How far a category must stray from its usual spending, as a fraction, for the change to be worth showing
     */
    static let notableChange = 0.15
    /**
     * @constant notableAmount
     * @description How many euros a category must stray from its usual spending for the change to be worth showing, so a
     * coffee more never reads as a rise
     */
    static let notableAmount = 10.0
    /**
     * @constant trendMonths
     * @description How many months the trends cover, the current one included
     */
    static let trendMonths = 12
    /**
     * @constant recurringWindow
     * @description How many months back a repeated expense is looked for, the current one included
     */
    static let recurringWindow = 7
    /**
     * @constant recurringMinMonths
     * @description In how many distinct months an expense must come back to read as recurring without being marked so
     */
    static let recurringMinMonths = 3
    /**
     * @constant recurringSpread
     * @description How far a month's amount may stray from the usual one, as a fraction, for an expense to still read as
     * the same one coming back
     */
    static let recurringSpread = 0.25
    /**
     * @constant habitDays
     * @description How many days back the habits are measured on
     */
    static let habitDays = 90
    /**
     * @constant topPlaces
     * @description How many places the habits list
     */
    static let topPlaces = 5
    /**
     * @constant weekdayOrder
     * @description The weekdays in the calendar's numbering, Monday first
     */
    static let weekdayOrder = [2, 3, 4, 5, 6, 7, 1]

    /**
     * @method change
     * @description How much a figure moved from its usual value, as a fraction
     *
     * @param spent The figure
     * @param usual Its usual value
     * @returns The change, or nil when the usual value is nothing
     */
    static func change(_ spent: Double, from usual: Double) -> Double? {
        usual > 0 ? spent / usual - 1 : nil
    }

    /**
     * @method day
     * @description A date's day of the month
     *
     * @param date The date
     * @returns The day, from 1
     */
    static func day(of date: Date) -> Int {
        BudgetMath.calendar.component(.day, from: date)
    }

    /**
     * @method referenceMonths
     * @description The past months "usual" is measured on: the latest ones holding operations, before the month and at
     * most six, latest first
     *
     * @param operations Every operation
     * @param month The month measured
     * @returns The first day of each reference month
     */
    static func referenceMonths(_ operations: [Operation], before month: Date) -> [Date] {
        let start = BudgetMath.monthStart(month)
        let months = Set(operations.map { BudgetMath.monthStart($0.date) }.filter { $0 < start })
        return Array(months.sorted(by: >).prefix(referenceLimit))
    }

    /**
     * @method spent
     * @description What operations cost in euros
     *
     * @param operations The operations
     * @returns The total
     */
    static func spent(_ operations: [Operation]) -> Double {
        operations.reduce(0) { $0 + $1.euroAmount }
    }

    /**
     * @method compare
     * @description The current month so far against the same point of the reference months: by today's day, or by
     * their last day when they are shorter. Comparing at the same day keeps a rent paid on the 1st, or a month only half
     * gone, from reading as a rise or a fall
     *
     * @param operations Every operation
     * @param categories The categories
     * @param now The current date
     * @returns The comparison
     */
    static func compare(_ operations: [Operation], categories: [Category], now: Date = .now) -> MonthComparison {
        let month = BudgetMath.monthStart(now)
        let today = day(of: now)
        let references = referenceMonths(operations, before: month)
        let current = BudgetMath.operations(operations, in: month).filter { day(of: $0.date) <= today }
        let past = references.flatMap { BudgetMath.operations(operations, in: $0).filter { day(of: $0.date) <= today } }
        let count = Double(max(1, references.count))

        let rows = categories.map { category in
            CategoryComparison(category: category, spent: spent(current.filter { $0.categoryId == category.id }), usual: spent(past.filter { $0.categoryId == category.id }) / count)
        }
        let shown = rows.filter { $0.spent > 0 || $0.usual > 0 }.sorted { ($0.spent - $0.usual) > ($1.spent - $1.usual) }

        return MonthComparison(referenceCount: references.count, spent: spent(current), usual: spent(past) / count, categories: shown)
    }

    /**
     * @method isNotable
     * @description Whether a category's change from usual is worth showing: it spent something this month, since nothing
     * spent yet only means the month is young, and it strays from usual by at least 15% and 10 euros. One that usually
     * spends nothing counts once it spent 10 euros
     *
     * @param comparison The category, this month and usually
     * @returns Whether to show its change
     */
    static func isNotable(_ comparison: CategoryComparison) -> Bool {
        guard comparison.spent > 0 else {
            return false
        }
        guard let change = comparison.change else {
            return comparison.spent >= notableAmount
        }
        return abs(change) >= notableChange && abs(comparison.spent - comparison.usual) >= notableAmount
    }

    /**
     * @method monthTotals
     * @description What each of the last twelve months spent, in all and per category, against its budget, the oldest
     * first. The months before the first operation are left out
     *
     * @param operations Every operation
     * @param limit The budget of a month
     * @param now The current date
     * @returns The months
     */
    static func monthTotals(_ operations: [Operation], limit: (Date) -> Double, now: Date = .now) -> [MonthTotal] {
        let current = BudgetMath.monthStart(now)
        let earliest = BudgetMath.monthStart(operations.map(\.date).min() ?? now)
        let first = max(earliest, BudgetMath.shiftMonth(current, by: 1 - trendMonths))
        var totals: [MonthTotal] = []
        var month = min(first, current)

        while month <= current {
            let inMonth = BudgetMath.operations(operations, in: month)
            var byCategory: [String: Double] = [:]
            for operation in inMonth {
                byCategory[operation.categoryId, default: 0] += operation.euroAmount
            }
            totals.append(MonthTotal(month: month, spent: spent(inMonth), limit: limit(month), byCategory: byCategory, isCurrent: month == current))
            month = BudgetMath.shiftMonth(month, by: 1)
        }

        return totals
    }

    /**
     * @method median
     * @description The middle value of a list of numbers
     *
     * @param values The numbers
     * @returns Their median, 0 without any
     */
    static func median(_ values: [Double]) -> Double {
        let sorted = values.sorted()
        guard !sorted.isEmpty else {
            return 0
        }
        let middle = sorted.count / 2
        return sorted.count.isMultiple(of: 2) ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
    }

    /**
     * @method recurringExpenses
     * @description The expenses that come back month after month over the last seven months: those marked recurring, and
     * those logged under the same name and category in at least three months for about the same amount. One not paid for
     * two months is taken as stopped
     *
     * @param operations Every operation
     * @param categories The categories
     * @param now The current date
     * @returns The expenses, the costliest over a year first
     */
    static func recurringExpenses(_ operations: [Operation], categories: [Category], now: Date = .now) -> [RecurringExpense] {
        let since = BudgetMath.shiftMonth(BudgetMath.monthStart(now), by: 1 - recurringWindow)
        let stoppedBefore = BudgetMath.shiftMonth(BudgetMath.monthStart(now), by: -1)
        let known = Dictionary(categories.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let recent = operations.filter { $0.date >= since && $0.date <= now }
        let groups = Dictionary(grouping: recent) { $0.categoryId + "|" + $0.name.trimmingCharacters(in: .whitespaces).lowercased() }

        let found = groups.values.compactMap { group -> RecurringExpense? in
            guard let latest = group.max(by: { $0.date < $1.date }), let category = known[latest.categoryId], latest.date >= stoppedBefore else {
                return nil
            }

            let amounts = Array(Dictionary(grouping: group) { BudgetMath.monthKey($0.date) }.values.map { spent($0) })
            let monthly = median(amounts)
            let isSteady = amounts.count >= recurringMinMonths && amounts.allSatisfy { abs($0 - monthly) <= monthly * recurringSpread }
            let isMarked = group.contains(where: \.isRecurring)

            guard isSteady || isMarked else {
                return nil
            }
            return RecurringExpense(name: latest.name, category: category, monthly: monthly, months: amounts.count, lastDate: latest.date)
        }

        return found.sorted { $0.yearly > $1.yearly }
    }

    /**
     * @method spendingHabits
     * @description How the last ninety days were spent, recurring operations left out: what each weekday costs on
     * average, the share paid online, and the places most spent at
     *
     * @param operations Every operation
     * @param now The current date
     * @returns The habits
     */
    static func spendingHabits(_ operations: [Operation], now: Date = .now) -> SpendingHabits {
        let calendar = BudgetMath.calendar
        let today = calendar.startOfDay(for: now)
        let since = calendar.date(byAdding: .day, value: 1 - habitDays, to: today) ?? today
        let recent = operations.filter { !$0.isRecurring && $0.date >= since && $0.date <= now }
        var totals: [Int: Double] = [:]
        var counts: [Int: Int] = [:]
        var places: [String: PlaceSpend] = [:]
        var day = since

        while day <= today {
            counts[calendar.component(.weekday, from: day), default: 0] += 1
            day = calendar.date(byAdding: .day, value: 1, to: day) ?? today.addingTimeInterval(86_400)
        }

        for operation in recent {
            totals[calendar.component(.weekday, from: operation.date), default: 0] += operation.euroAmount

            let location = operation.location?.trimmingCharacters(in: .whitespaces) ?? ""
            guard !operation.isOnline, !location.isEmpty else {
                continue
            }

            let key = location.lowercased()
            let previous = places[key]
            let isLatest = previous.map { operation.date >= $0.lastDate } ?? true
            places[key] = PlaceSpend(name: isLatest ? location : previous?.name ?? location, spent: (previous?.spent ?? 0) + operation.euroAmount, count: (previous?.count ?? 0) + 1, lastDate: isLatest ? operation.date : previous?.lastDate ?? operation.date)
        }

        let weekdays = weekdayOrder.map { WeekdaySpend(weekday: $0, average: (totals[$0] ?? 0) / Double(max(1, counts[$0] ?? 0))) }
        let online = spent(recent.filter(\.isOnline))
        let inPerson = spent(recent.filter { !$0.isOnline })
        let top = Array(places.values.sorted { $0.spent > $1.spent }.prefix(topPlaces))

        return SpendingHabits(since: since, weekdays: weekdays, online: online, inPerson: inPerson, places: top)
    }
}
