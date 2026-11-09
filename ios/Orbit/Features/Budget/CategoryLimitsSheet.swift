import SwiftUI

/**
 * @class CategoryLimitsSheet
 * @description The sheet editing a month's budget and each category's limit, with what is left to dispatch. A past
 * month's budget is its own; the current month's carries on to the next ones
 */
struct CategoryLimitsSheet: View {
    var month: Date = BudgetMath.monthStart(.now) /*!< The month whose budget is edited */

    @Environment(LocalStore.self) private var store /*!< The budget */
    @Environment(Preferences.self) private var preferences /*!< The device's settings, for the haptics */
    @Environment(\.dismiss) private var dismiss /*!< Closes the sheet */

    @State private var monthlyLimit: String = "" /*!< The monthly budget, as typed */
    @State private var limits: [String: String] = [:] /*!< Each category's limit, as typed, by category id */

    @FocusState private var focus: Field? /*!< The field being typed in */

    /**
     * @type Field
     * @description The sheet's fields
     */
    private enum Field: Hashable {
        case monthly /*!< The monthly budget */
        case category(String) /*!< A category's limit */
    }

    /**
     * @method body
     * @description The sheet
     */
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                SheetHeader(title: String(appLocalized: "Edit limits")) { dismiss() }
                    .padding(.bottom, 8)

                Text(scopeText)
                    .font(Theme.font(13))
                    .foregroundStyle(Theme.muted)
                    .padding(.bottom, 20)

                FieldLabel(String(appLocalized: "Monthly budget"))
                    .padding(.bottom, 6)
                HStack(spacing: 6) {
                    Text(verbatim: "€")
                        .font(Theme.font(15))
                        .foregroundStyle(Theme.muted)
                    TextField("", text: $monthlyLimit, prompt: Text(verbatim: "3000").foregroundStyle(Theme.faint))
                        .focused($focus, equals: .monthly)
                        .keyboardType(.decimalPad)
                        .font(Theme.font(15, .medium))
                        .foregroundStyle(Theme.text)
                }
                .padding(.horizontal, 12)
                .frame(minHeight: Theme.inputHeight)
                .glassInput()
                .padding(.bottom, 22)

                HStack {
                    SectionLabel(String(appLocalized: "Category limits"))
                    Spacer(minLength: 12)
                    Text(dispatchText)
                        .font(Theme.font(12))
                        .foregroundStyle(dispatchColor)
                }
                .padding(.bottom, 12)

                VStack(spacing: 10) {
                    ForEach(store.categories) { category in
                        limitRow(category)
                    }
                }

                PrimaryButton(title: String(appLocalized: "Save limits")) {
                    save()
                }
                .padding(.top, 24)
            }
            .padding(.top, 20)
            .padding(.horizontal, Theme.screenPadding)
            .padding(.bottom, 32)
            .background(
                Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture { focus = nil }
            )
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .screenBackground()
        .presentationDragIndicator(.visible)
        .onAppear(perform: loadValues)
        .onChange(of: monthlyLimit) { _, typed in
            let formatted = Formatting.groupedAmountInput(Formatting.sanitizeAmountInput(typed))
            if formatted != typed {
                monthlyLimit = formatted
            }
        }
        .onChange(of: limits) { _, typed in
            let formatted = typed.mapValues { Formatting.groupedAmountInput(Formatting.sanitizeAmountInput($0)) }
            if formatted != typed {
                limits = formatted
            }
        }
    }

    /**
     * @method scopeText
     * @description Which months the limits apply to, in words
     */
    private var scopeText: String {
        guard BudgetMath.isPastMonth(month) else {
            return String(appLocalized: "This month and the next ones: past months keep their budget.")
        }
        return String(appLocalized: "\(Formatting.monthWithYear(month)) only: the other months keep their budget.")
    }

    /**
     * @method toDispatch
     * @description What the monthly budget leaves once every limit is taken out, negative when the limits exceed it
     */
    private var toDispatch: Double {
        let budget = Formatting.parseAmountInput(monthlyLimit) ?? 0
        let allocated = store.categories.reduce(0) { total, category in
            total + (Formatting.parseAmountInput(limits[category.id] ?? "") ?? 0)
        }
        return budget - allocated
    }

    /**
     * @method dispatchText
     * @description What is left to dispatch, in words
     */
    private var dispatchText: String {
        if toDispatch > 0 {
            return String(appLocalized: "\(Formatting.euro(toDispatch)) to dispatch")
        }
        if toDispatch < 0 {
            return String(appLocalized: "\(Formatting.euro(-toDispatch)) over budget")
        }
        return String(appLocalized: "Fully dispatched")
    }

    /**
     * @method dispatchColor
     * @description The colour of what is left to dispatch: violet while some is, red when over, green when exactly
     * dispatched
     */
    private var dispatchColor: Color {
        if toDispatch > 0 {
            return Theme.accent300
        }
        if toDispatch < 0 {
            return Theme.negative
        }
        return Theme.positive
    }

    /**
     * @method limitRow
     * @description One category with its limit field
     *
     * @param category The category
     * @returns The row
     */
    private func limitRow(_ category: Category) -> some View {
        HStack(spacing: 11) {
            IconTile(symbol: category.symbol, color: category.color)
            Text(category.title)
                .font(Theme.font(14))
                .foregroundStyle(Theme.text)
            Spacer(minLength: 8)
            HStack(spacing: 4) {
                Text(verbatim: "€")
                    .font(Theme.font(14))
                    .foregroundStyle(Theme.muted)
                TextField(
                    "",
                    text: Binding(
                        get: { limits[category.id] ?? "" },
                        set: { limits[category.id] = $0 }
                    ),
                    prompt: Text(verbatim: "0").foregroundStyle(Theme.faint)
                )
                .focused($focus, equals: .category(category.id))
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .font(Theme.font(14, .medium))
                .foregroundStyle(Theme.text)
                .frame(width: 66)
            }
            .padding(.horizontal, 10)
            .frame(height: 32)
            .background(Theme.neutral900, in: RoundedRectangle(cornerRadius: Theme.inputRadius, style: .continuous))
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 12)
        .glassCard()
    }

    /**
     * @method loadValues
     * @description Fills the fields with the month's budget as stored
     */
    private func loadValues() {
        let stored = store.monthlyBudget(for: month)
        monthlyLimit = Formatting.amountInput(stored.monthlyLimit)
        limits = Dictionary(
            uniqueKeysWithValues: store.categories.map { ($0.id, Formatting.amountInput(stored.limit(for: $0.id))) }
        )
    }

    /**
     * @method save
     * @description Stores the month's budget and limits typed, keeping any left empty as they were, then closes the
     * sheet
     */
    private func save() {
        let categoryLimits = limits.compactMapValues { Formatting.parseAmountInput($0) }
        store.setMonthlyBudget(monthlyLimit: Formatting.parseAmountInput(monthlyLimit), categoryLimits: categoryLimits, for: month)
        preferences.success()
        dismiss()
    }
}
