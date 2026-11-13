import AppIconComponent from 'components/app-icon/app-icon';
import FrameComponent from 'components/frame/frame';
import { ChevronRight } from 'lucide-react';
import { useAppAvailability } from 'modules/apps/apps-hooks';
import type { PortalApp } from 'modules/apps/apps-models';
import { APPS, appPath } from 'modules/apps/apps-registry';
import { useIdentityContext } from 'modules/identity/identity-hooks';
import type { IdentityContextProps } from 'modules/identity/identity-models';
import type { MessageKey } from 'modules/language/language-en';
import { currentLanguage, t } from 'modules/language/language-service';
import { lazy, Suspense, type ComponentType, type JSX } from 'react';
import { Link } from 'react-router-dom';

/**
 * @interface AppTileComponentProps
 * @description An app on the home page, with its tile's content when it has one.
 */
interface AppTileComponentProps {
    app: PortalApp; /*!< The app */
    Widget?: ComponentType; /*!< A glance at it, loaded the first time the home page shows it */
}

/**
 * @constant TILES
 * @description Every app's tile, in the order of the apps.
 */
const TILES: readonly AppTileComponentProps[] = APPS.map((app) => ({ app, Widget: app.loadWidget !== undefined ? lazy(app.loadWidget) : undefined }));

/**
 * @function greetingKey
 * @description The greeting for the time of day.
 */
function greetingKey(now: Date): MessageKey {
    const hour = now.getHours();

    if (hour < 12) {
        return 'home.morning';
    }

    return hour < 18 ? 'home.afternoon' : 'home.evening';
}

/**
 * @function today
 * @description Today's date, written out in the page's language with a capital, as a subtitle.
 */
function today(now: Date): string {
    const written = new Intl.DateTimeFormat(currentLanguage(), { weekday: 'long', day: 'numeric', month: 'long' }).format(now);

    return written.charAt(0).toLocaleUpperCase() + written.slice(1);
}

/**
 * @function AppTileComponent
 * @description An app on the home page: its icon, name and purpose, and a glance at it when it has one. While the app
 * can't be used, the tile is greyed out, out of reach, and says why in place of the glance. On a desktop, the tiles of
 * a row share its height and the glance sits in the middle of the room it is given.
 *
 * @param {AppTileComponentProps} props The properties of the component
 */
function AppTileComponent(props: AppTileComponentProps): JSX.Element {
    const Widget = props.Widget;
    const availability = useAppAvailability(props.app);

    if (!availability.isAvailable) {
        return (
            <div aria-disabled='true' className='card flex cursor-not-allowed flex-col p-5 sm:p-6 lg:p-7'>
                <div className='flex items-center gap-3.5 opacity-50 grayscale'>
                    <AppIconComponent app={props.app} size={46} />
                    <div className='min-w-0 flex-1'>
                        <p className='text-[17px] font-semibold tracking-tight'>{t(props.app.name)}</p>
                        <p className='text-[13px] text-ink-secondary'>{t(props.app.summary)}</p>
                    </div>
                </div>
                {availability.reason !== null && <p className='mt-5 border-t border-hairline pt-4 text-[14px] text-ink-secondary lg:flex lg:flex-1 lg:items-center lg:justify-center lg:pt-6'>{t(availability.reason)}</p>}
            </div>
        );
    }

    return (
        <Link to={appPath(props.app)} aria-label={t('home.open', { app: t(props.app.name) })} className='card group flex flex-col p-5 sm:p-6 lg:p-7'>
            <div className='flex items-center gap-3.5'>
                <AppIconComponent app={props.app} size={46} />
                <div className='min-w-0 flex-1'>
                    <p className='text-[17px] font-semibold tracking-tight'>{t(props.app.name)}</p>
                    <p className='text-[13px] text-ink-secondary'>{t(props.app.summary)}</p>
                </div>
                <ChevronRight size={18} className='text-ink-quaternary transition group-hover:translate-x-0.5 group-hover:text-ink-tertiary' />
            </div>
            {Widget !== undefined && (
                <div className='mt-5 border-t border-hairline pt-4 lg:flex lg:min-h-[300px] lg:flex-1 lg:items-center lg:justify-center lg:pt-6'>
                    <Suspense fallback={<div className='h-[118px]' />}>
                        <Widget />
                    </Suspense>
                </div>
            )}
        </Link>
    );
}

/**
 * @function HomePage
 * @description The portal's home: a greeting, today's date, and a tile for every app.
 */
function HomePage(): JSX.Element {
    const { account }: IdentityContextProps = useIdentityContext();
    const now = new Date();

    return (
        <FrameComponent>
            <div className='animate-rise'>
                <p className='eyebrow'>{today(now)}</p>
                <h1 className='mt-1 text-[28px] font-semibold leading-tight tracking-tight sm:text-[34px]'>
                    {account !== null ? t(greetingKey(now), { name: account.name }) : t('home.welcome')}
                </h1>

                <div className='mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2'>
                    {TILES.map(({ app, Widget }) => (
                        <AppTileComponent key={app.id} app={app} Widget={Widget} />
                    ))}
                </div>
            </div>
        </FrameComponent>
    );
}

export default HomePage;
