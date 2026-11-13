import { FrameActionContext } from 'components/frame/frame-context';
import { useContext, type JSX, type ReactNode } from 'react';

/**
 * @interface PageHeaderComponentProps
 * @description What a page's header holds
 */
interface PageHeaderComponentProps {
    trailing?: ReactNode; /*!< The page's own controls, on the right of its title */
    className?: string; /*!< Classes added to the header */
    children: ReactNode; /*!< The page's eyebrow, title and subtitle */
}

/**
 * @function PageHeaderComponent
 * @description A page's header: its title on the left, and on the right its own controls, then, on a desktop, the app's
 * main action, which the frame's bar holds on smaller screens
 *
 * @param {PageHeaderComponentProps} props The properties of the component
 */
function PageHeaderComponent(props: PageHeaderComponentProps): JSX.Element {
    const action = useContext(FrameActionContext);
    const hasAction = action !== null && action !== undefined;

    return (
        <div className={`flex items-end justify-between gap-4 ${props.className ?? ''}`}>
            <div className='min-w-0'>
                {props.children}
            </div>
            {(props.trailing !== undefined || hasAction) && (
                <div className='flex shrink-0 items-center gap-2 pb-1'>
                    {props.trailing}
                    {hasAction && (
                        <div className='ml-2 hidden lg:block'>
                            {action}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default PageHeaderComponent;
