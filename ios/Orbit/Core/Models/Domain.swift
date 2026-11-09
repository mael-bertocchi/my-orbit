import Foundation
import SwiftUI

/**
 * @class Category
 * @description A spending category: its icon, colour and monthly limit
 */
struct Category: Codable, Identifiable, Equatable, Hashable {
    var id: String /*!< Its identifier: a stable name for the shipped ones, a UUID otherwise */
    var name: String /*!< Its English name, as stored */
    var symbol: String /*!< The SF Symbol it is drawn with */
    var colorHex: UInt32 /*!< Its colour, packed as 0xRRGGBB */
    var monthlyLimit: Double /*!< Its monthly limit, in euros */

    /**
     * @constructor init
     * @description Builds a category
     *
     * @param id Its identifier
     * @param name Its English name
     * @param symbol Its SF Symbol
     * @param colorHex Its colour
     * @param monthlyLimit Its monthly limit
     */
    init(
        id: String = UUID().uuidString,
        name: String,
        symbol: String,
        colorHex: UInt32,
        monthlyLimit: Double
    ) {
        self.id = id
        self.name = name
        self.symbol = symbol
        self.colorHex = colorHex
        self.monthlyLimit = monthlyLimit
    }

    var color: Color { Color(hex: colorHex) } /*!< Its colour */
    var tileBackground: Color { color.opacity(0.20) } /*!< The fill of its icon tile */
    var chipBackground: Color { color.opacity(0.18) } /*!< The fill of its chip when picked */
}

/**
 * @class Operation
 * @description An operation: an amount spent, in its currency and at the rate to the euro it was logged at
 */
struct Operation: Codable, Identifiable, Equatable, Hashable {
    var id: String /*!< Its identifier */
    var date: Date /*!< When it happened */
    var name: String /*!< Its name, the merchant's */
    var description: String? /*!< A note about it, if any */
    var categoryId: String /*!< Its category's identifier */
    var location: String? /*!< Where it happened, if somewhere physical */
    var amount: Double /*!< The amount, in its currency */
    var currencyCode: String /*!< Its currency's code */
    var rateToEuro: Double /*!< The euros one unit of its currency cost that day, bank markup included */
    var isOnline: Bool /*!< Whether it was paid online, with no place */
    var isRecurring: Bool /*!< Whether it repeats every month */
    var updatedAt: Date /*!< When it was last changed, which the merge compares */

    /**
     * @constructor init
     * @description Builds an operation
     *
     * @param id Its identifier
     * @param date When it happened
     * @param name Its name
     * @param description A note about it
     * @param categoryId Its category's identifier
     * @param location Where it happened
     * @param amount The amount, in its currency
     * @param currencyCode Its currency's code
     * @param rateToEuro Its rate to the euro
     * @param isOnline Whether it was paid online
     * @param isRecurring Whether it repeats every month
     * @param updatedAt When it was last changed
     */
    init(
        id: String = UUID().uuidString,
        date: Date,
        name: String,
        description: String? = nil,
        categoryId: String,
        location: String? = nil,
        amount: Double,
        currencyCode: String = Currency.euro.code,
        rateToEuro: Double = 1,
        isOnline: Bool = false,
        isRecurring: Bool = false,
        updatedAt: Date = .now
    ) {
        self.id = id
        self.date = date
        self.name = name
        self.description = description
        self.categoryId = categoryId
        self.location = location
        self.amount = amount
        self.currencyCode = currencyCode
        self.rateToEuro = rateToEuro
        self.isOnline = isOnline
        self.isRecurring = isRecurring
        self.updatedAt = updatedAt
    }

    var isForeign: Bool { currencyCode != Currency.euro.code } /*!< Whether it was paid in another currency than the euro */

    var euroAmount: Double { amount * rateToEuro } /*!< The amount in euros */
}

/**
 * @class BudgetSettings
 * @description The budget's settings
 */
struct BudgetSettings: Codable, Equatable {
    var monthlyLimit: Double /*!< The monthly budget, in euros */

    /**
     * @constant default
     * @description The budget a new install starts with
     */
    static let `default` = BudgetSettings(monthlyLimit: 3000)
}

/**
 * @class MonthlyBudget
 * @description The budget a month is measured against: the monthly limit and each category's
 */
struct MonthlyBudget: Codable, Equatable {
    var monthlyLimit: Double /*!< The monthly budget */
    var categoryLimits: [String: Double] /*!< Each category's limit, by category id */

    /**
     * @method limit
     * @description A category's limit, none when it has no entry
     *
     * @param categoryId The category's identifier
     * @returns The limit
     */
    func limit(for categoryId: String) -> Double {
        categoryLimits[categoryId] ?? 0
    }
}

/**
 * @type CategoryPalette
 * @description The shipped categories' colours
 */
