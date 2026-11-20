#if DEBUG
import Foundation

/**
 * @type DebugSeed
 * @description The sample month the debug builds can start with, launched with `-demo` or `-demo-empty`. The
 * demonstration never touches the network: the sample operations stay in memory, and `DemoFigures` answers for the
 * server
 */
@MainActor
enum DebugSeed {

    /**
     * @method enterDemo
     * @description Replaces the budget with the sample month of the design handoff, dated around today
     *
     * @param store The store to fill
     * @returns The sample operations, for the session to serve
     */
    static func enterDemo(store: LocalStore) -> [Operation] {
        let calendar = BudgetMath.calendar
        let today = calendar.startOfDay(for: .now)
        let monthStart = BudgetMath.monthStart(today)

        /**
         * @function day
         * @description A day counted back from today, at a given hour
         *
         * @param offset How many days back
         * @param hour The hour of the day
         * @returns The date
         */
        func day(_ offset: Int, hour: Int = 12) -> Date {
            let base = calendar.date(byAdding: .day, value: -offset, to: today) ?? today
            return calendar.date(bySettingHour: hour, minute: 0, second: 0, of: base) ?? base
        }

        /**
         * @function dayOfMonth
         * @description A day of the current month, at a given hour
         *
         * @param number The day of the month
         * @param hour The hour of the day
         * @returns The date
         */
        func dayOfMonth(_ number: Int, hour: Int = 12) -> Date {
            let base = calendar.date(byAdding: .day, value: number - 1, to: monthStart) ?? monthStart
            return calendar.date(bySettingHour: hour, minute: 0, second: 0, of: base) ?? base
        }

        let usd = Currency.named("USD")
        let chf = Currency.named("CHF")

        let operations: [Operation] = [
            Operation(date: day(0, hour: 18), name: "Whole Foods", categoryId: "groceries", location: "Berlin Mitte", amount: 54.20, currencyCode: usd.code, rateToEuro: Currency.bankRate(usd.rateToEuro, code: usd.code)),
            Operation(date: day(0, hour: 9), name: "Deutsche Bahn", categoryId: "transport", location: "Hauptbahnhof", amount: 12.90),
            Operation(date: day(0, hour: 8), name: "The Barn Coffee", categoryId: "coffee", location: "Mitte", amount: 4.20),
            Operation(date: day(1, hour: 20), name: "Amazon", categoryId: "shopping", amount: 38, currencyCode: chf.code, rateToEuro: Currency.bankRate(chf.rateToEuro, code: chf.code), isOnline: true),
            Operation(date: day(1, hour: 21), name: "Trattoria Dinner", categoryId: "restaurant", location: "Kreuzberg", amount: 48),
            Operation(date: day(2, hour: 8), name: "Bonanza Coffee", categoryId: "coffee", location: "Prenzlauer Berg", amount: 4.50),
            Operation(date: day(2, hour: 22), name: "Klunkerkranich", categoryId: "bar", location: "Neukölln", amount: 18.50),
            Operation(date: day(3, hour: 19), name: "FitX Gym", categoryId: "selfcare", location: "Prenzlauer Berg", amount: 29.90),
            Operation(date: day(4, hour: 21), name: "Netflix", categoryId: "fun", amount: 12.99, isOnline: true),
            Operation(date: day(4, hour: 17), name: "REWE", categoryId: "groceries", location: "Prenzlauer Berg", amount: 31.40),

            Operation(date: dayOfMonth(16), name: "REWE", categoryId: "groceries", location: "Prenzlauer Berg", amount: 62.30),
            Operation(date: dayOfMonth(12), name: "Bio Company", categoryId: "groceries", location: "Kollwitzstraße", amount: 41.20),
            Operation(date: dayOfMonth(8), name: "Edeka", categoryId: "groceries", location: "Schönhauser Allee", amount: 58.90),
            Operation(date: dayOfMonth(3), name: "REWE", categoryId: "groceries", location: "Prenzlauer Berg", amount: 68.30),

            Operation(date: dayOfMonth(15), name: "Sushi Bar", categoryId: "restaurant", location: "Rosenthaler Platz", amount: 38.50),
            Operation(date: dayOfMonth(10), name: "Zenkichi", categoryId: "restaurant", location: "Mitte", amount: 52),
            Operation(date: dayOfMonth(5), name: "Burgermeister", categoryId: "restaurant", location: "Schlesisches Tor", amount: 22.50),
            Operation(date: dayOfMonth(2), name: "Café Kranzler", categoryId: "restaurant", location: "Charlottenburg", amount: 18),

            Operation(date: dayOfMonth(14, hour: 21), name: "Buck and Breck", categoryId: "bar", location: "Mitte", amount: 32),
            Operation(date: dayOfMonth(9, hour: 19), name: "Prater Garten", categoryId: "bar", location: "Prenzlauer Berg", amount: 24.50),

            Operation(date: dayOfMonth(16, hour: 8), name: "Five Elephant", categoryId: "coffee", location: "Kreuzberg", amount: 5.20),
            Operation(date: dayOfMonth(13, hour: 8), name: "Bonanza Coffee", categoryId: "coffee", location: "Prenzlauer Berg", amount: 4.50),
            Operation(date: dayOfMonth(11, hour: 9), name: "Companion Coffee", categoryId: "coffee", location: "Kreuzberg", amount: 4.60),
            Operation(date: dayOfMonth(7, hour: 8), name: "The Barn Coffee", categoryId: "coffee", location: "Mitte", amount: 4.80),
            Operation(date: dayOfMonth(5, hour: 9), name: "Five Elephant", categoryId: "coffee", location: "Kreuzberg", amount: 5.40),
            Operation(date: dayOfMonth(3, hour: 9), name: "Bonanza Coffee", categoryId: "coffee", location: "Prenzlauer Berg", amount: 4.50),

            Operation(date: dayOfMonth(1), name: "BVG Monthly", categoryId: "transport", location: "Berlin", amount: 49),
            Operation(date: dayOfMonth(11), name: "Deutsche Bahn", categoryId: "transport", location: "Hauptbahnhof", amount: 22.60),
            Operation(date: dayOfMonth(6), name: "Uber", categoryId: "transport", location: "Neukölln", amount: 11.50),

            Operation(date: dayOfMonth(14), name: "Zalando", categoryId: "shopping", amount: 89.90, isOnline: true),
            Operation(date: dayOfMonth(9), name: "Muji", categoryId: "shopping", location: "Alexanderplatz", amount: 34.50),
            Operation(date: dayOfMonth(4), name: "Dussmann", categoryId: "shopping", location: "Friedrichstraße", amount: 36),

            Operation(date: dayOfMonth(1, hour: 9), name: "Spotify", categoryId: "fun", amount: 10.99, isOnline: true),
            Operation(date: dayOfMonth(13), name: "Berghain", categoryId: "fun", location: "Friedrichshain", amount: 25),
            Operation(date: dayOfMonth(6, hour: 20), name: "Kino Babylon", categoryId: "fun", location: "Mitte", amount: 25.02)
        ]

        store.replaceAll(categories: Category.defaults, budget: BudgetSettings(monthlyLimit: 3000))
        return operations
    }

