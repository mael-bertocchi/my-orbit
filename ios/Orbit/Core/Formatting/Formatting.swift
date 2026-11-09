import Foundation

/**
 * @type Formatting
 * @description How the app writes amounts, rates and dates, in the interface's language: `1,234.50 €` in English, `1
 * 234,50 €` in French, spelled out the same way as on the web
 */
enum Formatting {
    /**
     * @class NumberStyle
     * @description How a language writes numbers
     */
    private struct NumberStyle {
        let decimal: String /*!< The decimal separator */
        let grouping: String /*!< The thousands separator */
        let unitSeparator: String? /*!< What goes between a number and a trailing symbol, nil when the symbol leads */

        /**
         * @constant english
         * @description English: `€1,234.50`
         */
        static let english = NumberStyle(decimal: ".", grouping: ",", unitSeparator: nil)
        /**
         * @constant french
         * @description French: `1 234,50 €`, with no-break spaces
         */
        static let french = NumberStyle(decimal: ",", grouping: "\u{00A0}", unitSeparator: "\u{00A0}")
    }

    /**
     * @class Formatters
     * @description The number formatters of one language, built once
     */
    private struct Formatters {
        let style: NumberStyle /*!< The language's number style */
        let compact: NumberFormatter /*!< Whole amounts */
        let precise: NumberFormatter /*!< Amounts to the cent */

        let rate: NumberFormatter /*!< Rates, to five significant digits */

        /**
         * @constructor init
         * @description Builds the formatters for a style
         *
         * @param style The language's number style
         */
        init(style: NumberStyle) {
            self.style = style
            compact = Self.decimal(style, fractionDigits: 0)
            precise = Self.decimal(style, fractionDigits: 2)

            let rate = NumberFormatter()
            rate.locale = Locale(identifier: "en_US_POSIX")
            rate.numberStyle = .decimal
            rate.usesGroupingSeparator = false
            rate.decimalSeparator = style.decimal
            rate.usesSignificantDigits = true
            rate.minimumSignificantDigits = 5
            rate.maximumSignificantDigits = 5
            self.rate = rate
        }

        /**
         * @method decimal
         * @description A formatter writing grouped numbers to a given precision
         *
         * @param style The language's number style
         * @param fractionDigits How many decimals
         * @returns The formatter
         */
        private static func decimal(_ style: NumberStyle, fractionDigits: Int) -> NumberFormatter {
            let formatter = NumberFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.numberStyle = .decimal
            formatter.usesGroupingSeparator = true
            formatter.groupingSeparator = style.grouping
            formatter.decimalSeparator = style.decimal
            formatter.groupingSize = 3
            formatter.minimumFractionDigits = fractionDigits
            formatter.maximumFractionDigits = fractionDigits
            return formatter
        }
    }

    /**
     * @constant englishFormatters
     * @description The English formatters
     */
    private static let englishFormatters = Formatters(style: .english)

    /**
     * @constant frenchFormatters
     * @description The French formatters
     */
    private static let frenchFormatters = Formatters(style: .french)

    /**
     * @method formatters
     * @description The formatters of the interface's language
     */
    private static var formatters: Formatters {
        Localization.isFrench ? frenchFormatters : englishFormatters
    }

    /**
     * @method style
     * @description The number style of the interface's language
     */
    private static var style: NumberStyle {
        formatters.style
    }

    /**
     * @method withSymbol
     * @description Puts a currency symbol where the language does: before in English, after in French
     *
     * @param number The formatted number
     * @param symbol The symbol
     * @returns The amount
     */
    private static func withSymbol(_ number: String, _ symbol: String) -> String {
        guard let separator = style.unitSeparator else {
            return symbol + number
        }
        return number + separator + symbol
    }

    /**
     * @method euro
     * @description A whole amount in euros
     *
     * @param amount The amount
     * @returns The amount, written
     */
    static func euro(_ amount: Double) -> String {
        withSymbol(formatters.compact.string(from: NSNumber(value: amount.rounded())) ?? "0", Currency.euro.symbol)
    }

    /**
     * @method euroPrecise
     * @description An amount in euros, to the cent
     *
     * @param amount The amount
     * @returns The amount, written
     */
    static func euroPrecise(_ amount: Double) -> String {
        withSymbol(formatters.precise.string(from: NSNumber(value: amount)) ?? "0", Currency.euro.symbol)
    }

    /**
     * @method amount
     * @description An amount in its own currency, to the cent
     *
     * @param amount The amount
     * @param currency Its currency
     * @returns The amount, written
     */
    static func amount(_ amount: Double, currency: Currency = .euro) -> String {
        withSymbol(formatters.precise.string(from: NSNumber(value: abs(amount))) ?? "0", currency.symbol)
    }

    /**
     * @method rate
     * @description A rate, to five significant digits
     *
     * @param value The rate
     * @returns The rate, written
     */
    static func rate(_ value: Double) -> String {
        formatters.rate.string(from: NSNumber(value: value)) ?? "0"
    }