enum CategoryPalette {
    /**
     * @constant groceries
     * @description Groceries' green
     */
    static let groceries: UInt32 = 0x3ECF8E
    /**
     * @constant restaurant
     * @description Restaurant's orange
     */
    static let restaurant: UInt32 = 0xFFA23E
    /**
     * @constant bar
     * @description Bar's lime
     */
    static let bar: UInt32 = 0x8FE05C
    /**
     * @constant coffee
     * @description Coffee's pink
     */
    static let coffee: UInt32 = 0xDF74E7
    /**
     * @constant transport
     * @description Transport's blue
     */
    static let transport: UInt32 = 0x4D9BFF
    /**
     * @constant shopping
     * @description Shopping's rose
     */
    static let shopping: UInt32 = 0xFF6BA8
    /**
     * @constant fun
     * @description Fun's teal
     */
    static let fun: UInt32 = 0x38D6D6
    /**
     * @constant selfcare
     * @description Selfcare's coral
     */
    static let selfcare: UInt32 = 0xFF8A5C
    /**
     * @constant school
     * @description Study's yellow
     */
    static let school: UInt32 = 0xFFD166
    /**
     * @constant administrative
     * @description Administrative's tan
     */
    static let administrative: UInt32 = 0xC9A27E
    /**
     * @constant telecom
     * @description Telecom's indigo
     */
    static let telecom: UInt32 = 0x7B8CFF
}

extension Category {
    /**
     * @constant defaults
     * @description The categories the app ships with, and their default limits
     */
    static let defaults: [Category] = [
        Category(id: "groceries", name: "Groceries", symbol: "cart", colorHex: CategoryPalette.groceries, monthlyLimit: 400),
        Category(id: "restaurant", name: "Restaurant", symbol: "fork.knife", colorHex: CategoryPalette.restaurant, monthlyLimit: 250),
        Category(id: "bar", name: "Bar", symbol: "wineglass", colorHex: CategoryPalette.bar, monthlyLimit: 100),
        Category(id: "coffee", name: "Coffee", symbol: "cup.and.saucer", colorHex: CategoryPalette.coffee, monthlyLimit: 50),
        Category(id: "transport", name: "Transport", symbol: "tram", colorHex: CategoryPalette.transport, monthlyLimit: 150),
        Category(id: "shopping", name: "Shopping", symbol: "bag", colorHex: CategoryPalette.shopping, monthlyLimit: 180),
        Category(id: "fun", name: "Fun", symbol: "film", colorHex: CategoryPalette.fun, monthlyLimit: 120),
        Category(id: "selfcare", name: "Selfcare", symbol: "cross.case", colorHex: CategoryPalette.selfcare, monthlyLimit: 80),
        Category(id: "school", name: "Study", symbol: "graduationcap", colorHex: CategoryPalette.school, monthlyLimit: 120),
        Category(id: "administrative", name: "Administrative", symbol: "doc.text", colorHex: CategoryPalette.administrative, monthlyLimit: 50),
        Category(id: "telecom", name: "Telecom", symbol: "wifi", colorHex: CategoryPalette.telecom, monthlyLimit: 60)
    ]

    /**
     * @constant retired
     * @description Ids that shipped as categories once and no longer do. A document written before they were retired
     * still carries them, so the catalog merge needs to know they are gone on purpose; otherwise it keeps them for good
     * as unknown categories parked at the end of the list
     */
    static let retired: Set<String> = ["rent", "health"]

    /**
     * @constant dropped
     * @description Ids that shipped as categories once and are left out of a document for good, even while an
     * operation still uses them: such an operation shows under the fallback instead
     */
    static let dropped: Set<String> = ["miscellaneous", "housing"]

    /**
     * @constant fallback
     * @description The category an operation shows under once its own is gone
     */
    static let fallback = Category(
        id: "uncategorized",
        name: "Uncategorized",
        symbol: "circle.dashed",
        colorHex: 0xA78BFA,
        monthlyLimit: 0
    )

    /**
     * @method title
     * @description The name to show. The document keeps the English `name` whatever language each device runs in, so
     * the categories the app knows are translated by id, and anything else shows the name it was stored with
     */
    var title: String {
        switch id {
        case "groceries": return String(appLocalized: "Groceries")
        case "restaurant": return String(appLocalized: "Restaurant")
        case "bar": return String(appLocalized: "Bar")
        case "coffee": return String(appLocalized: "Coffee")
        case "transport": return String(appLocalized: "Transport")
        case "shopping": return String(appLocalized: "Shopping")
        case "fun": return String(appLocalized: "Fun")
        case "selfcare": return String(appLocalized: "Selfcare")
        case "school": return String(appLocalized: "Study")
        case "administrative": return String(appLocalized: "Administrative")
        case "telecom": return String(appLocalized: "Telecom")
        case "rent": return String(appLocalized: "Rent")
        case Category.fallback.id: return String(appLocalized: "Uncategorized")
        default: return name
        }
    }
}
