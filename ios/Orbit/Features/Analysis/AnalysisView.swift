import Charts
import SwiftUI

/**
 * @class AnalysisView
 * @description The Analysis tab, about what a single month can't show: how the spending moved over the last year, the
 * recurring operations, managed here, and the recent habits. Everything but the recurring operations, which the server
 * keeps, is worked out on the device
 */
struct AnalysisView: View {
    @Environment(LocalStore.self) private var store /*!< The budget */

    /**
     * @method body
     * @description The tab
     */
    var body: some View {
        let now = Date.now
        let totals = BudgetAnalysis.monthTotals(store.operations, limit: { store.monthlyBudget(for: $0).monthlyLimit }, now: now)
        let spending = Set(totals.flatMap { $0.byCategory.filter { $0.value > 0 }.keys })

        return ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                ScreenTitle(String(appLocalized: "Over \(totals.count) months"))
                    .padding(.bottom, 20)

                TrendsSection(totals: totals, categories: store.categories.filter { spending.contains($0.id) })

                RecurringSection()
                    .padding(.top, 26)

                HabitsSection(habits: BudgetAnalysis.spendingHabits(store.operations, now: now))
                    .padding(.top, 26)
            }
            .padding(.top, 8)
            .padding(.horizontal, Theme.screenPadding)
            .padding(.bottom, 24)
        }
        .scrollIndicators(.hidden)
        .scrollTopBlur()
    }
}

/**
 * @class SectionNote
 * @description The small text under a section's title, saying what it measures
 */
private struct SectionNote: View {
    let text: String /*!< The note */

    /**
     * @method body
     * @description The note
     */
    var body: some View {
        Text(verbatim: text)
            .font(Theme.font(12))
            .foregroundStyle(Theme.muted)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/**
 * @class TrendsSection
 * @description What each month spent over the last year, in all or in one category: a bar per month against its budget,
 * the average of the finished months, the costliest month, and the last three finished months against the three before
 */
private struct TrendsSection: View {
    let totals: [MonthTotal] /*!< The months, the oldest first */
    let categories: [Category] /*!< The categories that spent over them */

    @State private var categoryId: String? /*!< The category shown, nil for all of them */

    /**
     * @constant comparedMonths
     * @description How many finished months the latest trend compares with the ones before them
     */
    private let comparedMonths = 3

    /**
     * @method body
     * @description The section
     */
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(String(appLocalized: "Trends"))
            SectionNote(text: String(appLocalized: "What each month spent, the current one still under way."))

            ScrollView(.horizontal) {
                HStack(spacing: 8) {
                    FilterChip(title: String(appLocalized: "All"), isActive: categoryId == nil) {
                        categoryId = nil
                    }
                    ForEach(categories) { category in
                        FilterChip(title: category.title, isActive: categoryId == category.id) {
                            categoryId = category.id
                        }
                    }
                }
                .padding(.vertical, 6)
            }
            .scrollIndicators(.hidden)

            MonthBarsChart(totals: totals, categoryId: categoryId, average: average)
                .frame(height: 210)
                .padding(16)
                .glassCard()

            VStack(spacing: 0) {
                FigureRow(label: String(appLocalized: "Monthly average"), value: average.map(Formatting.euro) ?? "•")
                RowDivider()
                FigureRow(label: costliestLabel, value: costliest.map { Formatting.euro($0.amount(in: categoryId)) } ?? "•")
                RowDivider()
                FigureRow(label: String(appLocalized: "Last 3 months vs the 3 before"), value: trend, note: trendNote)
            }
            .glassCard()
        }
    }

    /**
     * @method values
     * @description What each finished month spent in the category shown, the oldest first
     */
    private var values: [Double] {
        totals.filter { !$0.isCurrent }.map { $0.amount(in: categoryId) }
    }

    /**
     * @method mean
     * @description The average of some numbers
     *
     * @param values The numbers
     * @returns Their average, or nil without any
     */
    private func mean(_ values: [Double]) -> Double? {
        values.isEmpty ? nil : values.reduce(0, +) / Double(values.count)
    }

    /**
     * @method average
     * @description The average of the finished months
     */
    private var average: Double? {
        mean(values)
    }

