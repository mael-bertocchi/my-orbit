import { createContext, type ReactNode } from 'react';

/**
 * @constant FrameActionContext
 * @description The context handing a page the app's main action, which the page's header shows on a desktop where the
 * frame has no bar along the top to hold it; nothing outside an app
 */
export const FrameActionContext = createContext<ReactNode>(null);
