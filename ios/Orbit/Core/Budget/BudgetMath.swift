import Foundation

/**
 * @class CategorySpend
 * @description A category against its limit in one month
 */
struct CategorySpend: Identifiable, Equatable {
    var category: Category /*!< The category */
    var spent: Double /*!< What was spent in it, in euros */
    var limit: Double /*!< Its limit for the month */

    var id: String { category.id } /*!< Its identifier, the category's */
    var isOverBudget: Bool { spent > limit && limit > 0 } /*!< Whether more than the limit was spent */

    /**
     * @method progress
     * @description How much of the limit is spent, between 0 and 1; full when something was spent without a limit
     */
    var progress: Double {
        guard limit > 0 else {
            return spent > 0 ? 1 : 0
        }
        return min(1, spent / limit)
    }
}

/**
 * @class MonthSummary
 * @description A month's main figures
 */
struct MonthSummary: Equatable {
    var limit: Double /*!< The month's budget */
    var spent: Double /*!< What was spent, in euros */
    var daysLeft: Int /*!< The days left in the month, today included */

    var left: Double { limit - spent } /*!< What is left to spend, negative once overspent */

    /**
     * @method progress
     * @description How much of the budget is spent, between 0 and 1
     */
    var progress: Double {
        guard limit > 0 else {
            return spent > 0 ? 1 : 0
        }
        return min(1, max(0, spent / limit))
    }

    /**
     * @method perDay
     * @description What is left to spend per remaining day
     */
    var perDay: Double {
        guard daysLeft > 0 else {
            return 0
        }
        return max(0, left) / Double(daysLeft)
    }
}

/**
 * @class DayGroup
 * @description The operations of one day, for History
 */
struct DayGroup: Identifiable, Equatable {
    var date: Date /*!< The day, at midnight */
    var operations: [Operation] /*!< Its operations, latest first */

    var id: Date { date } /*!< Its identifier, the day */

    /**
     * @method spent
     * @description What the day spent, in euros
     */
    var spent: Double {
        operations.reduce(0) { $0 + $1.euroAmount }
    }
}

/**
 * @type BudgetMath
 * @description The budget's arithmetic, as pure functions of the operations and the budget: months, days left, totals
 * and groups
 */
enum BudgetMath {

    /**
     * @method calendar
     * @description The calendar months are measured in, weeks starting on Monday
     */
    static var calendar: Calendar {
        var calendar = Calendar.current
        calendar.firstWeekday = 2
        return calendar
    }

    /**
     * @method monthKey
     * @description A month's key, as `YYYY-MM`
     *
     * @param date Any day of the month
     * @returns The key
     */
    static func monthKey(_ date: Date) -> String {
        let components = calendar.dateComponents([.year, .month], from: date)
        return String(format: "%04d-%02d", components.year ?? 0, components.month ?? 0)
    }

    /**
     * @method monthStart
     * @description The first day of a date's month
     *
     * @param date The date
     * @returns The month's first day, at midnight
     */
    static func monthStart(_ date: Date) -> Date {
        calendar.date(from: calendar.dateComponents([.year, .month], from: date)) ?? date
    }

    /**
     * @method shiftMonth
     * @description The first day of a month before or after
     *
     * @param date Any day of the starting month
     * @param months How many months to move, negative to go back
     * @returns The first day of that month
     */
    static func shiftMonth(_ date: Date, by months: Int) -> Date {
        calendar.date(byAdding: .month, value: months, to: monthStart(date)) ?? date
    }

    /**
     * @method isSameMonth
     * @description Whether two dates fall in the same month
     *
     * @param lhs One date
     * @param rhs The other
     * @returns Whether they do
     */
    static func isSameMonth(_ lhs: Date, _ rhs: Date) -> Bool {
        calendar.isDate(lhs, equalTo: rhs, toGranularity: .month)
    }

    /**
     * @method isPastMonth
     * @description Whether a month is over: it keeps a budget of its own, while the current month and the next ones
     * share the live one
     *
     * @param month Any day of the month
     * @param now The current date
     * @returns Whether it is over
     */
    static func isPastMonth(_ month: Date, now: Date = .now) -> Bool {
        monthStart(month) < monthStart(now)
    }

    /**
     * @method operations
     * @description The operations of one month
     *
     * @param operations Every operation
     * @param month Any day of the month
     * @returns The month's operations
     */
    static func operations(_ operations: [Operation], in month: Date) -> [Operation] {
        operations.filter { isSameMonth($0.date, month) }
    }

    /**
     * @method daysLeft
     * @description The days left in a month, today included: all of them for a future month, none for a past one
     *
     * @param month Any day of the month
     * @param now The current date
     * @returns How many days are left
     */
    static func daysLeft(in month: Date, now: Date = .now) -> Int {
        guard let range = calendar.range(of: .day, in: .month, for: month) else {
            return 0
        }
        let total = range.count
        if isSameMonth(month, now) {
            let today = calendar.component(.day, from: now)
            return max(0, total - today + 1)
        }
        return month < monthStart(now) ? 0 : total
    }

    /**
     * @method summary
     * @description A month's main figures
     *
     * @param operations Every operation
     * @param month Any day of the month
     * @param budget The month's budget
     * @param now The current date
     * @returns The figures
     */
    static func summary(
        operations: [Operation],
        month: Date,
        budget: MonthlyBudget,
        now: Date = .now
    ) -> MonthSummary {
        let spent = self.operations(operations, in: month).reduce(0) { $0 + $1.euroAmount }
        return MonthSummary(
            limit: budget.monthlyLimit,
            spent: spent,
            daysLeft: daysLeft(in: month, now: now)
        )
    }

