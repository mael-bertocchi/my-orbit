import SwiftUI

/**
 * @class TrackBar
 * @description A thin progress bar, for a category against its limit
 */
struct TrackBar: View {
    var progress: Double /*!< How full it is, between 0 and 1 */
    var color: Color /*!< The filled part's colour */
    var height: CGFloat = Theme.trackHeight /*!< Its thickness */

    /**
     * @method body
     * @description The bar
     */
    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: Theme.trackRadius, style: .continuous)
                    .fill(Theme.neutral900)
                RoundedRectangle(cornerRadius: Theme.trackRadius, style: .continuous)
                    .fill(color)
                    .frame(width: max(0, min(1, progress)) * geometry.size.width)
            }
        }
        .frame(height: height)
        .accessibilityHidden(true)
    }
}

/**
 * @class BudgetRing
 * @description The budget ring: a thick arc around the month's main figure, filling as the budget goes
 */
struct BudgetRing: View {
    var progress: Double /*!< How much of the budget is spent, between 0 and 1 */
    var caption: String /*!< What the figure is, above it */
    var amount: String /*!< The figure */
    var subtitle: String /*!< What the figure is measured against, under it */
    var color: Color = Theme.accent /*!< The arc's colour */

    private let diameter: CGFloat = 214 /*!< The ring's diameter */
    private let thickness: CGFloat = 21 /*!< The arc's thickness */

    @State private var animatedProgress: Double = 0 /*!< The progress drawn, which follows the real one with an animation */

    /**
     * @method body
     * @description The ring
     */
    var body: some View {
        ZStack {
            Circle()
                .stroke(Theme.neutral800, lineWidth: thickness)
            Circle()
                .trim(from: 0, to: max(0, min(1, animatedProgress)))
                .stroke(color, style: StrokeStyle(lineWidth: thickness, lineCap: .butt))
                .rotationEffect(.degrees(-90))
            VStack(spacing: 2) {
                Text(caption.uppercased())
                    .font(Theme.font(11))
                    .kerning(0.88)
                    .foregroundStyle(Theme.muted)
                Text(amount)
                    .font(Theme.font(40, .semibold))
                    .tracking(-0.8)
                    .foregroundStyle(Theme.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                Text(subtitle)
                    .font(Theme.font(12))
                    .foregroundStyle(Theme.muted)
            }
            .padding(.horizontal, thickness + 8)
        }
        .padding(thickness / 2)
        .frame(width: diameter, height: diameter)
        .onAppear {
            withAnimation(.easeOut(duration: 0.4)) {
                animatedProgress = progress
            }
        }
        .onChange(of: progress) { _, value in
            withAnimation(.easeOut(duration: 0.4)) {
                animatedProgress = value
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel([caption, amount, subtitle].joined(separator: " "))
    }
}
