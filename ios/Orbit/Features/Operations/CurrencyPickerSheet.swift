import SwiftUI

/**
 * @class CurrencyPickerSheet
 * @description The sheet picking the currency an operation is entered in, each with its rate to the euro
 */
struct CurrencyPickerSheet: View {
    @Binding var selection: String /*!< The currency picked */

    @Environment(ExchangeRates.self) private var rates /*!< The exchange rates */
    @Environment(Preferences.self) private var preferences /*!< The device's settings, for the haptics and the last currency used */
    @Environment(\.dismiss) private var dismiss /*!< Closes the sheet */

    /**
     * @method body
     * @description The list of currencies
     */
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                SheetHeader(title: String(appLocalized: "Currency")) { dismiss() }
                    .padding(.bottom, 16)

                VStack(spacing: 0) {
                    ForEach(Array(rates.currencies.enumerated()), id: \.element.id) { index, currency in
                        Button {
                            preferences.tap()
                            selection = currency.code
                            dismiss()
                        } label: {
                            row(currency)
                        }
                        .buttonStyle(.plain)
                        if index < rates.currencies.count - 1 {
                            RowDivider()
                        }
                    }
                }
                .glassCard()
            }
            .padding(.top, 20)
            .padding(.horizontal, Theme.screenPadding)
            .padding(.bottom, 32)
        }
        .scrollIndicators(.hidden)
        .screenBackground()
        .presentationDragIndicator(.visible)
    }

    /**
     * @method row
     * @description One currency: its code, its name and its rate, checked when picked
     *
     * @param currency The currency
     * @returns The row
     */
    private func row(_ currency: Currency) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 1) {
                Text(currency.code)
                    .font(Theme.font(14))
                    .foregroundStyle(Theme.text)
                Text(currency.title)
                    .font(Theme.font(12))
                    .foregroundStyle(Theme.muted)
            }

            Spacer(minLength: 8)

            Image(systemName: "checkmark")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.accent)
                .opacity(selection == currency.code ? 1 : 0)
        }
        .padding(.vertical, 11)
        .padding(.horizontal, 14)
        .contentShape(Rectangle())
    }
}
