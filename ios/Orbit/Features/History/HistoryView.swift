import SwiftUI

/**
 * @class HistoryFilter
 * @description Which operations History shows: every operation while no category is picked, otherwise those of any of
 * the categories picked
 */
struct HistoryFilter: Hashable {
    var categoryIds: Set<String> = [] /*!< The categories picked, none for every operation */

    /**
     * @constant all
     * @description Every operation
     */
    static let all = HistoryFilter()

    /**
     * @method category
     * @description One category's operations
     *
     * @param id The category
     * @returns The filter
     */
    static func category(_ id: String) -> HistoryFilter {
        HistoryFilter(categoryIds: [id])
    }

    /**
     * @method isAll
     * @description Whether every operation shows
     */
    var isAll: Bool {
        categoryIds.isEmpty
    }

    /**
     * @method toggling
     * @description The filter with a category picked, or put back when it already was
     *
     * @param id The category
     * @returns The new filter
     */
    func toggling(_ id: String) -> HistoryFilter {
        var next = categoryIds
        if next.contains(id) {
            next.remove(id)
        } else {
            next.insert(id)
        }
        return HistoryFilter(categoryIds: next)
    }
}

/**
 * @class DayRange
 * @description A span of whole days, for the date filter
 */
struct DayRange: Hashable {
    let start: Date /*!< Its first day, at midnight */
    let end: Date /*!< Its last day, at midnight */

    /**
     * @constructor init
     * @description The days between two dates, in either order
     *
     * @param first One end
     * @param second The other
     */
    init(_ first: Date, _ second: Date) {
        let first = BudgetMath.calendar.startOfDay(for: first)
        let second = BudgetMath.calendar.startOfDay(for: second)
        start = min(first, second)
        end = max(first, second)
    }

    /**
     * @constructor init
     * @description A single day
     *
     * @param day The day
     */
    init(day: Date) {
        self.init(day, day)
    }

    /**
     * @constructor init
     * @description Every day of a month
     *
     * @param month Any date in the month
     */
    init(month: Date) {
        let start = BudgetMath.monthStart(month)
        let next = BudgetMath.shiftMonth(start, by: 1)
        let end = BudgetMath.calendar.date(byAdding: .day, value: -1, to: next) ?? start
        self.init(start, end)
    }

    /**
     * @method isSingleDay
     * @description Whether it spans a single day
     */
    var isSingleDay: Bool {
        start == end
    }

    /**
     * @method contains
     * @description Whether a date falls on one of its days
     *
     * @param date The date
     * @returns Whether it does
     */
    func contains(_ date: Date) -> Bool {
        let day = BudgetMath.calendar.startOfDay(for: date)
        return day >= start && day <= end
    }
}

/**
 * @class HistoryView
 * @description The History tab: operations grouped by day with day totals, a search, a date filter and one row of
 * filter chips. Several categories can be picked at once; All shows every category and is lit while none is picked.
 */
struct HistoryView: View {
    @Binding var filter: HistoryFilter /*!< The category filter, which the Budget tab can set */
    @Binding var dateRange: DayRange? /*!< The days shown, every date when nil, which the Budget tab can set */
    var onSelect: (Operation) -> Void = { _ in } /*!< Opens an operation */
    var onNewOperation: () -> Void = {} /*!< Opens the operation sheet on a new operation */

    @Environment(LocalStore.self) private var store /*!< The budget */
    @Environment(Preferences.self) private var preferences /*!< The device's settings, for the haptics */

    @State private var query = "" /*!< The search typed */
    @State private var showDateSheet = false /*!< Whether the date filter sheet is open */

    /**
     * @method body
     * @description The tab
     */
    var body: some View {
        VStack(spacing: 0) {
            headerBlock
            operationList
        }
        .sheet(isPresented: $showDateSheet) {
            HistoryDateSheet(range: $dateRange)
        }
    }

