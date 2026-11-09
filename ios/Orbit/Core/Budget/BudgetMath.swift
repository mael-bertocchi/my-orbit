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
}
