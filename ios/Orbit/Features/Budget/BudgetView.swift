import SwiftUI

/**
 * @class BudgetView
 * @description The Budget tab: the ring with what is left to spend, the spent, days-left and per-day figures, and every
 * category against its limit, month by month, from the figures the server works out, read again whenever its budget
 * changes. The operations logged on the device that haven't reached the server count too. The current month also shows
 * how each category compares with its usual spending by the same day
 */
struct BudgetView: View {
    var onOpenCategory: (Category, Date) -> Void = { _, _ in } /*!< Opens a category's operations of a month in History */
    var onNewOperation: () -> Void = {} /*!< Opens the operation sheet on a new operation */

    @Environment(LocalStore.self) private var store /*!< The budget */
    @Environment(Preferences.self) private var preferences /*!< The device's settings, for the haptics */
    @Environment(ApplicationSession.self) private var session /*!< The session, which reads the figures from the server */

    @State private var month: Date = BudgetMath.monthStart(.now) /*!< The month shown */
    @State private var showLimits = false /*!< Whether the limits sheet is open */
    @State private var figures: MonthFigures? /*!< The month's figures, as the server worked them out */
    @State private var failure: String? /*!< Why they couldn't be read, nil when they could */

    /**
     * @class ReloadKey
     * @description What the figures are read again on: the month, the server's revision, and the changes waiting on the
     * device, each of which the server counts once it leaves the queue
     */
    private struct ReloadKey: Hashable {
        var month: String /*!< The month, as `YYYY-MM` */
        var revision: Int /*!< The server's revision */
        var pendingCount: Int /*!< How many changes wait on the device */
    }

    /**
     * @method body
     * @description The tab
     */
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header
                    .padding(.bottom, 6)

                BudgetRing(
                    progress: hasOperations ? summary.progress : 0,
                    caption: isOverBudget ? String(appLocalized: "Overspent") : String(appLocalized: "Left to spend"),
                    amount: hasOperations ? Formatting.euro(abs(summary.left)) : "•",
                    subtitle: hasOperations ? String(appLocalized: "of \(Formatting.euro(summary.limit))") : String(appLocalized: "No operations"),
                    color: isOverBudget ? Theme.negative : Theme.accent
                )
                .frame(maxWidth: .infinity)
                .padding(.top, 18)
                .padding(.bottom, 6)

                statCards
                    .padding(.top, 14)
                    .padding(.bottom, 22)

                categoryHeader
                    .padding(.bottom, showDispatchNote ? 6 : 12)

                if showDispatchNote {
                    Text("\(Formatting.euro(toDispatch)) of the budget is not dispatched yet")
                        .font(Theme.font(12))
                        .foregroundStyle(Theme.accent300)
                        .padding(.bottom, 12)
                }

