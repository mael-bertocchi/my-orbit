import SwiftUI

/**
 * @class IconTile
 * @description A glyph on a tinted rounded tile, like a category's icon
 */
struct IconTile: View {
    let symbol: String /*!< The SF Symbol drawn */
    let color: Color /*!< The glyph's colour, which tints the tile */
    var size: CGFloat = 32 /*!< The tile's side */
    var radius: CGFloat = Theme.tileRadius /*!< The tile's corner radius */
    var glyphSize: CGFloat = 16 /*!< The glyph's size */
    var background: Color? /*!< The tile's fill, a tint of the colour by default */

    /**
     * @method body
     * @description The tile
     */
    var body: some View {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
            .fill(background ?? color.opacity(0.20))
            .frame(width: size, height: size)
            .overlay(
                Image(systemName: symbol)
                    .font(.system(size: glyphSize, weight: .regular))
                    .foregroundStyle(color)
            )
    }
}

/**
 * @class StatCard
 * @description A small card with a label and a figure, under the budget ring
 */
struct StatCard: View {
    let label: String /*!< What the figure is */
    let value: String /*!< The figure */

    /**
     * @method body
     * @description The card
     */
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(Theme.font(11))
                .foregroundStyle(Theme.muted)
            Text(value)
                .font(Theme.font(18, .semibold))
                .foregroundStyle(Theme.text)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 12)
        .padding(.horizontal, 14)
        .glassCard(radius: Theme.statRadius)
        .accessibilityElement(children: .combine)
    }
}

/**
 * @class CategoryChip
 * @description A category to pick, as a chip with its icon and name
 */
struct CategoryChip: View {
    let category: Category /*!< The category */
    let isSelected: Bool /*!< Whether it is the one picked */
    let action: () -> Void /*!< Picks it */

    /**
     * @method body
     * @description The chip
     */
    var body: some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: category.symbol)
                    .font(.system(size: 20, weight: .regular))
                    .frame(height: 24)
                Text(category.title)
                    .font(Theme.font(10))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .foregroundStyle(isSelected ? category.color : Theme.muted)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 11)
            .padding(.horizontal, 4)
            .background(
                isSelected ? AnyShapeStyle(category.chipBackground) : AnyShapeStyle(Theme.surface),
                in: RoundedRectangle(cornerRadius: Theme.chipRadius, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: Theme.chipRadius, style: .continuous)
                    .strokeBorder(isSelected ? category.color : Theme.divider, lineWidth: 1)
            )
            .contentShape(RoundedRectangle(cornerRadius: Theme.chipRadius, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(category.title)
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }
}

/**
 * @class FieldLabel
 * @description The small label above a field
 */
struct FieldLabel: View {
    let text: String /*!< The label */

    /**
     * @constructor init
     * @description Labels a field
     *
     * @param text The label
     */
    init(_ text: String) {
        self.text = text
    }

    /**
     * @method body
     * @description The label
     */
    var body: some View {
        Text(text)
            .font(Theme.font(12))
            .foregroundStyle(Theme.muted)
    }
}

/**
 * @class GlassField
 * @description A field on a glass input, with its label above
 */
struct GlassField<Content: View>: View {
    var label: String? /*!< The label, if any */
    @ViewBuilder var content: () -> Content /*!< The field */

    /**
     * @method body
     * @description The labelled field
     */
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let label {
                FieldLabel(label)
            }
            content()
                .font(Theme.font(14))
                .foregroundStyle(Theme.text)
                .padding(.horizontal, 12)
                .frame(minHeight: Theme.inputHeight)
                .frame(maxWidth: .infinity, alignment: .leading)
                .glassInput()
        }
    }
}
