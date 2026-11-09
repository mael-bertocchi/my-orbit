import type { PortalApp } from 'modules/apps/apps-models';
import type { JSX } from 'react';

/**
 * @constant APP_ICON_GRADIENT
 * @description The gradient every app's icon shares, from the top left to the bottom right: the logo's own slate, so the
 * apps read as one family beside the logo.
 */
const APP_ICON_GRADIENT = 'linear-gradient(135deg, #6B7787, #434C59)';

/**
 * @interface AppIconComponentProps
 * @description App icon properties
 */
interface AppIconComponentProps {
    app: PortalApp; /*!< The app */
    size?: number; /*!< Its side, in pixels */
}

/**
 * @function AppIconComponent
 * @description An app's icon: its glyph in white on the slate gradient every app shares, with the corners of an iOS icon.
 *
 * @param {AppIconComponentProps} props The properties of the component
 */
function AppIconComponent(props: AppIconComponentProps): JSX.Element {
    const size = props.size ?? 28;

    const Icon = props.app.icon;

    return (
        <span className='inline-flex shrink-0 items-center justify-center text-white shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.08)]' style={{ width: size, height: size, borderRadius: size * 0.235, backgroundImage: APP_ICON_GRADIENT }} aria-hidden='true'>
            <Icon size={size * 0.55} strokeWidth={2} />
        </span>
    );
}

export default AppIconComponent;
