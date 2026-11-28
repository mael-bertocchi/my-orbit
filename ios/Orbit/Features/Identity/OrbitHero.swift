import SwiftUI

/**
 * @class OrbitSatellite
 * @description A glyph that travels on one of the orbits around the sun
 */
private struct OrbitSatellite {
    let systemImage: String /*!< Its SF Symbol */
    let angle: Double /*!< Where it starts on its orbit, in degrees clockwise from the right */
    let size: CGFloat /*!< The diameter of its disc, in points */
}

/**
 * @class OrbitPath
 * @description One circle around the sun and the glyphs that travel on it
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
 * @description The sign-in screen's picture: a warm sun in its golden halo, with what the budget keeps track of turning
 * around it on two faint orbits, the inner one clockwise and the outer one the other way. The glyphs move along their orbits without
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
     * @constant sunSize
     * @description The diameter of the sun at the centre
     */
    private static let sunSize: CGFloat = 56

    /**
     * @constant haloSize
     * @description The diameter of the golden halo the sun casts around it
     */
    private static let haloSize: CGFloat = 140

    /**
     * @constant sunShading
     * @description The sun's light: a warm white at its heart, turning golden toward its edge
     */
    private static let sunShading = RadialGradient(stops: [
        .init(color: Color(hex: 0xFFFDF8), location: 0),
        .init(color: Color(hex: 0xF4E9D3), location: 0.7),
        .init(color: Color(hex: 0xE2CFAC), location: 1)
    ], center: UnitPoint(x: 0.45, y: 0.42), startRadius: 0, endRadius: sunSize * 0.6)

    /**
     * @constant haloGlow
     * @description The halo's glow, golden near the sun and fading out before its edge
     */
    private static let haloGlow = RadialGradient(stops: [
        .init(color: Color(hex: 0xF3E6CC).opacity(0.9), location: 0),
        .init(color: Color(hex: 0xE8D6B4).opacity(0.45), location: 0.35),
        .init(color: .clear, location: 0.7)
    ], center: .center, startRadius: 0, endRadius: haloSize / 2)

    /**
     * @constant orbits
     * @description The two orbits: the inner one carries the budget's analysis and history, the outer one the smaller
     * things the budget keeps track of
     */
    private static let orbits: [OrbitPath] = [
        OrbitPath(radius: 88, secondsPerTurn: 70, isReversed: false, satellites: [
            OrbitSatellite(systemImage: "chart.pie", angle: 60, size: 34),
            OrbitSatellite(systemImage: "clock.arrow.circlepath", angle: 220, size: 34)
        ]),
        OrbitPath(radius: 130, secondsPerTurn: 110, isReversed: true, satellites: [
            OrbitSatellite(systemImage: "repeat", angle: 10, size: 30),
            OrbitSatellite(systemImage: "mappin", angle: 100, size: 32),
            OrbitSatellite(systemImage: "creditcard", angle: 195, size: 32),
            OrbitSatellite(systemImage: "globe", angle: 275, size: 28)
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

                Circle()
                    .fill(Self.haloGlow)
                    .frame(width: Self.haloSize, height: Self.haloSize)

                Circle()
                    .fill(Self.sunShading)
                    .frame(width: Self.sunSize, height: Self.sunSize)
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
     * @description A satellite's glyph on a glass disc
     *
     * @param satellite The satellite
     * @returns The disc
     */
    private func disc(_ satellite: OrbitSatellite) -> some View {
        Image(systemName: satellite.systemImage)
            .font(.system(size: satellite.size * 0.44, weight: .medium))
            .frame(width: satellite.size, height: satellite.size)
            .foregroundStyle(Theme.accent300)
            .background(Theme.surface, in: Circle())
            .overlay(Circle().strokeBorder(Theme.glassCardBorder, lineWidth: 1))
    }
}
