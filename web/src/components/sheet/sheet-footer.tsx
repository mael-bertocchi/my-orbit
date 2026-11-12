import { SheetFooterContext } from 'components/sheet/sheet-context';
import type { Maybe } from 'models';
import { useContext, type JSX, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * @interface SheetFooterComponentProps
 * @description What a sheet's content pins under itself
 */
interface SheetFooterComponentProps {
    children: ReactNode; /*!< What stays pinned at the bottom of the sheet */
}

/**
 * @function SheetFooterComponent
 * @description Pins its children in the footer of the sheet it sits in, under the scrolling content, so a page shown
 * in a sheet can keep its actions at hand however long it is. Outside a sheet it shows nothing.
 *
 * @param {SheetFooterComponentProps} props The properties of the component
 */
function SheetFooterComponent(props: SheetFooterComponentProps): Maybe<JSX.Element> {
    const footer = useContext(SheetFooterContext);

    if (footer !== null) {
        return createPortal(props.children, footer);
    }

    return null;
}

export default SheetFooterComponent;
