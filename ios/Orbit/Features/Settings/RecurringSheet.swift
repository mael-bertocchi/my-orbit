import SwiftUI

/**
 * @class RecurringSheet
 * @description The sheet managing the recurring operations, read from the server: a button adds one, and each opens to
 * be changed, paused or deleted
 */
struct RecurringSheet: View {
    @Environment(ApplicationSession.self) private var session /*!< The session with the server */
    @Environment(ExchangeRates.self) private var rates /*!< The exchange rates, for what a foreign one costs */
    @Environment(LocalStore.self) private var store /*!< The budget, for the categories */
    @Environment(Preferences.self) private var preferences /*!< The device's settings, for the haptics */
    @Environment(\.dismiss) private var dismiss /*!< Closes the sheet */

    @State private var recurring: [RecurringOperation]? /*!< The recurring operations, nil until loaded */
    @State private var failure: String? /*!< Why they couldn't be loaded */
    @State private var route: RecurringEditorRoute? /*!< What the editor is open on, nil while closed */

    /**
     * @method body
     * @description The sheet
     */
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                SheetHeader(title: String(appLocalized: "Recurring operations")) { dismiss() }
                    .padding(.bottom, 12)

                Text(verbatim: String(appLocalized: "Each one is logged as an operation on the day it falls due."))
                    .font(Theme.font(12))
                    .foregroundStyle(Theme.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.bottom, 18)

                SecondaryButton(title: String(appLocalized: "New recurring operation")) {
                    preferences.tap()
                    route = .new
                }
                .padding(.bottom, 18)

                content
            }
            .padding(.top, 20)
            .padding(.horizontal, Theme.screenPadding)
            .padding(.bottom, 32)
        }
        .scrollIndicators(.hidden)
        .screenBackground()
        .presentationDragIndicator(.visible)
        .task {
            await load()
        }
        .refreshable {
            await load()
        }
        .sheet(item: $route) { opened in
            RecurringEditorSheet(route: opened, onSaved: saved, onDeleted: deleted)
        }
    }

    /**
     * @method content
     * @description The recurring operations, a spinner while they load, or a word that there is none yet
     */
    @ViewBuilder
    private var content: some View {
        if let recurring {
            if recurring.isEmpty {
                EmptyStateCard(message: String(appLocalized: "No recurring operation yet. Add a rent or a subscription so it logs itself."))
            } else {
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
                .glassCard()
            }
        } else if let failure {
            EmptyStateCard(message: failure)
        } else {
            ProgressView()
                .tint(Theme.muted)
                .frame(maxWidth: .infinity)
                .padding(.top, 24)
        }
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
