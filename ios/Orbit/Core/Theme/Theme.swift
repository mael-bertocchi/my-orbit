import SwiftUI
import UIKit

/**
 * @type Theme
 * @description Every colour and size the interface uses, and its fonts: dark Liquid Glass, violet accent
 */
enum Theme {

    /**
     * @constant background
     * @description The screen's base, pure black
     */
    static let background   = Color(hex: 0x000000)
    /**
     * @constant surface
     * @description A raised surface
     */
    static let surface      = Color(hex: 0x161620)
    /**
     * @constant neutral900
     * @description The darkest neutral, under tracks and inputs
     */
    static let neutral900   = Color(hex: 0x101016)
    /**
     * @constant neutral800
     * @description A dark neutral, the ring's empty track
     */
    static let neutral800   = Color(hex: 0x20202A)
    /**
     * @constant neutral400
     * @description A mid neutral
     */
    static let neutral400   = Color(hex: 0x9A9AA8)

    /**
     * @constant text
     * @description The main text
     */
    static let text  = Color(hex: 0xF3F3F6)
    /**
     * @constant muted
     * @description Secondary text
     */
    static let muted = Color.white.opacity(0.56)
    /**
     * @constant faint
     * @description Tertiary text and placeholders
     */
    static let faint = Color.white.opacity(0.34)

    /**
     * @constant divider
     * @description The hairlines between rows
     */
    static let divider = Color.white.opacity(0.11)

    /**
     * @constant accent
     * @description The violet accent
     */
    static let accent    = Color(hex: 0xA78BFA)
    /**
     * @constant accent900
     * @description The accent's darkest shade
     */
    static let accent900 = Color(hex: 0x2B2741)
    /**
     * @constant accent300
     * @description A light shade of the accent
     */
    static let accent300 = Color(hex: 0xD2CEFD)
    /**
     * @constant accent200
     * @description The accent's lightest shade
     */
    static let accent200 = Color(hex: 0xE7E5FE)

    /**
     * @constant positive
     * @description Green, for what is fine
     */
    static let positive = Color(hex: 0x3ECF8E)
    /**
     * @constant negative
     * @description Red, for what is over or destructive
     */
    static let negative = Color(hex: 0xFF5C72)
    /**
     * @constant warning
     * @description Orange, for what needs attention
     */
    static let warning  = Color(hex: 0xFFA23E)

    /**
     * @constant glassCardFill
     * @description A glass card's fill
     */
    static let glassCardFill  = Color.white.opacity(0.055)
    /**
     * @constant glassInputFill
     * @description A glass input's fill
     */
    static let glassInputFill = Color.white.opacity(0.05)

    /**
     * @constant glassCardBorder
     * @description A glass card's border
     */
    static let glassCardBorder = Color.white.opacity(0.10)
    /**
     * @constant glassInputBorder
     * @description A glass input's border
     */
    static let glassInputBorder = Color.white.opacity(0.13)

    /**
     * @constant specularCard
     * @description The highlight along a glass card's top edge
     */
    static let specularCard = Color.white.opacity(0.14)

    /**
     * @constant glowViolet
     * @description The violet ambient glow
     */
    static let glowViolet = Color(hex: 0xA78BFA).opacity(0.22)
    /**
     * @constant glowBlue
     * @description The blue ambient glow
     */
    static let glowBlue   = Color(hex: 0x4D9BFF).opacity(0.17)
    /**
     * @constant glowTeal
     * @description The teal ambient glow
     */
    static let glowTeal   = Color(hex: 0x38D6D6).opacity(0.14)

    /**
     * @method font
     * @description The system font at a size that follows Dynamic Type, up to 1.4 times
     *
     * @param size The size at the default text size
     * @param weight The weight
     * @returns The font
     */
    static func font(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .system(size: scaled(size), weight: weight)
    }

    /**
     * @method mono
     * @description The monospaced system font at a size that follows Dynamic Type
     *
     * @param size The size at the default text size
     * @param weight The weight
     * @returns The font
     */
    static func mono(_ size: CGFloat, _ weight: Font.Weight = .medium) -> Font {
        .system(size: scaled(size), weight: weight, design: .monospaced)
    }

    /**
     * @method scaled
     * @description A size scaled with Dynamic Type, capped at 1.4 times
     *
     * @param size The size at the default text size
     * @returns The scaled size
     */
    private static func scaled(_ size: CGFloat) -> CGFloat {
        let metrics = UIFontMetrics(forTextStyle: textStyle(for: size))
        return min(metrics.scaledValue(for: size), size * 1.4)
    }

    /**
     * @method textStyle
     * @description The text style a size scales like
     *
     * @param size The size
     * @returns The text style
     */
    private static func textStyle(for size: CGFloat) -> UIFont.TextStyle {
        switch size {
        case ..<11: return .caption2
        case ..<13: return .caption1
        case ..<15: return .footnote
        case ..<17: return .body
        case ..<22: return .title3
        case ..<28: return .title1
        default: return .largeTitle
        }
    }

    /**
     * @constant screenPadding
     * @description The margin along the screen's sides
     */
    static let screenPadding: CGFloat = 22
    /**
     * @constant heroRadius
     * @description The corner radius of the largest cards
     */
    static let heroRadius: CGFloat = 18
    /**
     * @constant cardRadius
     * @description The corner radius of a card
     */
    static let cardRadius: CGFloat = 14
    /**
     * @constant statRadius
     * @description The corner radius of a figure card
     */
    static let statRadius: CGFloat = 12
    /**
     * @constant chipRadius
     * @description The corner radius of a chip
     */
    static let chipRadius: CGFloat = 12
    /**
     * @constant controlRadius
     * @description The corner radius of a button
     */
    static let controlRadius: CGFloat = 10
    /**
     * @constant inputRadius
     * @description The corner radius of an input
     */
    static let inputRadius: CGFloat = 8
    /**
     * @constant tileRadius
     * @description The corner radius of an icon tile
     */
    static let tileRadius: CGFloat = 9
    /**
     * @constant trackRadius
     * @description The corner radius of a progress track
     */
    static let trackRadius: CGFloat = 3

    /**
     * @constant trackHeight
     * @description A progress track's thickness
     */
    static let trackHeight: CGFloat = 6
    /**
     * @constant inputHeight
     * @description An input's height
     */
    static let inputHeight: CGFloat = 36
    /**
     * @constant primaryButtonHeight
     * @description A main button's height
     */
    static let primaryButtonHeight: CGFloat = 48
    /**
     * @constant minHitTarget
     * @description The smallest area a tap should have
     */
    static let minHitTarget: CGFloat = 44
}

extension Color {
    /**
     * @constructor init
     * @description A colour from a packed 0xRRGGBB value
     *
     * @param hex The value
     */
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }
}

extension UIColor {
    /**
     * @constructor init
     * @description A colour from a packed 0xRRGGBB value
     *
     * @param hex The value
     */
    convenience init(hex: UInt32) {
        self.init(
            red: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: 1
        )
    }
}
