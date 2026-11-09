import SwiftUI

/**
 * @class EmptyStateCard
 * @description A quiet card saying there is nothing to show yet, with an optional link to fix that
 */
struct EmptyStateCard: View {
    let message: String /*!< What there is nothing of yet */
    var actionTitle: String? /*!< The link's title, if there is one */
    var action: (() -> Void)? /*!< What the link does */

    /**
     * @method body
     * @description The card
     */
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(message)
                .font(Theme.font(13))
                .foregroundStyle(Theme.muted)
                .lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
            if let actionTitle, let action {
                InlineLink(title: actionTitle, action: action)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .glassCard()
    }
}
