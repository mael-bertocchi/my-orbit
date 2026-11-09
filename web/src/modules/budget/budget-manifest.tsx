import { Wallet } from 'lucide-react';
import type { PortalApp } from 'modules/apps/apps-models';

/**
 * @constant budget
 * @description The budget: what is left to spend this month, the history of operations, and the limits. Its code only
 * loads once it is opened, or once its tile shows on the home page.
 */
export const budget: PortalApp = {
    id: 'budget',
    name: 'budget.appName',
    summary: 'budget.appSummary',
    icon: Wallet,
    load: () => import('pages/budget/budget'),
    loadWidget: () => import('pages/budget/budget-widget/budget-widget')
};
