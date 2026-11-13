import SwiftUI

/**
 * @class OrbitSatellite
 * @description A glyph that travels on one of the orbits around the mark
 */
private struct OrbitSatellite {
    let systemImage: String /*!< Its SF Symbol */
    let angle: Double /*!< Where it starts on its orbit, in degrees clockwise from the right */
    let size: CGFloat /*!< The side of its disc or tile, in points */
    let isFeatured: Bool /*!< Whether it stands for the budget itself, drawn on the mark's slate rather than on glass */
}

/**
 * @class OrbitPath
 * @description One circle around the mark and the glyphs that travel on it
 */
private struct OrbitPath {
    let radius: CGFloat /*!< Its radius, in points */
    let secondsPerTurn: Double /*!< How long one turn takes */
    let isReversed: Bool /*!< Whether it turns anticlockwise */
    let satellites: [OrbitSatellite] /*!< What travels on it */

    /**
     * @method offset
     * @description Where a satellite stands at a moment, from the centre of the orbit
     *
     * @param satellite The satellite
     * @param time The moment, in seconds
     * @returns Its offset from the centre
     */
    func offset(of satellite: OrbitSatellite, at time: TimeInterval) -> CGSize {
        let turned = time.truncatingRemainder(dividingBy: secondsPerTurn) / secondsPerTurn * 360
        let degrees = satellite.angle + (isReversed ? -turned : turned)
        let radians = degrees * .pi / 180

        return CGSize(width: cos(radians) * radius, height: sin(radians) * radius)
    }
}

/**
 * @class OrbitHero
 * @description The sign-in screen's picture: Orbit's mark, with what the budget keeps track of turning around it on two
 * faint orbits, the inner one clockwise and the outer one the other way. The glyphs move along their orbits without
 * turning, so they stay upright, and everything stands still when the device asks for less motion
 */
struct OrbitHero: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion /*!< Whether the device asks for less motion */

    /**
     * @constant side
     * @description The side of the square the picture draws in, wide enough for the outer orbit and its discs
     */
    private static let side: CGFloat = 300

    /**
     * @constant markSize
     * @description The side of the mark at the centre
     */
    private static let markSize: CGFloat = 84

    /**
     * @constant orbits
     * @description The two orbits: the inner one carries the budget, its analysis and its history, the outer one the
     * smaller things the budget keeps track of
     */
    private static let orbits: [OrbitPath] = [
        OrbitPath(radius: 88, secondsPerTurn: 70, isReversed: false, satellites: [
            OrbitSatellite(systemImage: "wallet.bifold", angle: -40, size: 44, isFeatured: true),
            OrbitSatellite(systemImage: "chart.pie", angle: 60, size: 34, isFeatured: false),
            OrbitSatellite(systemImage: "clock.arrow.circlepath", angle: 150, size: 34, isFeatured: false)
        ]),
        OrbitPath(radius: 130, secondsPerTurn: 110, isReversed: true, satellites: [
            OrbitSatellite(systemImage: "repeat", angle: 10, size: 30, isFeatured: false),
            OrbitSatellite(systemImage: "mappin", angle: 100, size: 32, isFeatured: false),
            OrbitSatellite(systemImage: "creditcard", angle: 195, size: 32, isFeatured: false),
            OrbitSatellite(systemImage: "globe", angle: 275, size: 28, isFeatured: false)
        ])
    ]

    /**
     * @method body
     * @description The picture
     */
    var body: some View {
        TimelineView(.animation(paused: reduceMotion)) { context in
            let time = reduceMotion ? 0 : context.date.timeIntervalSinceReferenceDate

            ZStack {
                Circle()
                    .fill(RadialGradient(colors: [Theme.accent.opacity(0.22), .clear], center: .center, startRadius: 0, endRadius: Self.side * 0.32))

                ForEach(Self.orbits.indices, id: \.self) { index in
                    orbit(Self.orbits[index], at: time)
                }

                Image("Mark")
                    .resizable()
                    .frame(width: Self.markSize, height: Self.markSize)
                    .shadow(color: .black.opacity(0.45), radius: 18, y: 10)
            }
            .frame(width: Self.side, height: Self.side)
        }
        .accessibilityHidden(true)
    }

    /**
     * @method orbit
     * @description An orbit's circle and its satellites where they stand at a moment
     *
     * @param path The orbit
     * @param time The moment, in seconds
     * @returns The orbit
     */
    private func orbit(_ path: OrbitPath, at time: TimeInterval) -> some View {
        ZStack {
            Circle()
                .strokeBorder(Color.white.opacity(0.09), lineWidth: 1)
                .frame(width: path.radius * 2, height: path.radius * 2)

            ForEach(path.satellites.indices, id: \.self) { index in
                let satellite = path.satellites[index]

                disc(satellite)
                    .offset(path.offset(of: satellite, at: time))
            }
        }
    }

    /**
     * @method disc
     * @description A satellite's glyph, on the mark's slate for the budget itself and on a glass disc for the rest
     *
     * @param satellite The satellite
     * @returns The disc
     */
    @ViewBuilder
    private func disc(_ satellite: OrbitSatellite) -> some View {
        let glyph = Image(systemName: satellite.systemImage)
            .font(.system(size: satellite.size * 0.44, weight: .medium))
            .frame(width: satellite.size, height: satellite.size)

        if satellite.isFeatured {
            glyph
                .foregroundStyle(.white)
                .background(LinearGradient(colors: [Color(hex: 0x6B7787), Color(hex: 0x434C59)], startPoint: .topLeading, endPoint: .bottomTrailing), in: RoundedRectangle(cornerRadius: satellite.size * 0.27, style: .continuous))
                .shadow(color: .black.opacity(0.4), radius: 10, y: 5)
        } else {
            glyph
                .foregroundStyle(Theme.accent300)
                .background(Theme.surface, in: Circle())
                .overlay(Circle().strokeBorder(Theme.glassCardBorder, lineWidth: 1))
        }
    }
}
