import Foundation

/**
 * @class BudgetDocument
 * @description The budget's settings, as the app stores them and the server syncs them. The operations stay on the
 * server, which the app reads a page at a time
 */
struct BudgetDocument: Codable, Equatable {
    var categories: [Category] /*!< The spending categories, with their limits */
    var budget: BudgetSettings /*!< The monthly budget */
    var budgetHistory: [String: MonthlyBudget] /*!< Each finished month's own budget, by month */
}
