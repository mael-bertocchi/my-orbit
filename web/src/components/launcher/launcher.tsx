import AppIconComponent from 'components/app-icon/app-icon';
import LogoComponent from 'components/logo/logo';
import { useAppAvailability } from 'modules/apps/apps-hooks';
import type { PortalApp } from 'modules/apps/apps-models';
import { APPS, appPath } from 'modules/apps/apps-registry';
import { t } from 'modules/language/language-service';
import { useEffect, useRef, type JSX, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

/**
 * @constant ICON_SIZE
 * @description The side of an icon in the launcher, in pixels
 */
const ICON_SIZE = 64;

/**
 * @interface LauncherComponentProps
 * @description What the launcher shows, and how it closes
 */
interface LauncherComponentProps {
    id: string; /*!< Its identifier, which its button names */
    isOpen: boolean; /*!< Whether it shows, in place of the page */
    onClose: () => void; /*!< Called once an app is picked */
}

/**
 * @interface LauncherTileComponentProps
 * @description One destination of the launcher
 */
interface LauncherTileComponentProps {
    to: string; /*!< Where it leads */
    name: string; /*!< Its name */
    icon: ReactNode; /*!< Its icon */
    isCurrent: boolean; /*!< Whether it is where the launcher was opened from */
    onPick: () => void; /*!< Called when it is picked */
}

/**
 * @function LauncherTileComponent
 * @description One destination: its icon and its name, like an app on the iPhone's home screen
 *
 * @param {LauncherTileComponentProps} props The properties of the component
 */
function LauncherTileComponent(props: LauncherTileComponentProps): JSX.Element {
    return (
        <Link to={props.to} onClick={props.onPick} aria-current={props.isCurrent ? 'page' : undefined} className='group flex flex-col items-center gap-2 rounded-2xl px-1 py-3 text-center outline-none transition hover:bg-fill-strong/60 focus-visible:ring-2 focus-visible:ring-accent/40'>
            <span className='transition group-active:scale-95'>{props.icon}</span>
            <span className={`text-[13px] font-medium leading-tight ${props.isCurrent ? 'text-accent' : 'text-ink'}`}>{props.name}</span>
        </Link>
    );
}

/**
 * @interface LauncherAppTileComponentProps
 * @description An app in the launcher
 */
interface LauncherAppTileComponentProps {
    app: PortalApp; /*!< The app */
    pathname: string; /*!< Where the launcher was opened from */
    onPick: () => void; /*!< Called when it is picked */
}

/**
 * @function LauncherAppTileComponent
 * @description An app in the launcher, greyed out and out of reach while it can't be used, saying why on hover
 *
 * @param {LauncherAppTileComponentProps} props The properties of the component
 */
function LauncherAppTileComponent(props: LauncherAppTileComponentProps): JSX.Element {
    const availability = useAppAvailability(props.app);
    const path = appPath(props.app);
    const icon = <AppIconComponent app={props.app} size={ICON_SIZE} />;

    if (!availability.isAvailable) {
        return (
            <span aria-disabled='true' title={availability.reason !== null ? t(availability.reason) : undefined} className='flex cursor-not-allowed flex-col items-center gap-2 rounded-2xl px-1 py-3 text-center opacity-40 grayscale'>
                <span>{icon}</span>
                <span className='text-[13px] font-medium leading-tight text-ink'>{t(props.app.name)}</span>
            </span>
        );
    }

    return <LauncherTileComponent to={path} name={t(props.app.name)} icon={icon} isCurrent={props.pathname === path || props.pathname.startsWith(`${path}/`)} onPick={props.onPick} />;
}

/**
 * @function LauncherComponent
 * @description The app switcher: it fades in over the page, under the portal's bar, with the home page and every app
 * as large icons, the way the portal's pages are laid out. Picking one leads there; the frame closes it on Escape, from
 * its button, and as the page changes.
 *
 * @param {LauncherComponentProps} props The properties of the component
 */
function LauncherComponent(props: LauncherComponentProps): JSX.Element {
    const grid = useRef<HTMLElement>(null);
    const { pathname } = useLocation();

    useEffect(() => {
        if (props.isOpen) {
            grid.current?.querySelector('a')?.focus();
        }
    }, [props.isOpen]);

    return (
        <div id={props.id} inert={!props.isOpen} className={`fixed inset-0 z-20 overflow-y-auto bg-canvas pt-[calc(3.5rem+env(safe-area-inset-top))] duration-300 ease-out motion-reduce:transition-none ${props.isOpen ? 'visible opacity-100 transition-opacity' : 'invisible opacity-0 transition-[opacity,visibility]'}`}>
            <div className={`mx-auto max-w-5xl px-5 pb-16 pt-8 transition-transform duration-300 ease-out motion-reduce:transition-none sm:px-8 sm:pt-10 ${props.isOpen ? 'scale-100' : 'scale-[0.98]'}`}>
                <p className='eyebrow'>{t('frame.launcherEyebrow')}</p>
                <h1 className='mt-1 text-[34px] font-semibold leading-tight tracking-tight'>{t('frame.apps')}</h1>
                <nav ref={grid} aria-label={t('frame.apps')} className='mt-8 grid grid-cols-3 gap-x-3 gap-y-4 sm:grid-cols-4 md:grid-cols-6'>
                    <LauncherTileComponent to='/' name={t('frame.home')} icon={<LogoComponent size={ICON_SIZE} />} isCurrent={pathname === '/'} onPick={props.onClose} />
                    {APPS.map((app) => (
                        <LauncherAppTileComponent key={app.id} app={app} pathname={pathname} onPick={props.onClose} />
                    ))}
                </nav>
            </div>
        </div>
    );
}

export default LauncherComponent;
