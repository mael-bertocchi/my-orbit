import type { Maybe } from 'models';
import { createContext } from 'react';

/**
 * @constant SheetFooterContext
 * @description The context handing a sheet's content the pinned footer it can fill, or null outside a sheet
 */
export const SheetFooterContext = createContext<Maybe<HTMLElement>>(null);