                categoryList
            }
            .padding(.top, 8)
            .padding(.horizontal, Theme.screenPadding)
        }
        .scrollIndicators(.hidden)
        .scrollTopBlur()
        .sheet(isPresented: $showLimits) {
            CategoryLimitsSheet(month: month)
        }
        .task(id: ReloadKey(month: BudgetMath.monthKey(month), revision: store.revision, pendingCount: store.pending.count)) {
            await readFigures()
        }
    }

    /**
     * @method readFigures
     * @description Reads the month's figures from the server
     */
    private func readFigures() async {
        do {
            let read = try await session.monthFigures(month)
            guard !Task.isCancelled else {
                return
            }
            figures = read
            failure = nil
        } catch is CancellationError {
            return
        } catch {
            failure = error.userMessage
        }
    }

    /**
     * @method shownFigures
     * @description The figures of the month shown, nil until they are read
     */
    private var shownFigures: MonthFigures? {
        guard let figures, figures.month == BudgetMath.monthKey(month) else {
            return nil
        }
        return figures
    }

    /**
     * @method spending
     * @description What the month spent, in all and per category: the server's figures, moved by the changes made on
     * the device that haven't reached it
     */
    private var spending: Spending {
        let pending = store.pendingOperations
        let change = pending.spendingChange(in: month)
        let sent = shownFigures.flatMap { pending.deletesEvery ? nil : Spending(spent: $0.spent, byCategory: $0.byCategory) } ?? Spending(spent: 0, byCategory: [:])
        return Spending(spent: sent.spent + change.spent, byCategory: sent.byCategory.merging(change.byCategory, uniquingKeysWith: +))
    }

    /**
     * @method monthlyBudget
     * @description The budget the month is measured against
     */
    private var monthlyBudget: MonthlyBudget {
        store.monthlyBudget(for: month)
    }

    /**
     * @method hasOperations
     * @description Whether the month has any operation
     */
    private var hasOperations: Bool {
        let sent = store.pendingOperations.deletesEvery ? 0 : shownFigures?.operationCount ?? 0
        return sent > 0 || store.pendingOperations.saved.contains { BudgetMath.isSameMonth($0.date, month) }
    }

    /**
     * @method summary
     * @description The month's figures
     */
    private var summary: MonthSummary {
        BudgetMath.summary(spent: spending.spent, month: month, budget: monthlyBudget)
    }

    /**
     * @method isOverBudget
     * @description Whether the month spent more than its budget
     */
    private var isOverBudget: Bool {
        hasOperations && summary.left < 0
    }

    /**
     * @method spends
     * @description The categories with a limit or some spending, each against its limit
     */
    private var spends: [CategorySpend] {
        BudgetMath.categorySpends(byCategory: spending.byCategory, categories: store.categories, budget: monthlyBudget)
        .filter { $0.limit > 0 || $0.spent > 0 }
    }

    /**
     * @method isCurrentMonth
     * @description Whether the month shown is the current one
     */
    private var isCurrentMonth: Bool {
        BudgetMath.isSameMonth(month, .now)
    }

    /**
     * @method changes
     * @description Each category's change from its usual spending by the same day, only for the current month with some
     * history and only when it is worth showing: nil for a category that usually spends nothing
     */
    private var changes: [String: Double?] {
        guard isCurrentMonth, let figures = shownFigures?.comparison else {
            return [:]
        }
        let comparison = BudgetAnalysis.compare(figures, categories: store.categories)
        guard comparison.referenceCount > 0 else {
            return [:]
        }
        return Dictionary(comparison.categories.filter(BudgetAnalysis.isNotable).map { ($0.id, $0.change) }, uniquingKeysWith: { first, _ in first })
    }

    /**
     * @method toDispatch
     * @description What the monthly budget leaves once every limit is taken out
     */
    private var toDispatch: Double {
        BudgetMath.toDispatch(categories: store.categories, budget: monthlyBudget)
    }

    /**
     * @method canGoForward
     * @description Whether a later month can be shown
     */
    private var canGoForward: Bool {
        month < BudgetMath.monthStart(.now)
    }

    /**
     * @method header
     * @description The month stepper and the new operation button
     */
    private var header: some View {
        HStack(alignment: .center, spacing: 10) {
            StepperButton(
                title: Formatting.monthTitle(month),
                onBack: { step(-1) },
                onForward: { step(1) },
                forwardEnabled: canGoForward
            )
            Spacer(minLength: 8)
            HeaderAddButton {
                preferences.tap()
                onNewOperation()
            }
        }
    }

    /**
     * @method showDispatchNote
     * @description Whether to say some of the budget isn't dispatched to a category yet
     */
    private var showDispatchNote: Bool {
        hasOperations && toDispatch > 0
    }

    /**
     * @method statCards
     * @description The spent, days-left and per-day figures for the current month; the spent and daily-average
     * figures for a past one, whose days are all gone
     */
    private var statCards: some View {
        HStack(spacing: 10) {
            StatCard(label: String(appLocalized: "Spent"), value: hasOperations ? Formatting.euro(summary.spent) : "•")
            if isCurrentMonth {
                StatCard(label: String(appLocalized: "Days left"), value: hasOperations ? "\(summary.daysLeft)" : "•")
                StatCard(label: String(appLocalized: "Left a day"), value: hasOperations ? Formatting.euro(summary.perDay) : "•")
            } else {
                StatCard(label: String(appLocalized: "A day on average"), value: hasOperations ? Formatting.euro(summary.dailyAverage) : "•")
            }
        }
    }

    /**
     * @method categoryHeader
     * @description The categories' title, with the link to edit the month's limits
     */
    private var categoryHeader: some View {
        HStack {
            SectionLabel(String(appLocalized: "By category"))
            Spacer(minLength: 12)
            InlineLink(title: String(appLocalized: "Edit limits")) {
                preferences.tap()
                showLimits = true
            }
        }
    }

    /**
     * @method categoryList
     * @description Every category against its limit, or why there is none
     */
    @ViewBuilder
    private var categoryList: some View {
        if shownFigures == nil, let failure {
            EmptyStateCard(message: failure)
        } else if shownFigures == nil && !hasOperations {
            ProgressView()
                .tint(Theme.accent)
                .frame(maxWidth: .infinity)
                .padding(.top, 12)
        } else if !hasOperations {
            EmptyStateCard(message: String(appLocalized: "No operations in this month."))
        } else if spends.isEmpty {
            EmptyStateCard(message: String(appLocalized: "No spending yet this month. Log an operation and your categories will fill in here."))
        } else {
            let changes = self.changes
            VStack(spacing: 16) {
                ForEach(spends) { spend in
                    Button {
                        preferences.tap()
                        onOpenCategory(spend.category, month)
                    } label: {
                        CategoryProgressRow(spend: spend, isCompared: changes.keys.contains(spend.id), change: changes[spend.id] ?? nil)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    /**
     * @method step
     * @description Shows the previous or the next month
     *
     * @param direction -1 for the previous month, 1 for the next
     */
    private func step(_ direction: Int) {
        preferences.tap()
        withAnimation(.easeOut(duration: 0.25)) {
            month = BudgetMath.shiftMonth(month, by: direction)
        }
    }
}

/**
 * @class CategoryProgressRow
 * @description A category against its limit: its icon, name, figures and bar, red once over
 */
private struct CategoryProgressRow: View {
    let spend: CategorySpend /*!< The category and what was spent in it */
    var isCompared = false /*!< Whether it is compared with its usual spending, which shows the badge */
    var change: Double? = nil /*!< Its change from usual by the same day, as a fraction, nil when it usually spends nothing */

    /**
     * @method body
     * @description The row
     */
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 11) {
                IconTile(symbol: spend.category.symbol, color: spend.category.color)
                Text(spend.category.title)
                    .font(Theme.font(14))
                    .foregroundStyle(Theme.text)
                    .lineLimit(1)
                Spacer(minLength: 8)
                if isCompared {
                    TrendBadge(change: change)
                }
                Text(rangeText)
                    .font(Theme.font(13))
                    .foregroundStyle(spend.isOverBudget ? Theme.negative : Theme.muted)
                    .lineLimit(1)
                    .fixedSize()
            }
            TrackBar(
                progress: spend.progress,
                color: spend.isOverBudget ? Theme.negative : spend.category.color
            )
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel(spend.category.title + ", " + rangeText)
    }

    /**
     * @method rangeText
     * @description What was spent, over the limit when there is one
     */
    private var rangeText: String {
        guard spend.limit > 0 else {
            return Formatting.euro(spend.spent)
        }
        return Formatting.euro(spend.spent) + " / " + Formatting.euro(spend.limit)
    }
}
