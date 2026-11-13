import AppIconComponent from 'components/app-icon/app-icon';
import { FrameActionContext } from 'components/frame/frame-context';
import LauncherComponent from 'components/launcher/launcher';
import LogoComponent from 'components/logo/logo';
import SidebarComponent from 'components/sidebar/sidebar';
import { Grip, Settings } from 'lucide-react';
import type { PortalApp } from 'modules/apps/apps-models';
import { appPath } from 'modules/apps/apps-registry';
import { t } from 'modules/language/language-service';
import { useEffect, useRef, useState, type JSX, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';

/**
 * @interface FrameComponentProps
 * @description What the portal's frame holds.
 */
interface FrameComponentProps {
    app?: PortalApp; /*!< The app shown, none on the portal's own pages */
    action?: ReactNode; /*!< The app's main action, beside the menus */
    children: ReactNode; /*!< The page */
}

/**
 * @function SettingsButtonComponent
 * @description A cogwheel opening the account's settings, where the owner can also sign out.
 */
function SettingsButtonComponent(): JSX.Element {
    return (
        <Link to='/account' aria-label={t('frame.settings')} className='flex h-9 w-9 items-center justify-center rounded-full text-ink-secondary transition hover:bg-fill-strong/70 hover:text-ink'>
            <Settings size={19} strokeWidth={2.1} />
        </Link>
    );
}

/**
 * @constant LAUNCHER_ID
 * @description The launcher's identifier, which its button names
 */
const LAUNCHER_ID = 'portal-launcher';

/**
 * @function FrameComponent
 * @description The portal's frame around every page: a bar the colour of the page with the app's name on the left, its
 * tabs as a segmented control in the middle, and its action, the app switcher and the settings button on the right. It only
 * draws its bottom rule once the page scrolls under it, like an iOS navigation bar. On a phone the tabs move to a tab bar
 * along the bottom edge. The app switcher's button fades the page out and the launcher in, in its place, with the tabs
 * and the action, which belong to the page; Escape, the button again, or picking a destination brings the page back.
 * On a desktop the bar gives way to a sidebar listing every app, the one shown with its tabs, and the action moves to
 * the page's header; the page then takes the rest of the width, up to a width that keeps its lines readable.
 *
 * @param {FrameComponentProps} props The properties of the component
 */
function FrameComponent(props: FrameComponentProps): JSX.Element {
    const tabs = props.app?.tabs ?? [];

    const [isScrolled, setIsScrolled] = useState(false);
    const [isLaunching, setIsLaunching] = useState(false);
    const launcherButton = useRef<HTMLButtonElement>(null);
    const { pathname } = useLocation();
    const [launchedFrom, setLaunchedFrom] = useState(pathname);

    if (launchedFrom !== pathname) {
        setLaunchedFrom(pathname);
        setIsLaunching(false);
    }

    useEffect(() => {
        if (!isLaunching) {
            return;
        }

        /**
         * @function closeOnEscape
         * @description Brings the page back on Escape and gives the focus back to the launcher's button
         */
        const closeOnEscape = (event: KeyboardEvent): void => {
            if (event.key === 'Escape') {
                setIsLaunching(false);
                launcherButton.current?.focus();
            }
        };

        const overflow = document.documentElement.style.overflow;

        document.documentElement.style.overflow = 'hidden';
        window.addEventListener('keydown', closeOnEscape);

        return () => {
            document.documentElement.style.overflow = overflow;
            window.removeEventListener('keydown', closeOnEscape);
        };
    }, [isLaunching]);

    const pageClassName = `transition-opacity duration-300 ease-out motion-reduce:transition-none ${isLaunching ? 'pointer-events-none opacity-0' : 'opacity-100'}`;

    useEffect(() => {
        /**
         * @function update
         * @description Notes whether the page is scrolled under the bar
         */
        const update = (): void => setIsScrolled(window.scrollY > 0);

        update();
        window.addEventListener('scroll', update, { passive: true });

        return () => window.removeEventListener('scroll', update);
    }, []);

    return (
        <>
            <header className={`sticky top-0 z-30 border-b lg:hidden bg-canvas/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150 transition-colors duration-200 ${isScrolled ? 'border-hairline' : 'border-transparent'}`}>
                <div className='mx-auto grid h-14 max-w-5xl grid-cols-[1fr_auto_1fr] items-center gap-4 px-5 sm:px-8'>
                    <Link to={props.app !== undefined ? appPath(props.app) : '/'} className='flex items-center gap-2.5 justify-self-start rounded-lg'>
                        {props.app !== undefined ? <AppIconComponent app={props.app} size={28} /> : <LogoComponent size={28} />}
                        <span className='text-[17px] font-semibold tracking-tight'>
                            {props.app !== undefined ? t(props.app.name) : 'Orbit'}
                        </span>
                    </Link>

                    {tabs.length > 0 && (
                        <nav inert={isLaunching} className={`hidden rounded-full bg-fill-strong/80 p-1 sm:flex ${pageClassName}`} aria-label={t('frame.sections')}>
                            {tabs.map(({ to, label, end }) => (
                                <NavLink key={to} to={to} end={end} className={({ isActive }) => `rounded-full px-4 py-1.5 text-[14px] font-medium transition ${isActive ? 'bg-white text-ink shadow-control' : 'text-ink-secondary hover:text-ink'}`}>
                                    {t(label)}
                                </NavLink>
                            ))}
                        </nav>
                    )}

                    <div className='col-start-3 flex items-center gap-1.5 justify-self-end sm:gap-2'>
                        {props.action !== undefined && (
                            <div inert={isLaunching} className={pageClassName}>
                                {props.action}
                            </div>
                        )}
                        <button ref={launcherButton} type='button' aria-label={t('frame.apps')} aria-expanded={isLaunching} aria-controls={LAUNCHER_ID} onClick={() => setIsLaunching(!isLaunching)} className='flex h-9 w-9 items-center justify-center rounded-full text-ink-secondary transition hover:bg-fill-strong/70 hover:text-ink aria-expanded:bg-fill-strong/70 aria-expanded:text-ink'>
                            <Grip size={18} strokeWidth={2.2} />
                        </button>
                        <SettingsButtonComponent />
                    </div>
                </div>
            </header>

            <SidebarComponent app={props.app} />

            <main inert={isLaunching} className={`mx-auto max-w-5xl px-5 pt-8 sm:px-8 sm:pb-16 sm:pt-10 lg:ml-[248px] lg:mr-0 lg:max-w-none lg:px-12 ${tabs.length > 0 ? 'pb-28' : 'pb-12'} ${pageClassName}`}>
                <div className='lg:mx-auto lg:max-w-[1360px]'>
                    <FrameActionContext.Provider value={props.action ?? null}>
                        {props.children}
                    </FrameActionContext.Provider>
                </div>
            </main>

            {tabs.length > 0 && (
                <nav inert={isLaunching} className={`fixed inset-x-0 bottom-0 z-30 grid border-t border-hairline bg-canvas/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150 sm:hidden ${pageClassName}`} style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }} aria-label={t('frame.sections')}>
                    {tabs.map(({ to, label, icon: Icon, end }) => (
                        <NavLink key={to} to={to} end={end} className={({ isActive }) => `flex flex-col items-center gap-0.5 pb-1.5 pt-2 text-[11px] font-medium ${isActive ? 'text-accent' : 'text-ink-tertiary'}`}>
                            <Icon size={23} strokeWidth={2} />
                            {t(label)}
                        </NavLink>
                    ))}
                </nav>
            )}
            <LauncherComponent id={LAUNCHER_ID} isOpen={isLaunching} onClose={() => setIsLaunching(false)} />
        </>
    );
}

export default FrameComponent;
