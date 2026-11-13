import { Bookmark, CircleCheckBig, CirclePlay, Clapperboard } from 'lucide-react';
import type { PortalApp } from 'modules/apps/apps-models';

/**
 * @constant watchlist
 * @description The watchlist: the films and series to watch, shelved by genre or saga, then rated and commented on once
 * watched. Its code only loads once it is opened, or once its tile shows on the home page.
 */
export const watchlist: PortalApp = {
    id: 'watchlist',
    name: 'watchlist.appName',
    summary: 'watchlist.appSummary',
    icon: Clapperboard,
    tabs: [
        { to: '/watchlist', label: 'watchlist.toWatch', icon: Bookmark, end: true },
        { to: '/watchlist/watching', label: 'watchlist.watching', icon: CirclePlay },
        { to: '/watchlist/watched', label: 'watchlist.watched', icon: CircleCheckBig }
    ],
    load: () => import('pages/watchlist/watchlist'),
    loadWidget: () => import('pages/watchlist/watchlist-widget/watchlist-widget')
};