    /**
     * @method costliest
     * @description The finished month that spent the most in the category shown
     */
    private var costliest: MonthTotal? {
        totals.filter { !$0.isCurrent }.max { $0.amount(in: categoryId) < $1.amount(in: categoryId) }
    }

    /**
     * @method costliestLabel
     * @description The costliest month's label, naming it
     */
    private var costliestLabel: String {
        guard let costliest else {
            return String(appLocalized: "Costliest month")
        }
        return String(appLocalized: "Costliest: \(Formatting.monthWithYear(costliest.month))")
    }

    /**
     * @method recent
     * @description The average of the last three finished months
     */
    private var recent: Double? {
        mean(Array(values.suffix(comparedMonths)))
    }

    /**
     * @method before
     * @description The average of the three finished months before them, nil without enough history
     */
    private var before: Double? {
        guard values.count >= comparedMonths * 2 else {
            return nil
        }
        return mean(Array(values.dropLast(comparedMonths).suffix(comparedMonths)))
    }

    /**
     * @method trend
     * @description How the last three months moved from the three before, signed, or a dot without enough history
     */
    private var trend: String {
        guard let change else {
            return "•"
        }
        return (change > 0 ? "+" : "") + Formatting.percent(change)
    }

    /**
     * @method trendNote
     * @description What the trend is measured on, or that it needs more history
     */
    private var trendNote: String {
        guard let recent, let before else {
            return String(appLocalized: "Needs six finished months")
        }
        return String(appLocalized: "\(Formatting.euro(recent)) a month against \(Formatting.euro(before))")
    }

    /**
     * @method change
     * @description How the last three months moved from the three before, as a fraction
     */
    private var change: Double? {
        guard let recent, let before else {
            return nil
        }
        return BudgetAnalysis.change(recent, from: before)
    }
}

/**
 * @class FigureRow
 * @description One figure under the trends' chart, with a line under its label saying what it is measured on
 */
private struct FigureRow: View {
    let label: String /*!< What the figure is */
    let value: String /*!< The figure */
    var note: String? = nil /*!< What it is measured on, if worth saying */

    /**
     * @method body
     * @description The row
     */
    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: label)
                    .font(Theme.font(13))
                    .foregroundStyle(Theme.muted)
                    .lineLimit(1)
                if let note {
                    Text(verbatim: note)
                        .font(Theme.font(11))
                        .foregroundStyle(Theme.faint)
                        .monospacedDigit()
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            Text(verbatim: value)
                .font(Theme.font(15, .semibold))
                .foregroundStyle(Theme.text)
                .monospacedDigit()
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 14)
        .accessibilityElement(children: .combine)
    }
}

/**
 * @class MonthBarsChart
 * @description What each month spent as a bar, the month under way drawn lighter, its budget marked across it, and the
 * average of the finished months as a dashed line. Touching a month reads its figures
 */
private struct MonthBarsChart: View {
    let totals: [MonthTotal] /*!< The months, the oldest first */
    let categoryId: String? /*!< The category shown, nil for all of them */
    let average: Double? /*!< The average of the finished months */

    @State private var selectedKey: String? /*!< The month being touched */

