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
 * @description The budget's analysis, from the figures the server works out, the same as the web's: how the month
 * compares with the usual spending at the same point, for the Budget tab; and, for the Analysis tab, how the spending
 * moved over the last year and the recent habits
 */
enum BudgetAnalysis {
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
     * @method compare
     * @description The current month so far against what the reference months usually had by the same day, in all and
     * per category, from the figures the server worked out: comparing at the same day keeps a rent paid on the 1st, or a
     * month only half gone, from reading as a rise or a fall
     *
     * @param comparison The month so far and the usual, as the server sent them
     * @param categories The categories
     * @returns The comparison
     */
    static func compare(_ comparison: MonthFigures.Comparison, categories: [Category]) -> MonthComparison {
        let rows = categories.map { category in
            CategoryComparison(category: category, spent: comparison.current.byCategory[category.id] ?? 0, usual: comparison.usual.byCategory[category.id] ?? 0)
        }
        let shown = rows.filter { $0.spent > 0 || $0.usual > 0 }.sorted { ($0.spent - $0.usual) > ($1.spent - $1.usual) }

        return MonthComparison(referenceCount: comparison.referenceCount, spent: comparison.current.spent, usual: comparison.usual.spent, categories: shown)
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
     * first, from the figures the server worked out
     *
     * @param figures The figures, as the server sent them
     * @param limit The budget of a month
     * @returns The months
     */
    static func monthTotals(_ figures: AnalysisFigures, limit: (Date) -> Double) -> [MonthTotal] {
        figures.months.compactMap { entry in
            guard let month = monthStart(of: entry.month) else {
                return nil
            }
            return MonthTotal(month: month, spent: entry.spent, limit: limit(month), byCategory: entry.byCategory, isCurrent: entry.isCurrent)
        }
    }

    /**
     * @method spendingHabits
     * @description How the last ninety days were spent, recurring operations left out, from the figures the server
     * worked out: each place reads in the interface's language, and the weekdays are numbered as the calendar does
     *
     * @param figures The figures, as the server sent them
     * @returns The habits
     */
    static func spendingHabits(_ figures: AnalysisFigures) -> SpendingHabits {
        let habits = figures.habits
        let since = Operation.date(day: habits.since, time: "00:00") ?? .now
        let weekdays = habits.weekdays.map { WeekdaySpend(weekday: $0.weekday + 1, average: $0.average) }
        let places = habits.places.map { entry in
            PlaceSpend(name: entry.place?.name ?? (entry.location ?? "").trimmingCharacters(in: .whitespaces), spent: entry.spent, count: entry.count)
        }

        return SpendingHabits(since: since, weekdays: weekdays, online: habits.online, inPerson: habits.inPerson, places: places)
    }

    /**
     * @method monthStart
     * @description The first day of a month written `YYYY-MM`
     *
     * @param key The month
     * @returns Its first day, at midnight, or nil when it doesn't read as a month
     */
    static func monthStart(of key: String) -> Date? {
        Operation.date(day: key + "-01", time: "00:00")
    }
}