    /**
     * @method decimalInput
     * @description An amount the way the code reads it back: a dot before the cents, no grouping
     *
     * @param amount The amount
     * @returns The amount, written
     */
    static func decimalInput(_ amount: Double) -> String {
        amount == amount.rounded() ? String(format: "%.0f", amount) : String(format: "%.2f", amount)
    }

    /**
     * @method amountInput
     * @description An amount the way a field shows it, grouped and in the interface's notation: 1,234.50 or 1 234,50
     *
     * @param amount The amount
     * @returns The amount, written
     */
    static func amountInput(_ amount: Double) -> String {
        groupedAmountInput(decimalInput(amount))
    }

    /**
     * @method groupedAmountInput
     * @description Writes a sanitized amount the way the interface's language does while it is being typed
     *
     * @param raw The sanitized amount
     * @returns The amount, grouped
     */
    static func groupedAmountInput(_ raw: String) -> String {
        guard let separator = raw.firstIndex(of: ".") else {
            return grouped(raw)
        }
        return grouped(String(raw[raw.startIndex..<separator])) + style.decimal + String(raw[raw.index(after: separator)...])
    }

    /**
     * @method sanitizeAmountInput
     * @description Reduces whatever is in an amount field to digits and a dot before at most two decimals. In English a
     * comma is grouping, unless it was just typed with no dot yet (the decimal key of a French keypad). In French both
     * a comma and a dot are the decimal separator, and the spaces grouping the thousands are dropped with anything else
     *
     * @param text What the field holds
     * @param maximumDigits How many digits it takes at most
     * @returns The amount, sanitized
     */
    static func sanitizeAmountInput(_ text: String, maximumDigits: Int = 8) -> String {
        var working = text
        if style.decimal == "," {
            working = working.replacingOccurrences(of: ",", with: ".")
        } else {
            if working.hasSuffix(","), !working.contains(".") {
                working = working.dropLast() + "."
            }
            working = working.replacingOccurrences(of: ",", with: "")
        }

        var integer = ""
        var fraction = ""
        var hasSeparator = false
        var digits = 0
        for character in working {
            if character.isNumber {
                guard digits < maximumDigits else {
                    continue
                }
                if hasSeparator {
                    guard fraction.count < 2 else {
                        continue
                    }
                    fraction.append(character)
                } else {
                    integer.append(character)
                }
                digits += 1
            } else if character == ".", !hasSeparator {
                hasSeparator = true
            }
        }

        while integer.count > 1, integer.hasPrefix("0") {
            integer.removeFirst()
        }
        if integer.isEmpty {
            guard hasSeparator else {
                return ""
            }
            integer = "0"
        }
        guard hasSeparator, !(fraction.isEmpty && digits >= maximumDigits) else {
            return integer
        }
        return integer + "." + fraction
    }

    /**
     * @method grouped
     * @description Groups digits by thousands
     *
     * @param digits The digits
     * @returns The digits, grouped
     */
    private static func grouped(_ digits: String) -> String {
        guard digits.count > 3 else {
            return digits
        }
        var result = ""
        for (offset, character) in digits.reversed().enumerated() {
            if offset > 0, offset.isMultiple(of: 3) {
                result.append(contentsOf: style.grouping)
            }
            result.append(character)
        }
        return String(result.reversed())
    }

    /**
     * @method parseAmount
     * @description Reads an amount written with a dot or a comma
     *
     * @param text The amount
     * @returns The amount, or nil when it isn't one
     */
    static func parseAmount(_ text: String) -> Double? {
        let normalized = text
            .trimmingCharacters(in: .whitespaces)
            .replacingOccurrences(of: ",", with: ".")
        guard !normalized.isEmpty, let value = Double(normalized), value.isFinite else {
            return nil
        }
        return value
    }

    /**
     * @method parseAmountInput
     * @description Reads an amount field back, in whichever notation it was typed
     *
     * @param text What the field holds
     * @returns The amount, or nil when it isn't one
     */
    static func parseAmountInput(_ text: String) -> Double? {
        parseAmount(sanitizeAmountInput(text))
    }

    /**
     * @method percent
     * @description A fraction as a whole percentage
     *
     * @param fraction The fraction
     * @returns The percentage, written
     */
    static func percent(_ fraction: Double) -> String {
        "\(Int((fraction * 100).rounded()))" + (style.unitSeparator ?? "") + "%"
    }

    /**
     * @method date
     * @description A date in a given pattern, in the interface's language
     *
     * @param date The date
     * @param format The pattern
     * @returns The date, written
     */
    private static func date(_ date: Date, format: String) -> String {
        let formatter = DateFormatter()
        formatter.locale = Localization.locale
        formatter.dateFormat = format
        return formatter.string(from: date)
    }

