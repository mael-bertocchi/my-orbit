import AlertComponent from 'components/alert/alert';
import FrameComponent from 'components/frame/frame';
import IconTileComponent from 'components/icon-tile/icon-tile';
import ListGroupComponent from 'components/list-group/list-group';
import ListRowComponent from 'components/list-row/list-row';
import SheetComponent from 'components/sheet/sheet';
import SpinnerComponent from 'components/spinner/spinner';
import { KeyRound, Languages, LogOut, Pencil, Plug, Plus, Trash2, Unplug } from 'lucide-react';
import type { Maybe } from 'models';
import { useIdentityContext } from 'modules/identity/identity-hooks';
import type { ClientConnection, Passkey } from 'modules/identity/identity-models';
import type { IdentityContextProps } from 'modules/identity/identity-models';
import { authenticatorName, createPasskey, forgetPasskey, PasskeyError, passkeyName } from 'modules/identity/identity-passkeys';
import identityService from 'modules/identity/identity-service';
import { chooseLanguage, currentLanguage, isLanguageChoice, LANGUAGES, languageChoice, t } from 'modules/language/language-service';
import { useToastContext } from 'modules/toast/toast-hooks';
import type { ToastContextProps } from 'modules/toast/toast-models';
import { useEffect, useState, type ChangeEvent, type FormEvent, type JSX } from 'react';
import { messageOf } from 'utils/errors';

/**
 * @constant ACCENT
 * @description The colour of the plain setting tiles.
 */
const ACCENT = '#56616F';

/**
 * @constant NEGATIVE
 * @description The colour of the destructive setting tiles.
 */
const NEGATIVE = '#FF3B30';

/**
 * @constant RENAME_FORM_ID
 * @description The rename form's id, so the save button pinned under it can send it.
 */
const RENAME_FORM_ID = 'passkey-name-form';

/**
 * @constant NAME_LENGTH
 * @description The longest name a passkey may be given, as the server allows.
 */
const NAME_LENGTH = 64;

/**
 * @function day
 * @description A date, written in the page's language.
 */
function day(date: Date): string {
    return new Intl.DateTimeFormat(currentLanguage(), { dateStyle: 'medium' }).format(date);
}

/**
 * @interface PasskeyRowComponentProps
 * @description Properties of one passkey row
 */
interface PasskeyRowComponentProps {
    passkey: Passkey; /*!< The passkey */
    canRemove: boolean; /*!< Whether it may be removed, which the last one may not */
    onRename: () => void; /*!< Called to rename it */
    onRemove: () => void; /*!< Called to remove it */
}

/**
 * @function PasskeyRowComponent
 * @description One passkey: its name, when it was created and last used, a button to rename it, and one to remove it
 * unless it is the last one.
 *
 * @param {PasskeyRowComponentProps} props The properties of the component
 */
function PasskeyRowComponent(props: PasskeyRowComponentProps): JSX.Element {
    const name = passkeyName(props.passkey);
    const used = props.passkey.lastUsedAt !== null ? t('account.lastUsed', { date: day(props.passkey.lastUsedAt) }) : t('account.neverUsed');

    /**
     * @constant title
     * @description The passkey's name, whether it is synced, and when it was created and last used
     */
    const title = (
        <span className='block'>
            <span className='flex items-center gap-2'>
                {name}
                {props.passkey.backedUp && (
                    <span className='rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent'>
                        {t('account.synced')}
                    </span>
                )}
            </span>
            <span className='block text-[13px] text-ink-secondary'>
                {t('account.created', { date: day(props.passkey.createdAt) })} • {used}
            </span>
        </span>
    );

    return (
        <ListRowComponent icon={<IconTileComponent icon={KeyRound} color={ACCENT} size={30} />} title={title}>
            <button type='button' onClick={props.onRename} aria-label={t('account.renamePasskey', { name })} className='flex h-8 w-8 items-center justify-center rounded-full text-ink-tertiary transition hover:bg-fill hover:text-ink'>
                <Pencil size={16} />
            </button>
            {props.canRemove && (
                <button type='button' onClick={props.onRemove} aria-label={t('account.removePasskey', { name })} className='flex h-8 w-8 items-center justify-center rounded-full text-ink-tertiary transition hover:bg-negative-soft hover:text-negative-text'>
                    <Trash2 size={17} />
                </button>
            )}
        </ListRowComponent>
    );
}

