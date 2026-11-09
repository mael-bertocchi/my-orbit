import SwiftUI

/**
 * @class ExpandedTapTarget
 * @description Widens the area a small control answers taps in, without moving it
 */
private struct ExpandedTapTarget: ViewModifier {
    var vertical: CGFloat /*!< How much is added above and below */
    var horizontal: CGFloat /*!< How much is added on each side */

    /**
     * @method body
     * @description The control with its wider tap area
     *
     * @param content The control
     * @returns The control
     */
    func body(content: Content) -> some View {
        content
            .padding(.vertical, vertical)
            .padding(.horizontal, horizontal)
            .contentShape(Rectangle())
            .padding(.vertical, -vertical)
            .padding(.horizontal, -horizontal)
    }
}

extension View {
    /**
     * @method expandedTapTarget
     * @description Widens the area the view answers taps in
     *
     * @param vertical How much is added above and below
     * @param horizontal How much is added on each side
     * @returns The view
     */
    func expandedTapTarget(vertical: CGFloat = 10, horizontal: CGFloat = 8) -> some View {
        modifier(ExpandedTapTarget(vertical: vertical, horizontal: horizontal))
    }
}

/**
 * @class PrimaryButton
 * @description The main action of a screen or a sheet: a full-width violet button
 */
struct PrimaryButton: View {
    let title: String /*!< Its title */
    var systemImage: String? /*!< An SF Symbol before the title, if any */
    var height: CGFloat = Theme.primaryButtonHeight /*!< Its height */
    var isDisabled = false /*!< Whether it can't be tapped right now */
    let action: () -> Void /*!< What it does */

    /**
     * @method body
     * @description The button
     */
    var body: some View {
        Button(action: action) {
            HStack(spacing: 7) {
                if let systemImage {
                    Image(systemName: systemImage)
                        .font(.system(size: 15, weight: .medium))
                }
                Text(title)
                    .font(Theme.font(15, .medium))
            }
            .foregroundStyle(isDisabled ? Theme.faint : Theme.accent)
            .frame(maxWidth: .infinity)
            .frame(height: height)
            .background(
                (isDisabled ? Color.white.opacity(0.04) : Theme.accent.opacity(0.16)),
                in: RoundedRectangle(cornerRadius: Theme.controlRadius, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: Theme.controlRadius, style: .continuous)
                    .strokeBorder(isDisabled ? Theme.divider : Theme.accent, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .disabled(isDisabled)
    }
}

/**
 * @class SecondaryButton
 * @description A secondary action: a full-width glass button
 */
struct SecondaryButton: View {
    let title: String /*!< Its title */
    var systemImage: String? /*!< An SF Symbol before the title, if any */
    var height: CGFloat = Theme.primaryButtonHeight /*!< Its height */
    let action: () -> Void /*!< What it does */

    /**
     * @method body
     * @description The button
     */
    var body: some View {
        Button(action: action) {
            HStack(spacing: 7) {
                if let systemImage {
                    Image(systemName: systemImage)
                        .font(.system(size: 15, weight: .medium))
                }
                Text(title)
                    .font(Theme.font(15, .medium))
            }
            .foregroundStyle(Theme.text)
            .frame(maxWidth: .infinity)
            .frame(height: height)
            .glassInput(radius: Theme.controlRadius)
        }
        .buttonStyle(.plain)
    }
}

/**
 * @class StepperButton
 * @description A title between a back and a forward chevron, to step through months
 */
struct StepperButton: View {
    let title: String /*!< What is shown, the month */
    var onBack: () -> Void /*!< Steps back */
    var onForward: () -> Void /*!< Steps forward */
    var forwardEnabled: Bool /*!< Whether stepping forward is possible */

    /**
     * @method body
     * @description The stepper
     */
    var body: some View {
        HStack(spacing: 8) {
            Button(action: onBack) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Theme.text)
                    .expandedTapTarget(vertical: 11, horizontal: 6)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Previous month")

            Text(title)
                .font(Theme.font(13))
                .foregroundStyle(Theme.text)
                .frame(minWidth: 74)

            Button(action: onForward) {
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(forwardEnabled ? Theme.text : Theme.text.opacity(0.4))
                    .expandedTapTarget(vertical: 11, horizontal: 6)
            }
            .buttonStyle(.plain)
            .disabled(!forwardEnabled)
            .accessibilityLabel("Next month")
        }
        .padding(.horizontal, 12)
        .frame(height: 34)
        .glassInput(radius: Theme.inputRadius)
    }
}

/**
 * @class FilterChip
 * @description A filter to toggle, as a small chip
 */
struct FilterChip: View {
    let title: String /*!< Its title */
    var systemImage: String? /*!< An SF Symbol before the title, if any */
    let isActive: Bool /*!< Whether the filter is applied */
    let action: () -> Void /*!< Toggles it */

    /**
     * @method body
     * @description The chip
     */
    var body: some View {
        Button(action: action) {
            HStack(spacing: 5) {
                if let systemImage {
                    Image(systemName: systemImage)
                        .font(.system(size: 11, weight: .medium))
                }
                Text(title)
                    .font(Theme.font(12, .medium))
            }
            .foregroundStyle(isActive ? Theme.accent : Theme.muted)
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(
                isActive ? AnyShapeStyle(Theme.accent.opacity(0.12)) : AnyShapeStyle(Theme.neutral900),
                in: RoundedRectangle(cornerRadius: 6, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .strokeBorder(isActive ? Theme.accent : Color.clear, lineWidth: 1)
            )
            .expandedTapTarget(vertical: 6, horizontal: 2)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isActive ? [.isSelected] : [])
    }
}

/**
 * @class SearchField
 * @description A search field on glass, with a button clearing it
 */
struct SearchField: View {
    @Binding var text: String /*!< The search typed */
    var prompt: String = String(appLocalized: "Search") /*!< What the empty field says */

    /**
     * @method body
     * @description The field
     */
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 14, weight: .regular))
                .foregroundStyle(Theme.muted)
            TextField(
                "",
                text: $text,
                prompt: Text(prompt).foregroundStyle(Theme.muted)
            )
            .font(Theme.font(14))
            .foregroundStyle(Theme.text)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .accessibilityLabel(prompt)
            if !text.isEmpty {
                Button {
                    text = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 15))
                        .foregroundStyle(Theme.faint)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear search")
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(minHeight: 38)
        .glassCard(radius: Theme.controlRadius)
    }
}