    /**
     * @method headerBlock
     * @description The title, the new operation button, the search and the filter chips
     */
    private var headerBlock: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center) {
                ScreenTitle(String(appLocalized: "History"))
                Spacer(minLength: 12)
                HeaderAddButton {
                    preferences.tap()
                    onNewOperation()
                }
            }
            .padding(.bottom, 12)

            SearchField(text: $query, prompt: String(appLocalized: "Search operations"))
                .padding(.bottom, 12)

            ScrollView(.horizontal) {
                HStack(spacing: 8) {
                    FilterChip(
                        title: dateRange.map(Formatting.rangeTitle) ?? String(appLocalized: "Date"),
                        systemImage: "calendar",
                        isActive: dateRange != nil
                    ) {
                        preferences.tap()
                        showDateSheet = true
                    }
                    Rectangle()
                        .fill(Theme.divider)
                        .frame(width: 1, height: 18)
                    FilterChip(title: String(appLocalized: "All"), isActive: filter.isAll) {
                        select(.all)
                    }
                    ForEach(store.categories) { category in
                        FilterChip(title: category.title, isActive: filter.categoryIds.contains(category.id)) {
                            select(filter.toggling(category.id))
                        }
                    }
                }
                .padding(.horizontal, Theme.screenPadding)
            }
            .scrollIndicators(.hidden)
            .padding(.horizontal, -Theme.screenPadding)
        }
        .padding(.top, 8)
        .padding(.horizontal, Theme.screenPadding)
        .padding(.bottom, 12)
    }

    /**
     * @method operationList
     * @description The operations day by day, with the total when a date filter is in place, or why there is none
     */
    @ViewBuilder
    private var operationList: some View {
        if groups.isEmpty {
            ScrollView {
                EmptyStateCard(message: emptyMessage)
                    .padding(.horizontal, Theme.screenPadding)
                    .padding(.top, 12)
            }
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.interactively)
        } else {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    if dateRange != nil {
                        StatCard(label: String(appLocalized: "Total spent"), value: Formatting.amount(groups.reduce(0) { $0 + $1.spent }))
                            .padding(.top, 4)
                    }
                    ForEach(groups) { group in
                        HStack {
                            DayLabel(Formatting.relativeDay(group.date))
                            Spacer(minLength: 12)
                            Text(Formatting.amount(group.spent))
                                .font(Theme.font(12))
                                .foregroundStyle(Theme.faint)
                        }
                        .padding(.top, 16)
                        .padding(.bottom, 8)

                        VStack(spacing: 0) {
                            ForEach(Array(group.operations.enumerated()), id: \.element.id) { index, operation in
                                Button {
                                    preferences.tap()
                                    onSelect(operation)
                                } label: {
                                    OperationRow(
                                        operation: operation,
                                        category: store.categoryOrFallback(id: operation.categoryId)
                                    )
                                }
                                .buttonStyle(.plain)
                                if index < group.operations.count - 1 {
                                    RowDivider()
                                }
                            }
                        }
                        .glassCard()
                    }
                }
                .padding(.horizontal, Theme.screenPadding)
                .padding(.bottom, 20)
            }
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.interactively)
        }
    }

    /**
     * @method emptyMessage
     * @description Why there is no operation to show
     */
    private var emptyMessage: String {
        if !query.isEmpty || !filter.isAll || dateRange != nil {
            return String(appLocalized: "No operations match this search.")
        }
        return String(appLocalized: "No operations yet. Tap ＋ to log your first expense.")
    }

    /**
     * @method groups
     * @description The operations the filters and the search let through, grouped by day
     */
    private var groups: [DayGroup] {
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        let filtered = store.operations.filter { operation in
            matchesFilter(operation) && (dateRange?.contains(operation.date) ?? true) && matchesQuery(operation, trimmed)
        }
        return BudgetMath.dayGroups(filtered)
    }

    /**
     * @method matchesFilter
     * @description Whether an operation passes the category filter: any operation while no category is picked, otherwise
     * one of a category picked
     *
     * @param operation The operation
     * @returns Whether it passes
     */
    private func matchesFilter(_ operation: Operation) -> Bool {
        filter.isAll || filter.categoryIds.contains(operation.categoryId)
    }

    /**
     * @method matchesQuery
     * @description Whether an operation matches the search: its name, note, place or category
     *
     * @param operation The operation
     * @param query The search
     * @returns Whether it matches
     */
    private func matchesQuery(_ operation: Operation, _ query: String) -> Bool {
        guard !query.isEmpty else {
            return true
        }
        let category = store.categoryOrFallback(id: operation.categoryId).title
        let haystack = [operation.name, operation.description ?? "", operation.location ?? "", operation.place?.nameEn ?? "", operation.place?.nameFr ?? "", category]
        return haystack.contains { $0.localizedCaseInsensitiveContains(query) }
    }

    /**
     * @method select
     * @description Applies a filter: All drops every category picked, a category is added or taken off
     *
     * @param value The new filter
     */
    private func select(_ value: HistoryFilter) {
        preferences.tap()
        withAnimation(.easeOut(duration: 0.18)) {
            filter = value
        }
    }
}