    /**
     * @method body
     * @description The chart
     */
    var body: some View {
        Chart {
            if let selected {
                RuleMark(x: .value("Month", key(of: selected)))
                    .foregroundStyle(Theme.divider)
                    .lineStyle(StrokeStyle(lineWidth: 24))
                    .annotation(position: .top, overflowResolution: .init(x: .fit(to: .chart), y: .disabled)) {
                        tooltip(for: selected)
                    }
            }
            ForEach(totals) { total in
                BarMark(x: .value("Month", key(of: total)), y: .value("Spent", total.amount(in: categoryId)), width: .ratio(0.62))
                    .foregroundStyle(Theme.accent.opacity(total.isCurrent ? 0.4 : 1))
                    .cornerRadius(4)
                if categoryId == nil, total.limit > 0 {
                    RectangleMark(x: .value("Month", key(of: total)), y: .value("Budget", total.limit), width: .ratio(0.8), height: .fixed(2))
                        .foregroundStyle(Theme.text)
                }
            }
            if let average {
                RuleMark(y: .value("Average", average))
                    .foregroundStyle(Theme.neutral400)
                    .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [4, 4]))
            }
        }
        .chartXScale(domain: totals.map { key(of: $0) })
        .chartXSelection(value: $selectedKey)
        .chartXAxis {
            AxisMarks(values: labelledKeys) { value in
                AxisValueLabel {
                    if let key = value.as(String.self), let total = totals.first(where: { self.key(of: $0) == key }) {
                        Text(verbatim: Formatting.monthShort(total.month))
                    }
                }
                .font(Theme.font(10))
                .foregroundStyle(Theme.muted)
            }
        }
        .chartYAxis {
            AxisMarks(position: .leading, values: .automatic(desiredCount: 4)) { value in
                AxisGridLine()
                    .foregroundStyle(Theme.divider)
                AxisValueLabel {
                    if let amount = value.as(Double.self) {
                        Text(verbatim: Formatting.euro(amount))
                    }
                }
                .font(Theme.font(10))
                .foregroundStyle(Theme.muted)
            }
        }
        .chartLegend(.hidden)
        .safeAreaInset(edge: .top, spacing: 12) {
            legend
        }
        .accessibilityLabel(totals.map { Formatting.monthWithYear($0.month) + " " + Formatting.euro($0.amount(in: categoryId)) }.joined(separator: ", "))
    }

    /**
     * @method key
     * @description A month's place along the axis
     *
     * @param total The month
     * @returns Its key
     */
    private func key(of total: MonthTotal) -> String {
        BudgetMath.monthKey(total.month)
    }

    /**
     * @method labelledKeys
     * @description The months the axis names: every other one past six months, the latest kept, so the names never
     * overlap
     */
    private var labelledKeys: [String] {
        let every = totals.count > 6 ? 2 : 1
        return totals.enumerated().filter { (totals.count - 1 - $0.offset) % every == 0 }.map { key(of: $0.element) }
    }

    /**
     * @method selected
     * @description The month being touched
     */
    private var selected: MonthTotal? {
        totals.first { key(of: $0) == selectedKey }
    }

    /**
     * @method tooltip
     * @description The figures of the month being touched
     *
     * @param total The month
     * @returns The tooltip
     */
    private func tooltip(for total: MonthTotal) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(verbatim: Formatting.monthWithYear(total.month))
                .font(Theme.font(11, .semibold))
                .foregroundStyle(Theme.text)
            tooltipRow(title: String(appLocalized: "Spent"), amount: total.amount(in: categoryId))
            if categoryId == nil, total.limit > 0 {
                tooltipRow(title: String(appLocalized: "Budget"), amount: total.limit)
            }
        }
        .padding(.vertical, 6)
        .padding(.horizontal, 9)
        .glassCard(radius: Theme.controlRadius)
    }

    /**
     * @method tooltipRow
     * @description One figure of the tooltip
     *
     * @param title What the figure is
     * @param amount The euros
     * @returns The row
     */
    private func tooltipRow(title: String, amount: Double) -> some View {
        HStack(spacing: 6) {
            Text(verbatim: title)
                .font(Theme.font(11))
                .foregroundStyle(Theme.muted)
            Spacer(minLength: 8)
            Text(verbatim: Formatting.euro(amount))
                .font(Theme.font(11, .semibold))
                .foregroundStyle(Theme.text)
                .monospacedDigit()
        }
        .frame(width: 140)
    }

    /**
     * @method legend
     * @description What the marks stand for, so they never rest on colour alone
     */
    private var legend: some View {
        HStack(spacing: 12) {
            legendItem(title: String(appLocalized: "Spent")) {
                RoundedRectangle(cornerRadius: 2).fill(Theme.accent).frame(width: 9, height: 9)
            }
            if totals.contains(where: \.isCurrent) {
                legendItem(title: String(appLocalized: "Under way")) {
                    RoundedRectangle(cornerRadius: 2).fill(Theme.accent.opacity(0.4)).frame(width: 9, height: 9)
                }
            }
            if categoryId == nil, totals.contains(where: { $0.limit > 0 }) {
                legendItem(title: String(appLocalized: "Budget")) {
                    Capsule().fill(Theme.text).frame(width: 12, height: 2)
                }
            }
            if average != nil {
                legendItem(title: String(appLocalized: "Average")) {
                    Path { path in
                        path.move(to: CGPoint(x: 1, y: 1))
                        path.addLine(to: CGPoint(x: 13, y: 1))
                    }
                    .stroke(Theme.neutral400, style: StrokeStyle(lineWidth: 2, dash: [3, 3]))
                    .frame(width: 14, height: 2)
                }
            }
            Spacer(minLength: 0)
        }
    }

    /**
     * @method legendItem
     * @description A small drawing of a mark, with its name
     *
     * @param title The mark's name
     * @param swatch The mark, drawn small
     * @returns The item
     */
    private func legendItem(title: String, @ViewBuilder swatch: () -> some View) -> some View {
        HStack(spacing: 5) {
            swatch()
            Text(verbatim: title)
                .font(Theme.font(10))
                .foregroundStyle(Theme.muted)
        }
    }
}