/**
 * @class InlineLink
 * @description A small violet link inside a line of text
 */
struct InlineLink: View {
    let title: String /*!< Its title */
    let action: () -> Void /*!< What it does */

    /**
     * @method body
     * @description The link
     */
    var body: some View {
        Button(action: action) {
            Text(title)
                .font(Theme.font(12))
                .foregroundStyle(Theme.accent)
                .expandedTapTarget(vertical: 12, horizontal: 8)
        }
        .buttonStyle(.plain)
    }
}

/**
 * @class SheetHeader
 * @description A sheet's title, with its close button
 */
struct SheetHeader: View {
    let title: String /*!< The title */
    var onClose: () -> Void /*!< Closes the sheet */

    /**
     * @method body
     * @description The header
     */
    var body: some View {
        HStack(alignment: .center) {
            Text(title)
                .font(Theme.font(26, .medium))
                .tracking(-0.39)
                .foregroundStyle(Theme.text)
            Spacer(minLength: 12)
            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.system(size: 18, weight: .regular))
                    .foregroundStyle(Theme.muted)
                    .expandedTapTarget(vertical: 12, horizontal: 12)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Close")
        }
    }
}

/**
 * @class ScreenTitle
 * @description A tab's large title
 */
struct ScreenTitle: View {
    let text: String /*!< The title */

    /**
     * @constructor init
     * @description Titles a tab
     *
     * @param text The title
     */
    init(_ text: String) {
        self.text = text
    }

    /**
     * @method body
     * @description The title
     */
    var body: some View {
        Text(text)
            .font(Theme.font(26, .medium))
            .tracking(-0.39)
            .foregroundStyle(Theme.text)
    }
}

/**
 * @class HeaderAddButton
 * @description The round ＋ in a tab's header, opening a new operation
 */
struct HeaderAddButton: View {
    var accessibilityLabel: String = String(appLocalized: "New operation") /*!< What VoiceOver reads for it */
    let action: () -> Void /*!< What it does */

    /**
     * @method body
     * @description The button
     */
    var body: some View {
        Button(action: action) {
            Image(systemName: "plus")
                .font(.system(size: 17, weight: .semibold))
                .frame(width: 22, height: 22)
        }
        .buttonStyle(.glassProminent)
        .buttonBorderShape(.circle)
        .tint(Theme.accent)
        .accessibilityLabel(accessibilityLabel)
    }
}
