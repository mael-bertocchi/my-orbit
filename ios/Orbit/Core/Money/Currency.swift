import Foundation

/**
 * @class Currency
 * @description A currency an operation can be entered in, with its rate to the euro
 */
struct Currency: Codable, Identifiable, Equatable, Hashable {
    var code: String /*!< Its ISO code */
    var symbol: String /*!< Its symbol */
    var name: String /*!< Its English name */
    var rateToEuro: Double /*!< The euros one unit buys */

    var id: String { code } /*!< Its identifier, the code */
}

extension Currency {
    /**
     * @constant euro
     * @description The euro, which everything is counted in
     */
    static let euro = Currency(code: "EUR", symbol: "€", name: "Euro", rateToEuro: 1)

    /**
     * @constant all
     * @description The currencies the app offers. The rates here are only a fallback for a launch that has never
     * reached the server: `ExchangeRates` overlays the live values on top of them. They are ECB reference rates for
     * 2026-09-07
     */
    static let all: [Currency] = [
        euro,
        Currency(code: "USD", symbol: "$", name: "United States Dollar", rateToEuro: 0.860437),
        Currency(code: "CHF", symbol: "CHF", name: "Swiss Franc", rateToEuro: 1.063264),
        Currency(code: "KRW", symbol: "₩", name: "South Korean Won", rateToEuro: 0.00063834)
    ]

    /**
     * @method named
     * @description A currency by its code, the euro when unknown
     *
     * @param code The code
     * @returns The currency
     */
    static func named(_ code: String) -> Currency {
        all.first { $0.code == code } ?? euro
    }

    /**
     * @method title
     * @description The name to show, in the interface's language
     */
    var title: String {
        switch code {
        case "EUR": return String(appLocalized: "Euro")
        case "USD": return String(appLocalized: "United States Dollar")
        case "CHF": return String(appLocalized: "Swiss Franc")
        case "KRW": return String(appLocalized: "South Korean Won")
        default: return name
        }
    }

    /**
     * @constant bankMarkup
     * @description What the bank adds on top of the reference rate. A card payment abroad is not settled at the ECB
     * rate: the bank takes its cut on the way, so the operation lands on the statement about a percent dearer than the
     * published rate suggests
     */
    static let bankMarkup = 0.01

    /**
     * @method bankRate
     * @description The rate the app applies: the published reference rate with the bank's markup on top, so a euro
     * amount matches what is actually charged. The euro itself is never marked up, since it is never converted
     *
     * @param referenceRate The published rate
     * @param code The currency's code
     * @returns The rate applied
     */
    static func bankRate(_ referenceRate: Double, code: String) -> Double {
        guard code != euro.code else {
            return referenceRate
        }

        return referenceRate * (1 + bankMarkup)
    }
}

/**
 * @class RateSnapshot
 * @description One set of reference rates as published by the server. `rates` maps a currency code to the euros a
 * single unit of it buys, which is the convention `Currency.rateToEuro` uses
 */
struct RateSnapshot: Codable, Equatable {
    var quoteDate: String /*!< The day the rates were published */
    var fetchedAt: Date /*!< When the server fetched them */
    var rates: [String: Double] /*!< The euros one unit buys, by currency code */
}

/**
 * @class ExchangeRates
 * @description The exchange rates: the latest ones for new operations, and each past day's for pricing an operation at
 * its own day's rate
 */
@MainActor
@Observable
final class ExchangeRates {
    /**
     * @type RefreshState
     * @description Where the latest rates' refresh stands
     */
    enum RefreshState: Equatable {
        case idle /*!< Nothing under way */
        case refreshing /*!< A refresh is under way */
        case failed(String) /*!< The last refresh failed, with why */
    }

    private(set) var snapshot: RateSnapshot? /*!< The latest rates known, stored between launches */
    private(set) var refreshState: RefreshState = .idle /*!< Where the refresh stands */

    private(set) var dated: [String: RateSnapshot] = [:] /*!< Rates for one past day, keyed by that day. Held for the run only: the server caches them permanently, and a finished day's rates never change */

    private(set) var failures: [String: String] = [:] /*!< Why one day's rates could not be loaded, keyed by that day. A rate the app had to guess at should never look like one it actually fetched, so the reason is kept and shown */

    private let api: APIClient /*!< The server */
    private var inFlight: [String: Task<Void, Never>] = [:] /*!< The day lookups under way, shared by whoever asks for the same day */

    /**
     * @constructor init
     * @description Starts from the rates stored at the last launch
     *
     * @param api The server
     */
    init(api: APIClient) {
        self.api = api
        snapshot = Self.stored()
    }

    /**
     * @method day
     * @description The calendar day a date falls on, in the time zone the device is in now. Picking the 5th should
     * price an operation at the 5th's rate, whatever that instant happens to be in UTC. The zone is read on every call:
     * a formatter kept around would stay in the one it was created in after the device moves to another
     *
     * @param date The date
     * @returns The day, as `YYYY-MM-DD`
     */
    static func day(from date: Date) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .current
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    /**
     * @method currencies
     * @description The catalogue with the latest known rate overlaid onto each currency, carrying the bank's markup:
     * every rate the app hands out is one it would actually charge at
     */
    var currencies: [Currency] {
        Currency.all.map { currency in
            var applied = currency

            if let live = snapshot?.rates[currency.code], live > 0 {
                applied.rateToEuro = live
            }

            applied.rateToEuro = Currency.bankRate(applied.rateToEuro, code: currency.code)

            return applied
        }
    }

