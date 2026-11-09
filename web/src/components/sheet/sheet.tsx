import { SheetFooterContext } from 'components/sheet/sheet-context';
import { X } from 'lucide-react';
import type { Maybe } from 'models';
import { t } from 'modules/language/language-service';
import { useEffect, useRef, useState, type JSX, type MouseEvent, type ReactNode, type SyntheticEvent } from 'react';

/**
 * @interface SheetComponentProps
 * @description A modal sheet.
 */
interface SheetComponentProps {
    open: boolean; /*!< Whether it is shown */
    title: string; /*!< Its title */
    onClose: () => void; /*!< Called when it is dismissed */
    children: ReactNode; /*!< Its content, only mounted while open so it starts fresh each time */
    footer?: ReactNode; /*!< What stays pinned under the scrolling content, beside what the content pins there itself */
    isFull?: boolean; /*!< Whether it keeps its full height whatever its content, so it never jumps as that changes */
}

/**
 * @function SheetComponent
 * @description A sheet on the native dialog element: centred on a wide screen, rising from the bottom on a phone.
 * Escape, the close button and a click beside it dismiss it. Its footer, hidden while empty, holds the footer it is
 * given and whatever its content pins there with SheetFooterComponent.
 *
 * @param {SheetComponentProps} props The properties of the component
 */
function SheetComponent(props: SheetComponentProps): JSX.Element {
    const dialog = useRef<HTMLDialogElement>(null);
    const [footer, setFooter] = useState<Maybe<HTMLElement>>(null);

    useEffect(() => {
        const element = dialog.current;

        if (element === null) {
            return;
        }

        if (props.open && !element.open) {
            element.showModal();
        } else if (!props.open && element.open) {
            element.close();
        }
    }, [props.open]);

    /**
     * @function cancel
     * @description Answers Escape like the close button, rather than letting the browser close the sheet on its own
     */
    const cancel = (event: SyntheticEvent<HTMLDialogElement>): void => {
        event.preventDefault();
        props.onClose();
    };

    /**
     * @function closeBeside
     * @description Closes the sheet on a click beside it, on the dimmed page
     */
    const closeBeside = (event: MouseEvent<HTMLDialogElement>): void => {
        if (event.target === dialog.current) {
            props.onClose();
        }
    };

    return (
        <dialog ref={dialog} className={props.isFull === true ? 'sheet sheet-full' : 'sheet'} aria-label={props.title} onCancel={cancel} onClick={closeBeside}>
            {props.open && (
                <>
                    <header className='flex items-center justify-between px-6 pb-2 pt-5'>
                        <h2 className='text-[20px] font-semibold tracking-tight'>{props.title}</h2>
                        <button type='button' onClick={props.onClose} aria-label={t('common.close')} className='flex h-8 w-8 items-center justify-center rounded-full bg-fill text-ink-secondary transition hover:bg-fill-strong'>
                            <X size={17} strokeWidth={2.4} />
                        </button>
                    </header>
                    <SheetFooterContext.Provider value={footer}>
                        <div className='flex-1 overflow-y-auto px-6 pb-6 pt-2'>{props.children}</div>
                    </SheetFooterContext.Provider>
                    <footer ref={setFooter} className='border-t border-hairline px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 empty:hidden'>
                        {props.footer}
                    </footer>
                </>
            )}
        </dialog>
    );
}

export default SheetComponent;