/**
 * @class OperationRow
 * @description An operation in History: its category's icon, its name with its markers, its time and place, and its
 * amount with the euro equivalent
 */
struct OperationRow: View {
    let operation: Operation /*!< The operation */
    let category: Category /*!< Its category */

    /**
     * @method body
     * @description The row
     */
    var body: some View {
        HStack(spacing: 12) {
            IconTile(
                symbol: category.symbol,
                color: category.color,
                size: 38,
                radius: 11,
                glyphSize: 18
            )

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(operation.name)
                        .font(Theme.font(14))
                        .foregroundStyle(Theme.text)
                        .lineLimit(1)
                    if operation.recurringId != nil {
                        Image(systemName: "repeat")
                            .font(.system(size: 11))
                            .foregroundStyle(Theme.faint)
                    }
                    if hasDescription {
                        Image(systemName: "text.alignleft")
                            .font(.system(size: 11))
                            .foregroundStyle(Theme.faint)
                    }
                }
                HStack(spacing: 8) {
                    Text(Formatting.time(operation.date))
                        .monospacedDigit()
                    if operation.isOnline {
                        HStack(spacing: 4) {
                            Image(systemName: "globe")
                                .font(.system(size: 10))
                            Text("Online")
                        }
                    } else if !operation.whereabouts.isEmpty {
                        HStack(spacing: 4) {
                            Image(systemName: "mappin")
                                .font(.system(size: 10))
                            Text(operation.whereabouts)
                        }
                        .lineLimit(1)
                        .truncationMode(.tail)
                    }
                }
                .font(Theme.font(12))
                .foregroundStyle(Theme.muted)
            }

            Spacer(minLength: 8)

            VStack(alignment: .trailing, spacing: 1) {
                Text(amountText)
                    .font(Theme.font(14, .semibold))
                    .foregroundStyle(Theme.text)
                if operation.isForeign {
                    Text(Formatting.euroPrecise(operation.euroAmount))
                        .font(Theme.font(11))
                        .foregroundStyle(Theme.faint)
                }
            }
            .fixedSize(horizontal: true, vertical: false)
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 14)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityText)
    }

    /**
     * @method hasDescription
     * @description Whether the operation carries a note
     */
    private var hasDescription: Bool {
        guard let description = operation.description else {
            return false
        }
        return !description.isEmpty
    }

    /**
     * @method accessibilityText
     * @description What VoiceOver reads for the row
     */
    private var accessibilityText: String {
        var parts = [operation.name, amountText, Formatting.time(operation.date)]
        if !operation.whereabouts.isEmpty {
            parts.append(operation.whereabouts)
        }
        if hasDescription {
            parts.append(String(appLocalized: "has a note"))
        }
        return parts.joined(separator: ", ")
    }

    /**
     * @method amountText
     * @description The amount in its own currency
     */
    private var amountText: String {
        Formatting.amount(operation.amount, currency: Currency.named(operation.currencyCode))
    }
}
