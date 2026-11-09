import SwiftUI

/**
 * @class TrendBadge
 * @description A change from usual, with an arrow and its sign so it never rests on colour alone: spending more reads
 * red, spending less green, a change under 5% grey
 */
struct TrendBadge: View {
    let change: Double? /*!< The change, as a fraction, or nil when it usually is nothing */

    /**
     * @type Trend
     * @description Which way the figure moved
     */
    private enum Trend {
        case up /*!< More than usual */
        case down /*!< Less than usual */
        case steady /*!< About as usual */
        case new /*!< Usually nothing */
    }

    /**
     * @method body
     * @description The badge
     */
    var body: some View {
        HStack(spacing: 3) {
            if let symbol {
                Image(systemName: symbol)
                    .font(.system(size: 10, weight: .bold))
            }
            Text(verbatim: label)
                .font(Theme.font(11, .semibold))
                .monospacedDigit()
        }
        .foregroundStyle(color)
        .padding(.vertical, 3)
        .padding(.horizontal, 7)
        .background(color.opacity(0.16), in: Capsule())
    }

    /**
     * @method trend
     * @description Which way the figure moved, a change rounding under 5% reading as steady
     */
    private var trend: Trend {
        guard let change else {
            return .new
        }
        if (abs(change) * 100).rounded() < 5 {
            return .steady
        }
        return change > 0 ? .up : .down
    }

    /**
     * @method label
     * @description The change, signed, or a word that it is new
     */
    private var label: String {
        guard let change else {
            return String(appLocalized: "New")
        }
        return (change > 0 ? "+" : "") + Formatting.percent(change)
    }

    /**
     * @method symbol
     * @description The arrow drawn before the change
     */
    private var symbol: String? {
        switch trend {
        case .up: return "arrow.up.right"
        case .down: return "arrow.down.right"
        case .steady: return "minus"
        case .new: return nil
        }
    }

    /**
     * @method color
     * @description The badge's colour
     */
    private var color: Color {
        switch trend {
        case .up: return Theme.negative
        case .down: return Theme.positive
        case .steady: return Theme.muted
        case .new: return Theme.accent
        }
    }
}