/**
 * @class RecurringSection
 * @description The recurring operations, read from the server: a ＋ adds one, and each opens to be changed, paused or
 * deleted. Their card keeps the same height however many there are, its list scrolling within it
 */
private struct RecurringSection: View {
    /**
     * @constant listHeight
     * @description The height of the card holding the list
     */
    private let listHeight: CGFloat = 300

    @Environment(ApplicationSession.self) private var session /*!< The session with the server */
    @Environment(ExchangeRates.self) private var rates /*!< The exchange rates, for what a foreign one costs */
    @Environment(LocalStore.self) private var store /*!< The budget, for the categories */
    @Environment(Preferences.self) private var preferences /*!< The device's settings, for the haptics */

    @State private var recurring: [RecurringOperation]? /*!< The recurring operations, nil until loaded */
    @State private var failure: String? /*!< Why they couldn't be loaded */
    @State private var route: RecurringEditorRoute? /*!< What the editor is open on, nil while closed */

    /**
     * @method body
     * @description The section
     */
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center) {
                SectionLabel(String(appLocalized: "Recurring operations"))
                Spacer(minLength: 8)
                Button {
                    preferences.tap()
                    route = .new
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.accent)
                        .expandedTapTarget(vertical: 10, horizontal: 10)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("New recurring operation")
            }
            SectionNote(text: String(appLocalized: "Each one is logged as an operation on the day it falls due."))

            content
                .frame(height: listHeight)
                .glassCard()
        }
        .task {
            await load()
        }
        .sheet(item: $route) { opened in
            RecurringEditorSheet(route: opened, onSaved: saved, onDeleted: deleted)
        }
    }

    /**
     * @method content
     * @description The recurring operations in a list scrolling within the card, a spinner while they load, or a word
     * that there is none yet
     */
    @ViewBuilder
    private var content: some View {
        if let recurring {
            if recurring.isEmpty {
                placeholder(String(appLocalized: "No recurring operation yet. Add a rent or a subscription so it logs itself."))
            } else {
                ScrollView {
                    VStack(spacing: 0) {
                        ForEach(Array(sorted.enumerated()), id: \.element.id) { index, item in
                            Button {
                                preferences.tap()
                                route = .edit(item)
                            } label: {
                                RecurringRow(recurring: item, category: store.categoryOrFallback(id: item.categoryId), monthly: monthly(item))
                            }
                            .buttonStyle(.plain)
                            if index < sorted.count - 1 {
                                RowDivider()
                            }
                        }
                    }
                }
            }
        } else if let failure {
            placeholder(failure)
        } else {
            ProgressView()
                .tint(Theme.muted)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    /**
     * @method placeholder
     * @description A word standing in for the list, at the top of the card
     *
     * @param message The word
     * @returns The placeholder
     */
    private func placeholder(_ message: String) -> some View {
        Text(verbatim: message)
            .font(Theme.font(13))
            .foregroundStyle(Theme.muted)
            .lineSpacing(3)
            .fixedSize(horizontal: false, vertical: true)
            .padding(14)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    /**
     * @method sorted
     * @description The running recurring operations first, each kind by its next occurrence
     */
    private var sorted: [RecurringOperation] {
        (recurring ?? []).sorted { left, right in
            if left.isRunning != right.isRunning {
                return left.isRunning
            }
            return (left.nextDate ?? "") < (right.nextDate ?? "")
        }
    }

    /**
     * @method monthly
     * @description What a recurring operation costs a month on average, in euros at the latest rate
     *
     * @param item The recurring operation
     * @returns The euros a month
     */
    private func monthly(_ item: RecurringOperation) -> Double {
        rates.euroAmount(item.amount, code: item.currencyCode) / Double(max(item.intervalMonths, 1))
    }

    /**
     * @method load
     * @description Reads the recurring operations from the server
     */
    private func load() async {
        do {
            recurring = try await session.recurring()
            failure = nil
        } catch {
            failure = String(appLocalized: "The recurring operations couldn't be loaded.")
        }
    }

    /**
     * @method saved
     * @description Puts a stored recurring operation in the list, in place of its former self
     *
     * @param stored The recurring operation
     */
    private func saved(_ stored: RecurringOperation) {
        var list = recurring ?? []
        if let index = list.firstIndex(where: { $0.id == stored.id }) {
            list[index] = stored
        } else {
            list.append(stored)
        }
        recurring = list
    }

    /**
     * @method deleted
     * @description Takes a deleted recurring operation out of the list
     *
     * @param id Its id
     */
    private func deleted(_ id: String) {
        recurring?.removeAll { $0.id == id }
    }
}

/**
 * @class RecurringRow
 * @description A recurring operation: its name, how often it comes back and when next, its amount and what it costs a
 * year
 */
private struct RecurringRow: View {
    let recurring: RecurringOperation /*!< The recurring operation */
    let category: Category /*!< Its category */
    let monthly: Double /*!< What it costs a month on average, in euros */

    /**
     * @method body
     * @description The row
     */
    var body: some View {
        HStack(spacing: 11) {
            IconTile(symbol: category.symbol, color: category.color)
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: recurring.name)
                    .font(Theme.font(14))
                    .foregroundStyle(Theme.text)
                    .lineLimit(1)
                Text(verbatim: RecurringDay.intervalTitle(recurring.intervalMonths) + " • " + status)
                    .font(Theme.font(11))
                    .foregroundStyle(Theme.muted)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                Text(verbatim: Formatting.amount(recurring.amount, currency: Currency.named(recurring.currencyCode)))
                    .font(Theme.font(14, .semibold))
                    .foregroundStyle(Theme.text)
                    .monospacedDigit()
                Text(verbatim: String(appLocalized: "\(Formatting.euro(monthly * 12)) / year"))
                    .font(Theme.font(11))
                    .foregroundStyle(Theme.muted)
                    .monospacedDigit()
            }
            .fixedSize()
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Theme.faint)
        }
        .padding(.vertical, 11)
        .padding(.horizontal, 14)
        .opacity(recurring.isRunning ? 1 : 0.6)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    /**
     * @method status
     * @description When it next falls due, or that it is paused or over
     */
    private var status: String {
        if recurring.isPaused {
            return String(appLocalized: "Paused")
        }
        guard let next = recurring.nextDate.flatMap(RecurringDay.date) else {
            return String(appLocalized: "Ended")
        }
        let day = Formatting.dayShort(next).replacingOccurrences(of: " ", with: "\u{00A0}")
        return String(appLocalized: "next on \(day)")
    }
}

