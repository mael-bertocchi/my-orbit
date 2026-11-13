import type { LucideIcon } from 'lucide-react';
import type { Maybe } from 'models';
import type { MessageKey } from 'modules/language/language-en';
import type { ComponentType } from 'react';

/**
 * @type AppModule
 * @description What loading a piece of an app hands back: a module whose default export is a component.
 */
export type AppModule = Promise<{ default: ComponentType }>;

/**
 * @interface AppAvailability
 * @description Whether an app can be used right now, and why not when it can't.
 */
export interface AppAvailability {
    isAvailable: boolean; /*!< Whether it can be opened */
    reason: Maybe<MessageKey>; /*!< Why not, null while it can */
}

/**
 * @interface AppTab
 * @description One of an app's tabs.
 */
export interface AppTab {
    to: string; /*!< Its path */
    label: MessageKey; /*!< Its name */
    icon: LucideIcon; /*!< Its icon on a phone's tab bar and in the sidebar */
    end?: boolean; /*!< Whether it is only current on its exact path, for the tab at the app's root */
}

/**
 * @interface AvailabilitySource
 * @description Where an app's availability comes from, for `useSyncExternalStore`.
 */
export interface AvailabilitySource {
    subscribe: (listener: () => void) => () => void; /*!< Tells a listener about every change, until it unsubscribes */
    getSnapshot: () => AppAvailability; /*!< The availability as it stands */
}

/**
 * @interface PortalApp
 * @description An app the portal hosts, as its manifest describes it. The manifest is light: the portal reads it
 * up front to list the app, and only loads the app itself (and its tile on the home page) when they are shown.
 */
export interface PortalApp {
    id: string; /*!< Its identifier, which is also its path: the app lives under `/<id>` */
    name: MessageKey; /*!< Its name */
    summary: MessageKey; /*!< What it is for, in a few words */
    icon: LucideIcon; /*!< The glyph on its icon */
    tabs: readonly AppTab[]; /*!< Its tabs, in the bar along the top or the bottom and in the sidebar */
    load: () => AppModule; /*!< The app itself, mounted under `/<id>/*` with its own routes */
    loadWidget?: () => AppModule; /*!< Its tile's content on the home page, a glance at the app */
    availability?: AvailabilitySource; /*!< Whether it can be used right now, always when left out */
}
