import type { JSX, ReactNode } from 'react';

/**
 * @interface ListRowComponentProps
 * @description Properties of one row
 */
interface ListRowComponentProps {
    icon?: ReactNode; /*!< Its icon */
    title: ReactNode; /*!< Its title */
    children?: ReactNode; /*!< What sits on its right */
    onClick?: () => void; /*!< Called when tapped, which makes it a button */
    destructive?: boolean; /*!< Whether it destroys something, which draws it in red */
    disabled?: boolean; /*!< Whether it can't be tapped right now */
}

/**
 * @function ListRowComponent
 * @description One row: an icon, a title, and whatever sits on its right.
 *
 * @param {ListRowComponentProps} props The properties of the component
 */
function ListRowComponent(props: ListRowComponentProps): JSX.Element {
    const destructive = props.destructive ?? false;
    const disabled = props.disabled ?? false;

    const content = (
        <>
            {props.icon}
            <span className={`flex-1 text-[15px] ${destructive ? 'text-negative-text' : ''}`}>{props.title}</span>
            {props.children}
        </>
    );

    if (props.onClick === undefined) {
        return <div className='flex min-h-[52px] items-center gap-3 px-4 py-2.5'>{content}</div>;
    }

    return (
        <button type='button' onClick={props.onClick} disabled={disabled} className='flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left pressable disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent'>
            {content}
        </button>
    );
}

export default ListRowComponent;