/**
 * @function moment
 * @description A date and a time, written in the page's language.
 */
function moment(date: Date): string {
    return new Intl.DateTimeFormat(currentLanguage(), { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

/**
 * @interface ConnectionRowComponentProps
 * @description Properties of one connected app's row
 */
interface ConnectionRowComponentProps {
    connection: ClientConnection; /*!< The app */
    onRevoke: () => void; /*!< Called to revoke it */
}

/**
 * @function ConnectionRowComponent
 * @description One app the owner authorized: its name, when it was authorized and last used, and a button to revoke it.
 *
 * @param {ConnectionRowComponentProps} props The properties of the component
 */
function ConnectionRowComponent(props: ConnectionRowComponentProps): JSX.Element {
    const { name, connectedAt, lastUsedAt } = props.connection;

    /**
     * @constant title
     * @description The app's name, and when it was authorized and last used
     */
    const title = (
        <span className='block'>
            <span className='block'>{name}</span>
            <span className='block text-[13px] text-ink-secondary'>
                {t('account.connected', { date: day(connectedAt) })} • {t('account.lastUsed', { date: moment(lastUsedAt) })}
            </span>
        </span>
    );

    return (
        <ListRowComponent icon={<IconTileComponent icon={Plug} color={ACCENT} size={30} />} title={title}>
            <button type='button' onClick={props.onRevoke} aria-label={t('account.revokeConnection', { name })} className='flex h-8 w-8 items-center justify-center rounded-full text-ink-tertiary transition hover:bg-negative-soft hover:text-negative-text'>
                <Unplug size={17} />
            </button>
        </ListRowComponent>
    );
}

/**
 * @interface PasskeyNameFormComponentProps
 * @description Properties of the rename form
 */
interface PasskeyNameFormComponentProps {
    passkey: Passkey; /*!< The passkey being renamed */
    onSave: (name: Maybe<string>) => void; /*!< Called with its new name, or null to go back to its authenticator's */
}

/**
 * @function PasskeyNameFormComponent
 * @description The name to give a passkey, its authenticator's shown in its place while it is empty.
 *
 * @param {PasskeyNameFormComponentProps} props The properties of the component
 */
function PasskeyNameFormComponent(props: PasskeyNameFormComponentProps): JSX.Element {
    const [name, setName] = useState(props.passkey.name ?? '');

    /**
     * @function submit
     * @description Saves the name instead of sending the form, an empty one taking the name back
     */
    const submit = (event: FormEvent<HTMLFormElement>): void => {
        event.preventDefault();

        const trimmed = name.trim();

        props.onSave(trimmed !== '' ? trimmed : null);
    };

    return (
        <form id={RENAME_FORM_ID} onSubmit={submit}>
            <label className='field-label' htmlFor='passkey-name'>{t('account.passkeyName')}</label>
            <input id='passkey-name' className='field' value={name} maxLength={NAME_LENGTH} onChange={(event) => setName(event.target.value)} placeholder={authenticatorName(props.passkey)} autoComplete='off' autoFocus />
            <p className='mt-2 text-[13px] text-ink-secondary'>{t('account.passkeyNameNote')}</p>
        </form>
    );
}

/**
 * @function AccountPage
 * @description The portal's account settings: the passkeys that open it (add one, rename one, remove one), the apps
 * authorized with one (revoke one), the language every app speaks, and signing out.
 */
function AccountPage(): JSX.Element {
    const { signOut }: IdentityContextProps = useIdentityContext();
    const { showToast }: ToastContextProps = useToastContext();
    const [passkeys, setPasskeys] = useState<Maybe<Passkey[]>>(null);
    const [isAdding, setIsAdding] = useState(false);
    const [renaming, setRenaming] = useState<Maybe<Passkey>>(null);
    const [removing, setRemoving] = useState<Maybe<Passkey>>(null);
    const [connections, setConnections] = useState<Maybe<ClientConnection[]>>(null);
    const [revoking, setRevoking] = useState<Maybe<ClientConnection>>(null);
    const [isConfirmingSignOut, setIsConfirmingSignOut] = useState(false);
    const [language, setLanguage] = useState(languageChoice);
    const [revision, setRevision] = useState(0);

    useEffect(() => {
        let isCurrent = true;

        identityService.getPasskeys().then((found: Passkey[]) => {
            if (isCurrent) {
                setPasskeys(found);
            }
        }).catch((failure: unknown) => showToast(messageOf(failure)));

        identityService.getConnections().then((found: ClientConnection[]) => {
            if (isCurrent) {
                setConnections(found);
            }
        }).catch((failure: unknown) => showToast(messageOf(failure)));

        return () => {
            isCurrent = false;
        };
    }, [showToast, revision]);

    /**
     * @function add
     * @description Creates another passkey, stores it, and offers to name it.
     */
    const add = async (): Promise<void> => {
        setIsAdding(true);

        try {
            const added = await identityService.addPasskey(await createPasskey(await identityService.getPasskeyOptions()));

            showToast(t('account.passkeyAdded'));
            setRevision((current) => current + 1);
            setRenaming(added);
        } catch (failure: unknown) {
            if (!(failure instanceof PasskeyError && failure.isCancelled)) {
                showToast(messageOf(failure));
            }
        } finally {
            setIsAdding(false);
        }
    };

    /**
     * @function rename
     * @description Saves the name given to the passkey being renamed
     */
    const rename = async (name: Maybe<string>): Promise<void> => {
        if (renaming === null) {
            return;
        }

        const passkey = renaming;

        setRenaming(null);

        if (name === passkey.name) {
            return;
        }

        try {
            await identityService.renamePasskey(passkey.id, name);
            setRevision((current) => current + 1);
        } catch (failure: unknown) {
            showToast(messageOf(failure));
        }
    };

    /**
     * @function saveName
     * @description Renames the passkey with the name the form sent
     */
    const saveName = (name: Maybe<string>): void => {
        void rename(name);
    };

    /**
     * @function remove
     * @description Forgets a passkey on the server, then asks the password manager to forget it too.
     */
    const remove = async (passkey: Passkey): Promise<void> => {
        setRemoving(null);

        try {
            await identityService.removePasskey(passkey.id);
            forgetPasskey(passkey.id);
            setRevision((current) => current + 1);
        } catch (failure: unknown) {
            showToast(messageOf(failure));
        }
    };

    /**
     * @function revoke
     * @description Takes an app's access away
     */
    const revoke = async (connection: ClientConnection): Promise<void> => {
        setRevoking(null);

        try {
            await identityService.revokeConnection(connection.id);
            setRevision((current) => current + 1);
        } catch (failure: unknown) {
            showToast(messageOf(failure));
        }
    };

    /**
     * @function confirmRevoke
     * @description Revokes the app asked about, once confirmed
     */
    const confirmRevoke = (): void => {
        if (revoking !== null) {
            void revoke(revoking);
        }
    };

    /**
     * @function pickLanguage
     * @description Switches every app to the language picked
     */
    const pickLanguage = (event: ChangeEvent<HTMLSelectElement>): void => {
        const next = event.target.value;

        if (!isLanguageChoice(next)) {
            return;
        }

        setLanguage(next);
        chooseLanguage(next);
    };

    /**
     * @function confirmRemove
     * @description Removes the passkey asked about, once confirmed
     */
    const confirmRemove = (): void => {
        if (removing !== null) {
            void remove(removing);
        }
    };

    /**
     * @function confirmSignOut
     * @description Signs out, once confirmed
     */
    const confirmSignOut = (): void => {
        setIsConfirmingSignOut(false);
        void signOut();
    };

    /**
     * @constant renameFooter
     * @description The button saving the passkey's name, pinned under the form
     */
    const renameFooter = (
        <button type='submit' form={RENAME_FORM_ID} className='button-primary'>
            {t('account.save')}
        </button>
    );

    return (
        <FrameComponent>
            <div className='animate-rise'>
                <p className='eyebrow'>{t('account.eyebrow')}</p>
                <h1 className='mb-8 mt-1 text-[34px] font-semibold leading-tight tracking-tight'>
                    {t('account.title')}
                </h1>

                <ListGroupComponent title={t('account.passkeys')} note={t('account.passkeysNote')}>
                    {passkeys !== null ? (
                        passkeys.map((passkey) => (
                            <PasskeyRowComponent key={passkey.id} passkey={passkey} canRemove={passkeys.length > 1} onRename={() => setRenaming(passkey)} onRemove={() => setRemoving(passkey)} />
                        ))
                    ) : (
                        <div className='flex min-h-[52px] items-center justify-center'><SpinnerComponent /></div>
                    )}
                    <ListRowComponent icon={<IconTileComponent icon={Plus} color={ACCENT} size={30} />} title={<span className='text-accent'>{t('account.addPasskey')}</span>} onClick={() => void add()} disabled={isAdding}>
                        {isAdding && <SpinnerComponent size={18} />}
                    </ListRowComponent>
                </ListGroupComponent>

                <ListGroupComponent title={t('account.connections')} note={t('account.connectionsNote')}>
                    {connections === null && (
                        <div className='flex min-h-[52px] items-center justify-center'><SpinnerComponent /></div>
                    )}
                    {connections !== null && connections.length === 0 && (
                        <ListRowComponent icon={<IconTileComponent icon={Plug} color={ACCENT} size={30} />} title={<span className='text-ink-secondary'>{t('account.noConnection')}</span>} />
                    )}
                    {connections?.map((connection) => (
                        <ConnectionRowComponent key={connection.id} connection={connection} onRevoke={() => setRevoking(connection)} />
                    ))}
                </ListGroupComponent>

                <ListGroupComponent title={t('account.general')}>
                    <ListRowComponent icon={<IconTileComponent icon={Languages} color={ACCENT} size={30} />} title={<label htmlFor='language'>{t('account.language')}</label>}>
                        <select id='language' value={language} onChange={pickLanguage} className='cursor-pointer rounded-lg bg-transparent py-1 text-right text-[15px] text-ink-secondary outline-none focus:ring-2 focus:ring-accent/40'>
                            <option value='automatic'>{t('account.automatic')}</option>
                            {LANGUAGES.map((option) => (
                                <option key={option.code} value={option.code} lang={option.code}>
                                    {option.name}
                                </option>
                            ))}
                        </select>
                    </ListRowComponent>
                </ListGroupComponent>

                <ListGroupComponent title={t('account.session')}>
                    <ListRowComponent icon={<IconTileComponent icon={LogOut} color={NEGATIVE} size={30} />} title={t('account.signOut')} destructive onClick={() => setIsConfirmingSignOut(true)} />
                </ListGroupComponent>

                <p className='mt-10 text-center text-[12px] text-ink-quaternary'>Orbit Web {__APP_VERSION__}</p>

                <SheetComponent open={renaming !== null} title={t('account.renameTitle')} onClose={() => setRenaming(null)} footer={renameFooter}>
                    {renaming !== null && <PasskeyNameFormComponent passkey={renaming} onSave={saveName} />}
                </SheetComponent>
                <AlertComponent open={removing !== null} title={t('account.confirmRemove')} message={t('account.removeMessage')} action={t('account.removeAction')} onConfirm={confirmRemove} onCancel={() => setRemoving(null)} />
                <AlertComponent open={revoking !== null} title={t('account.confirmRevoke', { name: revoking?.name ?? '' })} message={t('account.revokeMessage')} action={t('account.revokeAction')} onConfirm={confirmRevoke} onCancel={() => setRevoking(null)} />
                <AlertComponent open={isConfirmingSignOut} title={t('account.confirmSignOut')} message={t('account.signOutMessage')} action={t('account.signOut')} onConfirm={confirmSignOut} onCancel={() => setIsConfirmingSignOut(false)} />
            </div>
        </FrameComponent>
    );
}

export default AccountPage;
