import SwiftUI

/**
 * @class GlassStyle
 * @description How a Liquid Glass surface is drawn: its fill, border, top highlight and blur
 */
struct GlassStyle {
    var fill: Color /*!< The tint over the blur */
    var border: Color /*!< The border */
    var specular: Color /*!< The highlight along the top edge */
    var blur: Material /*!< The blur behind it */

    /**
     * @constant card
     * @description A card's glass
     */
    static let card = GlassStyle(
        fill: Theme.glassCardFill,
        border: Theme.glassCardBorder,
        specular: Theme.specularCard,
        blur: .ultraThinMaterial
    )

    /**
     * @constant input
     * @description An input's glass
     */
    static let input = GlassStyle(
        fill: Theme.glassInputFill,
        border: Theme.glassInputBorder,
        specular: Theme.specularCard,
        blur: .ultraThinMaterial
    )
}

/**
 * @class GlassSurface
 * @description Draws a view on a rounded Liquid Glass surface
 */
struct GlassSurface: ViewModifier {
    var radius: CGFloat /*!< The surface's corner radius */
    var style: GlassStyle /*!< How the glass is drawn */
    var shadow: Bool /*!< Whether it casts a shadow */

    /**
     * @method shape
     * @description The surface's shape
     */
    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
    }

    /**
     * @method body
     * @description The view on its glass surface
     *
     * @param content The view
     * @returns The view on glass
     */
    func body(content: Content) -> some View {
        content
            .background {
                shape
                    .fill(style.blur)
                    .overlay(shape.fill(style.fill))
            }
            .overlay(shape.strokeBorder(style.border, lineWidth: 1))
            .overlay(
                shape.strokeBorder(
                    LinearGradient(
                        stops: [
                            .init(color: style.specular, location: 0),
                            .init(color: .clear, location: 0.35)
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    ),
                    lineWidth: 1
                )
            )
            .compositingGroup()
            .shadow(color: shadow ? Color.black.opacity(0.45) : .clear, radius: 13, y: 10)
    }
}

extension View {
    /**
     * @method glassCard
     * @description Puts the view on a glass card
     *
     * @param radius The card's corner radius
     * @returns The view on glass
     */
    func glassCard(radius: CGFloat = Theme.cardRadius) -> some View {
        modifier(GlassSurface(radius: radius, style: .card, shadow: false))
    }

    /**
     * @method glassInput
     * @description Puts the view on a glass input
     *
     * @param radius The input's corner radius
     * @returns The view on glass
     */
    func glassInput(radius: CGFloat = Theme.inputRadius) -> some View {
        modifier(GlassSurface(radius: radius, style: .input, shadow: false))
    }
}

/**
 * @class AmbientBackground
 * @description The screens' background: black, with violet, blue and teal glows at its edges
 */
struct AmbientBackground: View {
    /**
     * @method body
     * @description The background
     */
    var body: some View {
        ZStack {
            Theme.background
            glow(Theme.glowViolet, center: UnitPoint(x: 0.12, y: -0.05), radius: 0.66)
            glow(Theme.glowBlue, center: UnitPoint(x: 1.06, y: 0.14), radius: 0.62)
            glow(Theme.glowTeal, center: UnitPoint(x: 0.5, y: 1.12), radius: 0.66)
        }
        .ignoresSafeArea()
    }

    /**
     * @method glow
     * @description One soft glow
     *
     * @param color Its colour
     * @param center Where it sits
     * @param radius How far it reaches, as a fraction of the screen
     * @returns The glow
     */
    private func glow(_ color: Color, center: UnitPoint, radius: CGFloat) -> some View {
        EllipticalGradient(
            colors: [color, .clear],
            center: center,
            startRadiusFraction: 0,
            endRadiusFraction: radius
        )
    }
}

/**
 * @class ScreenBackground
 * @description Puts the ambient background behind a screen
 */
