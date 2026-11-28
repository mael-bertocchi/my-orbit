import { ChartPie, Globe, MapPin, Repeat, Star, type LucideIcon } from 'lucide-react';
import type { CSSProperties, JSX } from 'react';

/**
 * @interface Satellite
 * @description A glyph that travels on one of the orbits around the sun.
 */
interface Satellite {
    icon: LucideIcon; /*!< The glyph */
    angle: number; /*!< Where it starts on its orbit, in degrees clockwise from the right */
    size: number; /*!< The diameter of its disc, in pixels */
}

/**
 * @interface Orbit
 * @description One circle around the sun and the glyphs that travel on it.
 */
interface Orbit {
    radius: number; /*!< Its radius, in pixels */
    seconds: number; /*!< How long one turn takes */
    isReversed: boolean; /*!< Whether it turns anticlockwise */
    satellites: readonly Satellite[]; /*!< What travels on it */
}

/**
 * @interface SatelliteComponentProps
 * @description Satellite properties
 */
interface SatelliteComponentProps {
    orbit: Orbit; /*!< The orbit it travels on */
    satellite: Satellite; /*!< The disc */
}

/**
 * @constant HERO_SIZE
 * @description The side of the square the hero draws in, in pixels, wide enough for the outer orbit and its discs
 */
const HERO_SIZE = 380;

/**
 * @constant SUN_SIZE
 * @description The diameter of the sun at the centre, in pixels
 */
const SUN_SIZE = 68;

/**
 * @constant SUN_SHADING
 * @description The sun's light: a warm white at its heart, turning golden toward its edge
 */
const SUN_SHADING = 'radial-gradient(circle at 45% 42%, #FFFDF8, #F4E9D3 70%, #E2CFAC)';

/**
 * @constant HALO_SIZE
 * @description The diameter of the golden halo the sun casts around it, in pixels
 */
const HALO_SIZE = 170;

/**
 * @constant HALO_GLOW
 * @description The halo's glow, golden near the sun and fading out before its edge
 */
const HALO_GLOW = 'radial-gradient(circle, rgb(243 230 204 / 0.9), rgb(232 214 180 / 0.45) 35%, transparent 70%)';

/**
 * @constant ORBITS
 * @description The two orbits: the inner one carries the analysis and the recurring operations, the outer one, turning
 * the other way, the smaller things the apps keep track of.
 */
const ORBITS: readonly Orbit[] = [
    {
        radius: 112,
        seconds: 70,
        isReversed: false,
        satellites: [
            { icon: ChartPie, angle: 60, size: 42 },
            { icon: Repeat, angle: 220, size: 38 }
        ]
    },
    {
        radius: 166,
        seconds: 110,
        isReversed: true,
        satellites: [
            { icon: Star, angle: 10, size: 40 },
            { icon: MapPin, angle: 140, size: 38 },
            { icon: Globe, angle: 260, size: 34 }
        ]
    }
];

/**
 * @function turning
 * @description The animation that turns an orbit, or keeps one of its discs upright by turning it back as fast the
 * other way
 *
 * @param {Orbit} orbit The orbit
 * @param {boolean} isCounter Whether it is the turn that keeps a disc upright
 * @returns {CSSProperties} The animation's timing and direction
 */
function turning(orbit: Orbit, isCounter: boolean): CSSProperties {
    return { animationDuration: `${orbit.seconds}s`, animationDirection: orbit.isReversed !== isCounter ? 'reverse' : 'normal' };
}

/**
 * @function SatelliteComponent
 * @description A disc on an orbit, set at its angle and kept upright while the orbit turns
 *
 * @param {SatelliteComponentProps} props The properties of the component
 * @returns {JSX.Element} The disc
 */
function SatelliteComponent(props: SatelliteComponentProps): JSX.Element {
    const Icon = props.satellite.icon;
    const size = props.satellite.size;
    const placement: CSSProperties = { width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2, transform: `rotate(${props.satellite.angle}deg) translateX(${props.orbit.radius}px) rotate(${-props.satellite.angle}deg)` };

    return (
        <span className='absolute left-1/2 top-1/2' style={placement}>
            <span className='flex h-full w-full animate-orbit motion-reduce:animate-none' style={turning(props.orbit, true)}>
                <span className='flex h-full w-full items-center justify-center rounded-full bg-white text-accent shadow-card'>
                    <Icon size={size * 0.46} strokeWidth={2} />
                </span>
            </span>
        </span>
    );
}

/**
 * @function OrbitHeroComponent
 * @description The sign-in page's picture: a warm sun in its golden halo, with what the apps keep track of turning
 * around it on two faint orbits, the inner one clockwise and the outer one the other way. Each disc turns back as fast as its
 * orbit so its glyph stays upright. Everything stands still for those who ask for less motion.
 *
 * @returns {JSX.Element} The picture
 */
function OrbitHeroComponent(): JSX.Element {
    return (
        <div className='relative mx-auto' style={{ width: HERO_SIZE, height: HERO_SIZE }} aria-hidden='true'>
            <div className='absolute inset-[18%] rounded-full bg-[radial-gradient(circle,rgb(86_97_111/0.14),transparent_70%)]' />
            {ORBITS.map((orbit: Orbit) => (
                <div key={orbit.radius} className='absolute inset-0 animate-orbit motion-reduce:animate-none' style={turning(orbit, false)}>
                    <div className='absolute left-1/2 top-1/2 rounded-full border border-[rgb(86_97_111/0.16)]' style={{ width: orbit.radius * 2, height: orbit.radius * 2, marginLeft: -orbit.radius, marginTop: -orbit.radius }} />
                    {orbit.satellites.map((satellite: Satellite) => <SatelliteComponent key={satellite.angle} orbit={orbit} satellite={satellite} />)}
                </div>
            ))}
            <div className='absolute left-1/2 top-1/2 rounded-full' style={{ width: HALO_SIZE, height: HALO_SIZE, marginLeft: -HALO_SIZE / 2, marginTop: -HALO_SIZE / 2, backgroundImage: HALO_GLOW }} />
            <div className='absolute left-1/2 top-1/2 rounded-full shadow-[0_12px_22px_rgb(67_76_89/0.22)]' style={{ width: SUN_SIZE, height: SUN_SIZE, marginLeft: -SUN_SIZE / 2, marginTop: -SUN_SIZE / 2, backgroundImage: SUN_SHADING }} />
        </div>
    );
}

export default OrbitHeroComponent;