/**
 * @class HabitsSection
 * @description How the last ninety days were spent, recurring operations left out: what each weekday costs on average,
 * the share paid online, and the places most spent at
 */
private struct HabitsSection: View {
    let habits: SpendingHabits /*!< The habits */

    /**
     * @method body
     * @description The section
     */
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(String(appLocalized: "Habits"))
            SectionNote(text: String(appLocalized: "Over the last 90 days, recurring expenses left out."))

            if habits.total == 0 {
                EmptyStateCard(message: String(appLocalized: "Nothing spent over the last 90 days."))
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    subtitle(String(appLocalized: "A typical day"))
                    VStack(spacing: 7) {
                        ForEach(habits.weekdays) { entry in
                            WeekdayRow(entry: entry, busiest: busiest)
                        }
                    }
                    .padding(.top, 8)

                    subtitle(String(appLocalized: "How you pay"))
                        .padding(.top, 18)
                    PaymentSplit(onlineShare: habits.onlineShare)
                        .padding(.top, 8)
                }
                .padding(16)
                .glassCard()

                if !habits.places.isEmpty {
                    SectionLabel(String(appLocalized: "Where you spend most"))
                        .padding(.top, 8)
                    VStack(spacing: 0) {
                        ForEach(Array(habits.places.enumerated()), id: \.element.id) { index, place in
                            PlaceRow(place: place)
                            if index < habits.places.count - 1 {
                                RowDivider()
                            }
                        }
                    }
                    .glassCard()
                }
            }
        }
    }

    /**
     * @method busiest
     * @description What the costliest weekday spends on average, the bars' full length
     */
    private var busiest: Double {
        max(1, habits.weekdays.map(\.average).max() ?? 0)
    }

    /**
     * @method subtitle
     * @description A part's title inside the card
     *
     * @param text The title
     * @returns The title
     */
    private func subtitle(_ text: String) -> some View {
        Text(verbatim: text)
            .font(Theme.font(12, .semibold))
            .foregroundStyle(Theme.muted)
    }
}

