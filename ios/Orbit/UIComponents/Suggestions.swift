import SwiftUI

/**
 * @class Suggestion
 * @description A value a field offers to fill in
 */
struct Suggestion: Identifiable, Hashable {
    var value: String /*!< What it fills in */
    var detail: String = "" /*!< A word after it, to tell two alike apart, empty when there is none */
    var key: String? /*!< What it stands for, when its text alone doesn't say */

    var id: String { key ?? "\(value)|\(detail)" } /*!< Its identifier, for the list */
}

/**
 * @class SuggestionList
 * @description The values a field offers as it is typed, under it, each picked with a tap
 */
struct SuggestionList: View {
    let suggestions: [Suggestion] /*!< What it offers */
    let onPick: (Suggestion) -> Void /*!< Called with the suggestion picked */

    /**
     * @method body
     * @description The list
     */
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(suggestions.enumerated()), id: \.element.id) { index, suggestion in
                if index > 0 {
                    RowDivider()
                }
                row(suggestion)
            }
        }
        .glassInput()
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Suggestions")
    }

    /**
     * @method row
     * @description One suggestion, with its detail
     *
     * @param suggestion The suggestion
     * @returns Its row
     */
    private func row(_ suggestion: Suggestion) -> some View {
        Button {
            onPick(suggestion)
        } label: {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(verbatim: suggestion.value)
                    .font(Theme.font(14))
                    .foregroundStyle(Theme.text)
                    .lineLimit(1)
                if !suggestion.detail.isEmpty {
                    Text(verbatim: suggestion.detail)
                        .font(Theme.font(12))
                        .foregroundStyle(Theme.muted)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12)
            .frame(minHeight: 40)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
