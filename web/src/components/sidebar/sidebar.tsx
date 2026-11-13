import AppIconComponent from 'components/app-icon/app-icon';
import LogoComponent from 'components/logo/logo';
import { ChevronRight, House, Settings } from 'lucide-react';
import { useAppAvailability } from 'modules/apps/apps-hooks';
import type { PortalApp } from 'modules/apps/apps-models';
import { APPS } from 'modules/apps/apps-registry';
import { t } from 'modules/language/language-service';
import { useId, useState, type JSX } from 'react';
import { Link, NavLink, type NavLinkRenderProps } from 'react-router-dom';

/**
 * @interface SidebarComponentProps
 * @description What the sidebar shows
 */
interface SidebarComponentProps {
    app?: PortalApp; /*!< The app shown, none on the portal's own pages */
}

/**
 * @interface SidebarAppComponentProps
 * @description One app in the sidebar
 */
interface SidebarAppComponentProps {
    app: PortalApp; /*!< The app */
    isShown: boolean; /*!< Whether it is the app shown, which starts unfolded */
}

/**
 * @function tabClassName
 * @description The classes of a tab under its app, the current one raised on a white capsule like a segmented control's
 */
function tabClassName({ isActive }: NavLinkRenderProps): string {
    return `flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[14px] transition ${isActive ? 'bg-white font-semibold text-ink shadow-control' : 'text-ink-secondary hover:text-ink'}`;
}

/**
 * @function entryClassName
 * @description The classes of the home page's entry, raised on a white capsule while it is the page shown
 */
function entryClassName({ isActive }: NavLinkRenderProps): string {
    return `flex items-center gap-3 rounded-xl px-2.5 py-2 text-[15px] font-medium transition ${isActive ? 'bg-white text-ink shadow-control' : 'text-ink-secondary hover:text-ink'}`;
}

/**
 * @function settingsClassName
 * @description The classes of the settings button, raised on a white disc while the settings are the page shown
 */
function settingsClassName({ isActive }: NavLinkRenderProps): string {
    return `flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-fill-strong/70 hover:text-ink ${isActive ? 'bg-white text-ink shadow-control' : 'text-ink-secondary'}`;
}

/**
 * @function SidebarAppComponent
 * @description An app in the sidebar: its icon, its name and a chevron. Clicking it folds or unfolds its tabs under it,
 * without leaving the page; the chevron points down while they show. The app shown starts unfolded. While the app
 * can't be used, it is greyed out and out of reach, and says why on hover.
 *
 * @param {SidebarAppComponentProps} props The properties of the component
 */
function SidebarAppComponent(props: SidebarAppComponentProps): JSX.Element {
    const availability = useAppAvailability(props.app);
    const [isOpen, setIsOpen] = useState(props.isShown);
    const tabsId = useId();

    if (!availability.isAvailable) {
        return (
            <span aria-disabled='true' title={availability.reason !== null ? t(availability.reason) : undefined} className='flex cursor-not-allowed items-center gap-3 rounded-xl px-2.5 py-2 text-[15px] font-medium text-ink-secondary opacity-50 grayscale'>
                <AppIconComponent app={props.app} size={26} />
                {t(props.app.name)}
            </span>
        );
    }

    return (
        <div>
            <button type='button' aria-expanded={isOpen} aria-controls={tabsId} onClick={() => setIsOpen(!isOpen)} className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-[15px] font-medium transition ${props.isShown ? 'text-ink' : 'text-ink-secondary hover:text-ink'}`}>
                <AppIconComponent app={props.app} size={26} />
                <span className='flex-1'>{t(props.app.name)}</span>
                <ChevronRight size={15} className={`text-ink-quaternary transition-transform duration-200 motion-reduce:transition-none ${isOpen ? 'rotate-90' : ''}`} />
            </button>
            {isOpen && (
                <div id={tabsId} className='mb-2 ml-[22px] mt-1 flex flex-col gap-0.5 border-l border-hairline pl-3'>
                    {props.app.tabs.map(({ to, label, icon: Icon, end }) => (
                        <NavLink key={to} to={to} end={end} className={tabClassName}>
                            <Icon size={16} strokeWidth={2.1} />
                            {t(label)}
                        </NavLink>
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * @function SidebarComponent
 * @description The portal's navigation on a desktop, along the left edge in place of the bar along the top: the logo
 * with the settings button, the home page, then every app, each folding its tabs under it, the one shown unfolded.
 *
 * @param {SidebarComponentProps} props The properties of the component
 */
function SidebarComponent(props: SidebarComponentProps): JSX.Element {
    return (
        <aside className='fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col overflow-y-auto border-r border-hairline bg-fill px-3 py-5 lg:flex'>
            <div className='flex items-center gap-2.5 pb-6 pl-2.5'>
                <Link to='/' className='flex flex-1 items-center gap-2.5 rounded-lg'>
                    <LogoComponent size={28} />
                    <span className='text-[17px] font-semibold tracking-tight'>Orbit</span>
                </Link>
                <NavLink to='/account' aria-label={t('frame.settings')} className={settingsClassName}>
                    <Settings size={19} strokeWidth={2.1} />
                </NavLink>
            </div>

            <nav aria-label={t('frame.apps')} className='flex flex-col'>
                <NavLink to='/' end className={entryClassName}>
                    <span className='flex h-[26px] w-[26px] items-center justify-center'>
                        <House size={19} strokeWidth={2.1} />
                    </span>
                    {t('frame.home')}
                </NavLink>

                <p className='eyebrow mb-1.5 mt-6 px-2.5 text-[11px]'>{t('frame.apps')}</p>
                {APPS.map((app) => (
                    <SidebarAppComponent key={app.id} app={app} isShown={props.app?.id === app.id} />
                ))}
            </nav>
        </aside>
    );
}

export default SidebarComponent;
