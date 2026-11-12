import type { SyncStatus } from 'modules/budget/budget-store';
import type { MessageKey } from 'modules/language/language-en';
import { t } from 'modules/language/language-service';
import type { JSX } from 'react';

/**
 * @constant LABELS
 * @description Each status, as the app's Settings badge tells it to screen readers.
 */
const LABELS: Record<SyncStatus, { label: MessageKey; color: string }> = {
    syncing: { label: 'sync.syncing', color: 'bg-ink-quaternary' },
    synced: { label: 'sync.synced', color: 'bg-positive' },
    offline: { label: 'sync.offline', color: 'bg-warning' },
    error: { label: 'sync.error', color: 'bg-negative' }
};

/**
 * @interface SyncBadgeComponentProps
 * @description Sync badge properties
 */
interface SyncBadgeComponentProps {
    status: SyncStatus; /*!< Where the page stands with the server */
}

/**
 * @function SyncBadgeComponent
 * @description Where the page stands with the server, as a dot alone; its words stay for screen readers and on hover.
 *
 * @param {SyncBadgeComponentProps} props The properties of the component
 */
function SyncBadgeComponent(props: SyncBadgeComponentProps): JSX.Element {
    const { label, color } = LABELS[props.status];

    return (
        <span role='status' aria-label={t(label)} title={t(label)} className={`h-2 w-2 rounded-full ${color} ${props.status !== 'syncing' ? '' : 'animate-pulse'}`} />
    );
}

export default SyncBadgeComponent;
