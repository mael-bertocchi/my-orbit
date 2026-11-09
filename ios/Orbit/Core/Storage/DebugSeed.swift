#if DEBUG
import Foundation

/**
 * @type DebugSeed
 * @description The sample month the debug builds can start with, launched with `-demo` or `-demo-empty`
 */
@MainActor
enum DebugSeed {

    /**
     * @method enterDemo
     * @description Replaces the budget with the sample month of the design handoff, dated around today
     *
     * @param store The store to fill
     */
    static func enterDemo(store: LocalStore) {
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
            Operation(date: day(3, hour: 19), name: "FitX Gym", categoryId: "selfcare", location: "Prenzlauer Berg", amount: 29.90, isRecurring: true),
            Operation(date: day(4, hour: 21), name: "Netflix", categoryId: "fun", amount: 12.99, isOnline: true, isRecurring: true),
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

            Operation(date: dayOfMonth(1), name: "BVG Monthly", categoryId: "transport", location: "Berlin", amount: 49, isRecurring: true),
            Operation(date: dayOfMonth(11), name: "Deutsche Bahn", categoryId: "transport", location: "Hauptbahnhof", amount: 22.60),
            Operation(date: dayOfMonth(6), name: "Uber", categoryId: "transport", location: "Neukölln", amount: 11.50),

            Operation(date: dayOfMonth(14), name: "Zalando", categoryId: "shopping", amount: 89.90, isOnline: true),
            Operation(date: dayOfMonth(9), name: "Muji", categoryId: "shopping", location: "Alexanderplatz", amount: 34.50),
            Operation(date: dayOfMonth(4), name: "Dussmann", categoryId: "shopping", location: "Friedrichstraße", amount: 36),

            Operation(date: dayOfMonth(1, hour: 9), name: "Spotify", categoryId: "fun", amount: 10.99, isOnline: true, isRecurring: true),
            Operation(date: dayOfMonth(13), name: "Berghain", categoryId: "fun", location: "Friedrichshain", amount: 25),
            Operation(date: dayOfMonth(6, hour: 20), name: "Kino Babylon", categoryId: "fun", location: "Mitte", amount: 25.02)
        ]

        store.replaceAll(
            categories: Category.defaults,
            operations: operations,
            budget: BudgetSettings(monthlyLimit: 3000)
        )
    }

    /**
     * @method enterDemoEmpty
     * @description Starts from an empty budget
     *
     * @param store The store to empty
     */
    static func enterDemoEmpty(store: LocalStore) {
        store.clearAll()
    }
}
#endif