    /**
     * @method enterDemoEmpty
     * @description Starts from an empty budget, without queuing a reset for the server
     *
     * @param store The store to empty
     */
    static func enterDemoEmpty(store: LocalStore) {
        store.replaceAll(categories: Category.defaults, budget: .default)
    }
}

/**
 * @type DemoFigures
 * @description What the server would answer the demonstration, worked out from its sample operations: the pages of
 * History, each month's figures, and the months of the Analysis tab, without the comparison with usual or the habits
 */
@MainActor
enum DemoFigures {
    /**
     * @method page
     * @description A page of the operations matching the filters, the latest first
     *
     * @param operations The sample operations
     * @param query The filters
     * @param offset How many operations to skip
     * @param limit How many operations to read
     * @returns The page
     */
    static func page(_ operations: [Operation], query: OperationQuery, offset: Int, limit: Int) -> OperationPage {
        let matching = operations.filter { matches($0, query) }.sorted { $0.date > $1.date }
        return OperationPage(operations: Array(matching.dropFirst(offset).prefix(limit)), total: matching.count)
    }

    /**
     * @method matches
     * @description Whether an operation passes the filters
     *
     * @param operation The operation
     * @param query The filters
     * @returns Whether it does
     */
    private static func matches(_ operation: Operation, _ query: OperationQuery) -> Bool {
        let inCategory = query.categories.isEmpty || query.categories.contains(operation.categoryId)
        let inDays = (query.from.map { operation.day >= $0 } ?? true) && (query.to.map { operation.day <= $0 } ?? true)
        let found = query.query.isEmpty || operation.name.localizedCaseInsensitiveContains(query.query) || operation.whereabouts.localizedCaseInsensitiveContains(query.query) || query.queryCategories.contains(operation.categoryId)
        return inCategory && inDays && found
    }

    /**
     * @method spending
     * @description What operations spent, in all and per category
     *
     * @param operations The operations
     * @returns The euros spent
     */
    private static func spending(_ operations: [Operation]) -> Spending {
        let byCategory = operations.reduce(into: [String: Double]()) { totals, operation in
            totals[operation.categoryId, default: 0] += operation.euroAmount
        }
        return Spending(spent: operations.reduce(0) { $0 + $1.euroAmount }, byCategory: byCategory)
    }

    /**
     * @method month
     * @description What a month spent
     *
     * @param operations The sample operations
     * @param month Any day of the month
     * @returns The figures
     */
    static func month(_ operations: [Operation], month: Date) -> MonthFigures {
        let inMonth = operations.filter { BudgetMath.isSameMonth($0.date, month) }
        let spent = spending(inMonth)
        return MonthFigures(month: BudgetMath.monthKey(month), operationCount: inMonth.count, spent: spent.spent, byCategory: spent.byCategory, comparison: nil)
    }

    /**
     * @method analysis
     * @description What each month spent, from the first sample operation's to the current one
     *
     * @param operations The sample operations
     * @returns The figures
     */
    static func analysis(_ operations: [Operation]) -> AnalysisFigures {
        let current = BudgetMath.monthStart(.now)
        let first = BudgetMath.monthStart(operations.map(\.date).min() ?? .now)
        let count = max(1, (BudgetMath.calendar.dateComponents([.month], from: first, to: current).month ?? 0) + 1)
        let months = (0..<count).map { BudgetMath.shiftMonth(first, by: $0) }.map { month in
            let spent = spending(operations.filter { BudgetMath.isSameMonth($0.date, month) })
            return AnalysisFigures.Month(month: BudgetMath.monthKey(month), isCurrent: month == current, spent: spent.spent, byCategory: spent.byCategory)
        }
        let habits = AnalysisFigures.Habits(since: ExchangeRates.day(from: .now), weekdays: [], online: 0, inPerson: 0, places: [])
        return AnalysisFigures(months: months, habits: habits)
    }
}
#endif