/**
 * @class WeekdayRow
 * @description A weekday's average spending as a bar, the costliest one drawn stronger
 */
private struct WeekdayRow: View {
    let entry: WeekdaySpend /*!< The weekday */
    let busiest: Double /*!< What the costliest weekday spends, the bar's full length */

    /**
     * @method body
     * @description The row
     */
    var body: some View {
        HStack(spacing: 10) {
            Text(verbatim: Formatting.weekdayShort(entry.weekday))
                .font(Theme.font(12))
                .foregroundStyle(Theme.muted)
                .frame(width: 38, alignment: .leading)
            TrackBar(progress: entry.average / busiest, color: Theme.accent.opacity(entry.average >= busiest ? 1 : 0.55))
            Text(verbatim: Formatting.euro(entry.average))
                .font(Theme.font(12, .medium))
                .foregroundStyle(Theme.text)
                .monospacedDigit()
                .frame(width: 52, alignment: .trailing)
        }
        .accessibilityElement(children: .combine)
    }
}

/**
 * @class PaymentSplit
 * @description The share spent online against in person, as one split bar with both shares named
 */
private struct PaymentSplit: View {
    let onlineShare: Double /*!< The share spent online, between 0 and 1 */

    /**
     * @method body
     * @description The split
     */
    var body: some View {
        VStack(spacing: 8) {
            GeometryReader { proxy in
                HStack(spacing: 2) {
                    Capsule()
                        .fill(Theme.accent)
                        .frame(width: max(0, (proxy.size.width - 2) * onlineShare))
                    Capsule()
                        .fill(Theme.accent.opacity(0.35))
                }
            }
            .frame(height: Theme.trackHeight)

            HStack {
                share(symbol: "globe", title: String(appLocalized: "Online"), value: onlineShare, color: Theme.accent)
                Spacer(minLength: 8)
                share(symbol: "mappin.and.ellipse", title: String(appLocalized: "In person"), value: 1 - onlineShare, color: Theme.muted)
            }
        }
        .accessibilityElement(children: .combine)
    }

    /**
     * @method share
     * @description One share, with its icon and name
     *
     * @param symbol The SF Symbol drawn
     * @param title What the share is
     * @param value The share, between 0 and 1
     * @param color The icon's colour
     * @returns The share
     */
    private func share(symbol: String, title: String, value: Double, color: Color) -> some View {
        HStack(spacing: 5) {
            Image(systemName: symbol)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(color)
            Text(verbatim: title)
                .font(Theme.font(12))
                .foregroundStyle(Theme.muted)
            Text(verbatim: Formatting.percent(value))
                .font(Theme.font(12, .semibold))
                .foregroundStyle(Theme.text)
                .monospacedDigit()
        }
    }
}

/**
 * @class PlaceRow
 * @description A place, how many times it was spent at, and what was spent there
 */
private struct PlaceRow: View {
    let place: PlaceSpend /*!< The place */

    /**
     * @method body
     * @description The row
     */
    var body: some View {
        HStack(spacing: 10) {
            Text(verbatim: place.name)
                .font(Theme.font(14))
                .foregroundStyle(Theme.text)
                .lineLimit(1)
            Spacer(minLength: 8)
            Text(verbatim: String(appLocalized: "\(place.count) times"))
                .font(Theme.font(12))
                .foregroundStyle(Theme.muted)
            Text(verbatim: Formatting.euro(place.spent))
                .font(Theme.font(14, .semibold))
                .foregroundStyle(Theme.text)
                .monospacedDigit()
        }
        .padding(.vertical, 11)
        .padding(.horizontal, 14)
        .accessibilityElement(children: .combine)
    }
}