    /**
     * @method capitalizedFirst
     * @description French writes month names in lowercase, which reads as a typo once the month stands alone as a title
     *
     * @param text The text
     * @returns The text with a capital first letter
     */
    private static func capitalizedFirst(_ text: String) -> String {
        text.prefix(1).uppercased(with: Localization.locale) + text.dropFirst()
    }

    /**
     * @method monthTitle
     * @description A month's name, as a title
     *
     * @param date Any day of the month
     * @returns The name
     */
    static func monthTitle(_ date: Date) -> String {
        capitalizedFirst(self.date(date, format: "LLLL"))
    }

    /**
     * @method monthWithYear
     * @description A month's name with its year
     *
     * @param date Any day of the month
     * @returns The name
     */
    static func monthWithYear(_ date: Date) -> String {
        capitalizedFirst(self.date(date, format: "LLLL yyyy"))
    }

    /**
     * @method monthShort
     * @description A month's short name, under a chart's bar: Oct
     *
     * @param date Any day of the month
     * @returns The name
     */
    static func monthShort(_ date: Date) -> String {
        self.date(date, format: "LLL")
    }

    /**
     * @method weekdayShort
     * @description A weekday's short name: Mon
     *
     * @param weekday The weekday, 1 for Sunday like the calendar's
     * @returns The name
     */
    static func weekdayShort(_ weekday: Int) -> String {
        let formatter = DateFormatter()
        formatter.locale = Localization.locale
        let symbols = formatter.shortStandaloneWeekdaySymbols ?? []
        return symbols.indices.contains(weekday - 1) ? symbols[weekday - 1] : ""
    }

    /**
     * @method dayShort
     * @description A day and its month: 5 Oct, and 1er oct. in French
     *
     * @param date The date
     * @returns The day, written
     */
    static func dayShort(_ date: Date) -> String {
        guard Localization.isFrench, BudgetMath.calendar.component(.day, from: date) == 1 else {
            return self.date(date, format: "d MMM")
        }
        return "1er " + self.date(date, format: "MMM")
    }

    /**
     * @method weekdayDay
     * @description A day with its weekday: Mon 5 Oct
     *
     * @param date The date
     * @returns The day, written
     */
    static func weekdayDay(_ date: Date) -> String {
        self.date(date, format: "EEE d MMM")
    }

    /**
     * @method filterDay
     * @description A day the way the History date filter names it: 5 Oct, with the year once it isn't the current one
     *
     * @param date The date
     * @returns The day, written
     */
    private static func filterDay(_ date: Date) -> String {
        if Calendar.current.isDate(date, equalTo: .now, toGranularity: .year) {
            return dayShort(date)
        }
        return self.date(date, format: "d MMM yyyy")
    }

    /**
     * @method rangeTitle
     * @description A range of days the way the History date filter names it: 5 Oct for a single day, 1 Sep → 30 Sep for
     * a period
     *
     * @param range The days
     * @returns Their name
     */
    static func rangeTitle(_ range: DayRange) -> String {
        if range.isSingleDay {
            return filterDay(range.start)
        }
        return "\(filterDay(range.start)) → \(filterDay(range.end))"
    }

    /**
     * @method relativeDay
     * @description A day as History heads it: Today, Yesterday, or its weekday and date
     *
     * @param date The date
     * @returns The day, written
     */
    static func relativeDay(_ date: Date) -> String {
        if Calendar.current.isDateInToday(date) {
            return String(appLocalized: "Today")
        }
        if Calendar.current.isDateInYesterday(date) {
            return String(appLocalized: "Yesterday")
        }
        return weekdayDay(date)
    }

    /**
     * @method time
     * @description The time of day on a 24-hour clock, in both languages and on the web alike: 09:05. Like every date
     * the app shows, it reads in the time zone the device is in now, so an operation logged in another zone shows the
     * hour it was here
     *
     * @param date The date
     * @returns The time, written
     */
    static func time(_ date: Date) -> String {
        self.date(date, format: "HH:mm")
    }

    /**
     * @method clockLocale
     * @description The interface's locale on a 24-hour clock, so the time picker writes hours the way `time` does
     */
    static var clockLocale: Locale {
        var components = Locale.Components(locale: Localization.locale)
        components.hourCycle = .zeroToTwentyThree
        return Locale(components: components)
    }

    /**
     * @method fieldDate
     * @description When an operation happened, the way its editor shows it: Today, 7 Oct at 18:00
     *
     * @param date The date
     * @returns The date, written
     */
    static func fieldDate(_ date: Date) -> String {
        String(appLocalized: "\(fieldDay(date)) at \(time(date))")
    }

    /**
     * @method fieldDay
     * @description The day part of `fieldDate`
     *
     * @param date The date
     * @returns The day, written
     */
    private static func fieldDay(_ date: Date) -> String {
        if Calendar.current.isDateInToday(date) {
            return String(appLocalized: "Today, \(dayShort(date))")
        }
        if Calendar.current.isDateInYesterday(date) {
            return String(appLocalized: "Yesterday, \(dayShort(date))")
        }
        return weekdayDay(date)
    }
}
