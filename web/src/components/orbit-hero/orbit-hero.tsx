import LogoComponent from 'components/logo/logo';
import { ChartPie, Clapperboard, Globe, MapPin, Repeat, Star, Wallet, type LucideIcon } from 'lucide-react';
import type { CSSProperties, JSX } from 'react';

/**
 * @interface Satellite
 * @description A glyph that travels on one of the orbits around the logo.
 */
interface Satellite {
    icon: LucideIcon; /*!< The glyph */
    angle: number; /*!< Where it starts on its orbit, in degrees clockwise from the right */
    size: number; /*!< The diameter of its disc, in pixels */
    isApp: boolean; /*!< Whether it is one of the portal's apps, drawn on the slate of their icons rather than on white */
}

/**
 * @interface Orbit
 * @description One circle around the logo and the glyphs that travel on it.
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
 * @constant APP_GRADIENT
 * @description The slate gradient of the apps' icons, from the top left to the bottom right
 */
const APP_GRADIENT = 'linear-gradient(135deg, #6B7787, #434C59)';

/**
 * @constant ORBITS
 * @description The two orbits: the inner one carries the two apps and the analysis that ties them, the outer one, turning
 * the other way, the smaller things each app keeps track of.
 */
const ORBITS: readonly Orbit[] = [
    {
        radius: 112,
        seconds: 70,
        isReversed: false,
        satellites: [
            { icon: Wallet, angle: -40, size: 54, isApp: true },
            { icon: Clapperboard, angle: 140, size: 54, isApp: true },
            { icon: ChartPie, angle: 60, size: 42, isApp: false }
        ]
    },
    {
        radius: 166,
        seconds: 110,
        isReversed: true,
        satellites: [
            { icon: Star, angle: 10, size: 40, isApp: false },
            { icon: Repeat, angle: 100, size: 36, isApp: false },
            { icon: MapPin, angle: 195, size: 38, isApp: false },
            { icon: Globe, angle: 275, size: 34, isApp: false }
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
    const look: CSSProperties = props.satellite.isApp ? { borderRadius: size * 0.27, backgroundImage: APP_GRADIENT } : { borderRadius: size / 2 };
    const tone: string = props.satellite.isApp ? 'text-white shadow-[0_6px_18px_rgb(67_76_89/0.28)]' : 'bg-white text-accent shadow-card';

    return (
        <span className='absolute left-1/2 top-1/2' style={placement}>
            <span className='flex h-full w-full animate-orbit motion-reduce:animate-none' style={turning(props.orbit, true)}>
                <span className={`flex h-full w-full items-center justify-center ${tone}`} style={look}>
                    <Icon size={size * 0.46} strokeWidth={2} />
                </span>
            </span>
        </span>
    );
}

/**
 * @function OrbitHeroComponent
 * @description The sign-in page's picture: the logo, with the apps and what they keep track of turning around it on two
 * faint orbits, the inner one clockwise and the outer one the other way. Each disc turns back as fast as its orbit so
 * its glyph stays upright. Everything stands still for those who ask for less motion.
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
            <div className='absolute left-1/2 top-1/2 -ml-[52px] -mt-[52px] rounded-[25px] shadow-[0_14px_40px_rgb(67_76_89/0.35)]'>
                <LogoComponent size={104} />
            </div>
        </div>
    );
}

export default OrbitHeroComponent;