    /**
     * @method isStale
     * @description Whether the rates are old enough to be worth re-fetching
     */
    var isStale: Bool {
        guard let fetchedAt = snapshot?.fetchedAt else {
            return true
        }

        return Date.now.timeIntervalSince(fetchedAt) >= Self.staleAfter
    }

    /**
     * @method currency
     * @description A currency with its latest rate
     *
     * @param code Its code
     * @returns The currency
     */
    func currency(code: String) -> Currency {
        currencies.first { $0.code == code } ?? .euro
    }

    /**
     * @method rate
     * @description A currency's latest rate, markup included
     *
     * @param code Its code
     * @returns The euros one unit costs
     */
    func rate(code: String) -> Double {
        currency(code: code).rateToEuro
    }

    /**
     * @method euroAmount
     * @description An amount in euros at the latest rate
     *
     * @param amount The amount
     * @param code Its currency's code
     * @returns The amount in euros
     */
    func euroAmount(_ amount: Double, code: String) -> Double {
        amount * rate(code: code)
    }

    /**
     * @method rate
     * @description The rate that applied on one day, markup included, or nil until that day has been loaded
     *
     * @param code The currency's code
     * @param day The day
     * @returns The rate
     */
    func rate(code: String, on day: String) -> Double? {
        guard code != Currency.euro.code else {
            return 1
        }
        guard let published = dated[day]?.rates[code] else {
            return nil
        }

        return Currency.bankRate(published, code: code)
    }

    /**
     * @method isProvisional
     * @description Whether a day's rates may still be replaced. A day answered by an earlier day's rate is provisional
     * while it is today or later: its own rate simply hasn't been published yet. A past weekend is not: Friday's rate
     * is the final answer for it
     *
     * @param snapshot The rates loaded for the day
     * @param day The day
     * @returns Whether they may change
     */
    private func isProvisional(_ snapshot: RateSnapshot, for day: String) -> Bool {
        snapshot.quoteDate != day && day >= Self.day(from: .now)
    }

    /**
     * @method quoteDate
     * @description The day the loaded rates were actually published on, which is the previous working day for a weekend
     * or a holiday. Nil until the day has been loaded
     *
     * @param day The day
     * @returns The publication day
     */
    func quoteDate(on day: String) -> String? {
        dated[day]?.quoteDate
    }

    /**
     * @method failure
     * @description Why one day's rates are missing, or nil when nothing went wrong
     *
     * @param day The day
     * @returns Why
     */
    func failure(on day: String) -> String? {
        failures[day]
    }

    /**
     * @method load
     * @description Loads the rates for one day, once. The fetch runs in a task of its own rather than the caller's: a
     * view that changes its mind about which day it wants would otherwise cancel the request mid-flight, and a
     * cancelled request looks exactly like an unreachable server
     *
     * @param day The day
     */
    func load(day: String) async {
        if let cached = dated[day], !isProvisional(cached, for: day) {
            return
        }

        if let inFlight = inFlight[day] {
            await inFlight.value

            return
        }

        let task = Task { [api] in
            do {
                dated[day] = try await api.getRates(on: day)
                failures.removeValue(forKey: day)
            } catch {
                failures[day] = error.userMessage
            }

            inFlight.removeValue(forKey: day)
        }

        inFlight[day] = task

        await task.value
    }

    /**
     * @method refreshIfNeeded
     * @description Re-fetches only when the rates have gone stale, so foregrounding the app repeatedly doesn't turn
     * into a request each time
     */
    func refreshIfNeeded() async {
        guard isStale, refreshState != .refreshing else {
            return
        }

        await refresh()
    }

    /**
     * @method refresh
     * @description Pulls the current rates from the server. A failure keeps the last known snapshot in place: rates
     * that are a little old beat rates that are wrong, and the UI reports their age
     */
    func refresh() async {
        refreshState = .refreshing

        do {
            let fresh = try await api.getRates()

            snapshot = fresh
            Self.store(fresh)
            refreshState = .idle
        } catch {
            refreshState = .failed(error.userMessage)
        }
    }

    /**
     * @method stored
     * @description The rates stored at the last launch
     *
     * @returns The rates, or nil when there are none
     */
    private static func stored() -> RateSnapshot? {
        guard let data = UserDefaults.standard.data(forKey: Keys.snapshot) else {
            return nil
        }

        return try? JSONCoding.decoder.decode(RateSnapshot.self, from: data)
    }

    /**
     * @method store
     * @description Keeps the latest rates for the next launch
     *
     * @param snapshot The rates
     */
    private static func store(_ snapshot: RateSnapshot) {
        guard let data = try? JSONCoding.encoder.encode(snapshot) else {
            return
        }

        UserDefaults.standard.set(data, forKey: Keys.snapshot)
    }

    /**
     * @constant staleAfter
     * @description How old the latest rates may get before they are fetched again
     */
    private static let staleAfter: TimeInterval = 60 * 60

    /**
     * @type Keys
     * @description Where the rates are kept in the user defaults
     */
    private enum Keys {
        /**
         * @constant snapshot
         * @description The latest rates
         */
        static let snapshot = "rates.snapshot"
    }
}