    /**
     * @method categorySpends
     * @description Every category against its limit in one month
     *
     * @param operations Every operation
     * @param categories The categories
     * @param month Any day of the month
     * @param budget The month's budget
     * @returns The categories' spending
     */
    static func categorySpends(
        operations: [Operation],
        categories: [Category],
        month: Date,
        budget: MonthlyBudget
    ) -> [CategorySpend] {
        var totals: [String: Double] = [:]
        for operation in self.operations(operations, in: month) {
            totals[operation.categoryId, default: 0] += operation.euroAmount
        }
        return categories.map {
            CategorySpend(category: $0, spent: totals[$0.id] ?? 0, limit: budget.limit(for: $0.id))
        }
    }

    /**
     * @method allocatedLimits
     * @description The sum of the categories' limits
     *
     * @param categories The categories
     * @param budget The budget holding their limits
     * @returns The sum
     */
    static func allocatedLimits(categories: [Category], budget: MonthlyBudget) -> Double {
        categories.reduce(0) { $0 + budget.limit(for: $1.id) }
    }

    /**
     * @method toDispatch
     * @description What the monthly budget leaves once every limit is taken out
     *
     * @param categories The categories
     * @param budget The budget
     * @returns What is left, negative when the limits exceed it
     */
    static func toDispatch(categories: [Category], budget: MonthlyBudget) -> Double {
        budget.monthlyLimit - allocatedLimits(categories: categories, budget: budget)
    }

    /**
     * @method dayGroups
     * @description The operations grouped by day, latest day first
     *
     * @param operations The operations
     * @returns The days
     */
    static func dayGroups(_ operations: [Operation]) -> [DayGroup] {
        let grouped = Dictionary(grouping: operations) { calendar.startOfDay(for: $0.date) }
        return grouped
            .map { DayGroup(date: $0.key, operations: $0.value.sorted { $0.date > $1.date }) }
            .sorted { $0.date > $1.date }
    }

    /**
     * @method fold
     * @description Reduces a text for matching what is typed against it: trimmed, regardless of case and accents
     *
     * @param text The text
     * @returns The text reduced
     */
    static func fold(_ text: String) -> String {
        text.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil).trimmingCharacters(in: .whitespaces)
    }

    /**
     * @method matchRank
     * @description How well a text matches what is typed, already folded: 2 when it starts with it, 1 when one of its
     * other words does, 0 when it doesn't match
     *
     * @param text The text
     * @param typed What is typed, folded
     * @returns The rank
     */
    static func matchRank(_ text: String, typed: String) -> Int {
        let folded = fold(text)
        if folded.hasPrefix(typed) {
            return 2
        }
        let words = folded.split { $0.isWhitespace || "'’-".contains($0) }
        return words.contains { $0.hasPrefix(typed) } ? 1 : 0
    }

    /**
     * @class NameUse
     * @description How an operation name has been used, to rank it among the suggestions
     */
    private struct NameUse {
        var name: String /*!< The name, as last written */
        var rank: Int /*!< How well it matches what is typed */
        var count: Int /*!< How many operations bear it */
        var latest: Date /*!< When it was last used */
    }

    /**
     * @method nameSuggestions
     * @description The names of earlier operations matching what is typed, each once as last written, the best match, the
     * most used and the latest first. The name typed in full is left out: there is nothing left to complete
     *
     * @param operations The earlier operations
     * @param typed What is typed
     * @param limit How many to suggest at most
     * @returns The names
     */
    static func nameSuggestions(_ operations: [Operation], typed: String, limit: Int = 5) -> [String] {
        let folded = fold(typed)
        guard !folded.isEmpty else {
            return []
        }

        var uses: [String: NameUse] = [:]
        for operation in operations {
            let key = fold(operation.name)
            let rank = matchRank(operation.name, typed: folded)
            guard key != folded, rank > 0 else {
                continue
            }
            guard var use = uses[key] else {
                uses[key] = NameUse(name: operation.name.trimmingCharacters(in: .whitespaces), rank: rank, count: 1, latest: operation.date)
                continue
            }
            use.count += 1
            if operation.date > use.latest {
                use.latest = operation.date
                use.name = operation.name.trimmingCharacters(in: .whitespaces)
            }
            uses[key] = use
        }

        let ranked = uses.values.sorted { ($0.rank, $0.count, $0.latest) > ($1.rank, $1.count, $1.latest) }
        return ranked.prefix(limit).map(\.name)
    }

    /**
     * @method locationSuggestions
     * @description The places of earlier operations matching what is typed, each once as last written, the best match
     * first, then the most recent. The place typed in full is left out
     *
     * @param operations The earlier operations
     * @param typed What is typed
     * @param limit How many to suggest at most
     * @returns The places
     */
    static func locationSuggestions(_ operations: [Operation], typed: String, limit: Int = 3) -> [String] {
        let folded = fold(typed)
        guard !folded.isEmpty else {
            return []
        }

        var seen: Set<String> = [folded]
        var matching: [(location: String, rank: Int)] = []
        for operation in operations.sorted(by: { $0.date > $1.date }) {
            let location = (operation.location ?? "").trimmingCharacters(in: .whitespaces)
            let key = fold(location)
            let rank = matchRank(location, typed: folded)
            guard !key.isEmpty, rank > 0, seen.insert(key).inserted else {
                continue
            }
            matching.append((location, rank))
        }

        let ranked = matching.enumerated().sorted { ($0.element.rank, -$0.offset) > ($1.element.rank, -$1.offset) }
        return ranked.prefix(limit).map(\.element.location)
    }
}