struct ScreenBackground: ViewModifier {
    /**
     * @method body
     * @description The screen on its background
     *
     * @param content The screen
     * @returns The screen on its background
     */
    func body(content: Content) -> some View {
        content.background(AmbientBackground())
    }
}

extension View {
    /**
     * @method screenBackground
     * @description Puts the ambient background behind the view
     *
     * @returns The view on its background
     */
    func screenBackground() -> some View {
        modifier(ScreenBackground())
    }

    /**
     * @method scrollTopBlur
     * @description Blurs what scrolls under the status bar
     *
     * @returns The view with the blur
     */
    func scrollTopBlur() -> some View {
        modifier(ScrollTopBlur())
    }
}

/**
 * @class ScrollTopBlur
 * @description A blur along the top edge that fades in once the content scrolls under it, like an iOS navigation bar
 */
struct ScrollTopBlur: ViewModifier {
    @State private var isScrolled = false /*!< Whether the content is scrolled */

    /**
     * @method body
     * @description The content with its blur
     *
     * @param content The scrolling content
     * @returns The content with the blur
     */
    func body(content: Content) -> some View {
        content
            .onScrollGeometryChange(for: Bool.self) { geometry in
                geometry.contentOffset.y + geometry.contentInsets.top > 1
            } action: { _, scrolled in
                withAnimation(.easeOut(duration: 0.2)) { isScrolled = scrolled }
            }
            .overlay(alignment: .top) {
                Rectangle()
                    .fill(.ultraThinMaterial)
                    .mask(
                        LinearGradient(
                            stops: [
                                .init(color: .black, location: 0),
                                .init(color: .black.opacity(0.95), location: 0.3),
                                .init(color: .black.opacity(0.78), location: 0.5),
                                .init(color: .black.opacity(0.44), location: 0.68),
                                .init(color: .black.opacity(0.14), location: 0.85),
                                .init(color: .clear, location: 1)
                            ],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                    .frame(height: 84)
                    .opacity(isScrolled ? 0.88 : 0)
                    .allowsHitTesting(false)
                    .ignoresSafeArea(edges: .top)
            }
    }
}

/**
 * @class SectionLabel
 * @description A section's title, in small capitals
 */
struct SectionLabel: View {
    let text: String /*!< The title */
    var color: Color = Theme.muted /*!< Its colour */

    /**
     * @constructor init
     * @description Titles a section
     *
     * @param text The title
     * @param color Its colour
     */
    init(_ text: String, color: Color = Theme.muted) {
        self.text = text
        self.color = color
    }

    /**
     * @method body
     * @description The title
     */
    var body: some View {
        Text(text.uppercased())
            .font(Theme.font(11))
            .kerning(0.88)
            .foregroundStyle(color)
    }
}

/**
 * @class DayLabel
 * @description A day's heading in History, in small capitals
 */
struct DayLabel: View {
    let text: String /*!< The day */

    /**
     * @constructor init
     * @description Heads a day
     *
     * @param text The day
     */
    init(_ text: String) {
        self.text = text
    }

    /**
     * @method body
     * @description The heading
     */
    var body: some View {
        Text(text.uppercased())
            .font(Theme.font(12))
            .kerning(0.72)
            .foregroundStyle(Theme.muted)
    }
}

/**
 * @class RowDivider
 * @description The hairline between two rows of a card
 */
struct RowDivider: View {
    /**
     * @method body
     * @description The hairline
     */
    var body: some View {
        Rectangle()
            .fill(Theme.divider)
            .frame(height: 1)
    }
}

/**
 * @class StatusDot
 * @description A small coloured dot, for a status
 */
struct StatusDot: View {
    var color: Color /*!< Its colour */
    var size: CGFloat = 7 /*!< Its diameter */

    /**
     * @method body
     * @description The dot
     */
    var body: some View {
        Circle()
            .fill(color)
            .frame(width: size, height: size)
    }
}
