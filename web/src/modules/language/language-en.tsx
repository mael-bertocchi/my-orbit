import { budgetEn } from 'modules/budget/budget-language-en';
import { watchlistEn } from 'modules/watchlist/watchlist-language-en';

/**
 * @constant portalEn
 * @description Every sentence the portal itself shows, in English, and those its apps share. The keys are what the rest
 * of the code asks for; `{name}` marks a value filled in when the sentence is used.
 */
export const portalEn = {
    'common.cancel': 'Cancel',
    'common.close': 'Close',
    'common.loading': 'Loading',
    'common.irreversible': "This can't be undone.",

    'portal.loadFailed': "This page couldn't be loaded",
    'portal.reload': 'Reload',

    'signIn.headline': 'Your budget, your films and series, and everything in your orbit, together in one place.',
    'signIn.action': 'Sign in',
    'signIn.setUp': 'Set up a passkey',
    'signIn.setUpPrompt': "Paste the enrollment token set in the server's environment, then create your passkey.",
    'signIn.token': 'Enrollment token',
    'signIn.create': 'Create a passkey',
    'signIn.back': 'Back',

    'connect.title': 'Connect the app',
    'connect.prompt': 'Sign in with your passkey to open Orbit on this iPhone.',
    'connect.action': 'Continue with a passkey',
    'connect.done': 'Signed in. You can go back to the app.',
    'connect.invalid': 'This link is incomplete. Start again from the app.',

    'authorize.title': 'Authorize {name}',
    'authorize.prompt': '{name} will be able to read and change everything in your Orbit account, on your behalf. Confirm with your passkey to send it back to {host}.',
    'authorize.action': 'Authorize with a passkey',
    'authorize.deny': 'Deny',
    'authorize.done': 'Authorized. You can go back to {name}.',
    'authorize.invalid': 'This authorization request is incomplete or comes from an unknown client.',

    'frame.sections': 'Sections',
    'frame.home': 'Home',
    'frame.launcherEyebrow': 'Orbit',
    'frame.apps': 'Apps',
    'frame.settings': 'Settings',

    'home.morning': 'Good morning, {name}',
    'home.afternoon': 'Good afternoon, {name}',
    'home.evening': 'Good evening, {name}',
    'home.welcome': 'Welcome',
    'home.open': 'Open {app}',

    'account.eyebrow': 'Orbit',
    'account.title': 'Account',
    'account.passkeys': 'Passkeys',
    'account.passkeysNote': "Any of these passkeys opens Orbit on its own. The last one can't be removed.",
    'account.addPasskey': 'Add a passkey',
    'account.passkeyAdded': 'Passkey added.',
    'account.created': 'Created {date}',
    'account.lastUsed': 'Last used {date}',
    'account.neverUsed': 'Never used',
    'account.synced': 'Synced',
    'account.passkey': 'Passkey',
    'account.securityKey': 'Security key',
    'account.googlePasswordManager': 'Google Password Manager',
    'account.renamePasskey': 'Rename {name}',
    'account.renameTitle': 'Rename passkey',
    'account.passkeyName': 'Name',
    'account.passkeyNameNote': "Leave it empty to go back to its password manager's name.",
    'account.save': 'Save',
    'account.removePasskey': 'Remove {name}',
    'account.confirmRemove': 'Remove this passkey?',
    'account.removeMessage': "It won't open Orbit anymore. Delete it from your passwords too.",
    'account.removeAction': 'Remove',
    'account.connections': 'External apps',
    'account.connectionsNote': 'Apps such as Claude that can access your account. You can revoke their access at any time.',
    'account.noConnection': 'No app connected',
    'account.connected': 'Authorized {date}',
    'account.revokeConnection': 'Revoke {name}',
    'account.confirmRevoke': 'Revoke {name}?',
    'account.revokeMessage': "It will lose its access to Orbit at once. To connect it again, you'll authorize it with your passkey.",
    'account.revokeAction': 'Revoke',
    'account.general': 'General',
    'account.language': 'Language',
    'account.automatic': 'Automatic',
    'account.session': 'Session',
    'account.signOut': 'Sign out',
    'account.confirmSignOut': 'Sign out?',
    'account.signOutMessage': "You'll need your passkey to open Orbit again.",

    'error.generic': 'Something went wrong.',
    'error.unreachable': "Can't reach the server.",
    'error.sessionExpired': 'Your session has expired.',
    'error.tooManyAttempts': 'Too many attempts. Try again in a moment.',
    'error.unavailable': 'The server is unavailable right now.',
    'error.refused': 'The server refused the request.',
    'error.unexpected': 'The server sent an unexpected response.',
    'error.passkeyCancelled': 'The passkey request was cancelled.',
    'error.passkeyUnsupported': "This browser can't use passkeys.",
    'error.passkeyRefused': "This passkey isn't recognized.",
    'error.passkeyExists': 'This passkey is already registered.',
    'error.enrollmentToken': 'Wrong enrollment token, or enrollment is closed.',
    'error.lastPasskey': "Your last passkey can't be removed."
};

/**
 * @type PortalMessages
 * @description Every sentence of the portal in one language. Typing a translation with it makes a forgotten sentence a
 * build error.
 */
export type PortalMessages = Record<keyof typeof portalEn, string>;

/**
 * @type Clash
 * @description Nothing when none of an app's keys is already the portal's or another app's; `never` otherwise, so a
 * clash fails the build instead of silently rewording a sentence elsewhere.
 */
type Clash<Taken, Added> = keyof Taken & keyof Added extends never ? unknown : never;

/**
 * @function combine
 * @description Puts the portal's sentences and an app's together.
 *
 * @param {Taken} taken The sentences gathered so far.
 * @param {Added} added The app's.
 *
 * @returns {Taken & Added} Both.
 */
function combine<Taken extends object, Added extends object>(taken: Taken, added: Added & Clash<Taken, Added>): Taken & Added {
    return { ...taken, ...added };
}

/**
 * @constant en
 * @description Every sentence the page shows, in English: the portal's, then each app's. An app's keys start with its
 * id (the budget, the first app, predates the rule).
 */
export const en = combine(combine(portalEn, budgetEn), watchlistEn);

/**
 * @type MessageKey
 * @description A sentence the page can show.
 */
export type MessageKey = keyof typeof en;

/**
 * @type Messages
 * @description Every sentence in one language. Typing a translation with it makes a forgotten sentence a build error.
 */
export type Messages = Record<MessageKey, string>;
