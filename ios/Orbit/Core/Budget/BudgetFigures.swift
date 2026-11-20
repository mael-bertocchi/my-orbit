import Foundation

/**
 * @class OperationQuery
 * @description Which operations a page lists: the categories picked (any when none is), the first and last days, the
 * search, and the categories whose name matches it in the interface's language
 */
struct OperationQuery: Hashable {
    var categories: [String] /*!< The categories picked, none for every category */
    var from: String? /*!< The first day included, as `YYYY-MM-DD`, nil for no bound */
    var to: String? /*!< The last day included, as `YYYY-MM-DD`, nil for no bound */
    var query: String /*!< The search */
    var queryCategories: [String] /*!< The categories whose name matches the search */
}

/**
 * @class OperationPage
 * @description A page of operations, the latest first, with how many match in all
 */
struct OperationPage: Decodable {
    var operations: [Operation] /*!< The operations of the page */
    var total: Int /*!< How many operations match in all */
}

/**
 * @class Spending
 * @description Euros spent, in all and per category
 */
struct Spending: Decodable, Equatable {
    var spent: Double /*!< Euros spent */
    var byCategory: [String: Double] /*!< Euros spent per category id */
}

/**
 * @class MonthFigures
 * @description What a month spent, worked out by the server, and in the current month how it compares with what the past
 * months usually had by the same day
 */
struct MonthFigures: Decodable, Equatable {
    var month: String /*!< The month, as `YYYY-MM` */
    var operationCount: Int /*!< How many operations it holds */
    var spent: Double /*!< Euros spent */
    var byCategory: [String: Double] /*!< Euros spent per category id */
    var comparison: Comparison? /*!< How it compares with the usual, only for the current month */

    /**
     * @class Comparison
     * @description The current month so far against what the reference months usually had by the same day
     */
    struct Comparison: Decodable, Equatable {
        var referenceCount: Int /*!< How many past months "usual" is measured on, 0 without history */
        var current: Spending /*!< What the month spent so far */
        var usual: Spending /*!< What the reference months usually had by the same day */
    }
}

/**
 * @class AnalysisFigures
 * @description What the Analysis tab shows, worked out by the server: the last twelve months and the habits of the last
 * ninety days, recurring operations left out
 */
struct AnalysisFigures: Decodable, Equatable {
    var months: [Month] /*!< The months, the oldest first */
    var habits: Habits /*!< The recent habits */

    /**
     * @class Month
     * @description What a month spent
     */
    struct Month: Decodable, Equatable {
        var month: String /*!< The month, as `YYYY-MM` */
        var isCurrent: Bool /*!< Whether it is the current month */
        var spent: Double /*!< Euros spent */
        var byCategory: [String: Double] /*!< Euros spent per category id */
    }

    /**
     * @class Habits
     * @description How the recent spending is spread
     */
    struct Habits: Decodable, Equatable {
        var since: String /*!< The first day measured, as `YYYY-MM-DD` */
        var weekdays: [Weekday] /*!< Each weekday, Monday first */
        var online: Double /*!< Euros spent online */
        var inPerson: Double /*!< Euros spent in person */
        var places: [PlaceTotal] /*!< The places most spent at, the largest first */
    }

    /**
     * @class Weekday
     * @description What a weekday usually costs
     */
    struct Weekday: Decodable, Equatable {
        var weekday: Int /*!< The weekday, 0 for Sunday */
        var average: Double /*!< Euros spent on such a day, on average */
    }

    /**
     * @class PlaceTotal
     * @description What was spent at a place
     */
    struct PlaceTotal: Decodable, Equatable {
        var place: PlaceReference? /*!< Its city, when the server checked it */
        var location: String? /*!< The place as written, otherwise */
        var spent: Double /*!< Euros spent there */
        var count: Int /*!< How many operations */
    }
}

/**
 * @class Suggestions
 * @description What the editors suggest: earlier names and cities matching what is typed, and the city of the latest
 * operation in person
 */
struct Suggestions: Decodable, Equatable {
    var names: [String] /*!< The names, the best first */
    var places: [PlaceReference] /*!< The cities, the best first */
    var latestPlace: PlaceReference? /*!< The city of the latest operation in person */
}
