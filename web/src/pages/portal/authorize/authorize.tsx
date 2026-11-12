import LogoComponent from 'components/logo/logo';
import SpinnerComponent from 'components/spinner/spinner';
import { CircleCheck, KeyRound } from 'lucide-react';
import type { Maybe } from 'models';
import type { ClientAuthorization, OAuthClient } from 'modules/identity/identity-models';
import { PasskeyError, signWithPasskey } from 'modules/identity/identity-passkeys';
import identityService from 'modules/identity/identity-service';
import { t } from 'modules/language/language-service';
import { useEffect, useState, type JSX } from 'react';
import { useSearchParams } from 'react-router-dom';
import { messageOf } from 'utils/errors';

/**
 * @type ClientLookup
 * @description Where finding out who the client is stands: under way, known, or refused
 */
type ClientLookup = { status: 'loading' } | { status: 'known'; client: OAuthClient } | { status: 'invalid' };

/**
 * @function authorizationOf
 * @description What the client asks for, read from the address it sent the owner to, when it asks in a way the server
 * takes: a code, with a PKCE challenge hashed with SHA-256
 *
 * @param {URLSearchParams} params The address's parameters
 * @returns {Maybe<ClientAuthorization>} What it asks for, or null when the request is incomplete
 */
function authorizationOf(params: URLSearchParams): Maybe<ClientAuthorization> {
    const clientId = params.get('client_id');
    const redirectUri = params.get('redirect_uri');
    const codeChallenge = params.get('code_challenge');
    const isComplete = params.get('response_type') === 'code' && params.get('code_challenge_method') === 'S256' && clientId !== null && redirectUri !== null && codeChallenge !== null && /^[A-Za-z0-9_-]{43}$/.test(codeChallenge);

    return isComplete ? { clientId, redirectUri, codeChallenge, state: params.get('state') ?? undefined } : null;
}

/**
 * @function deniedUrl
 * @description Where a client the owner turned down is sent back, told so in OAuth's words
 *
 * @param {ClientAuthorization} authorization What the client asked for
 * @returns {string} The address
 */
function deniedUrl(authorization: ClientAuthorization): string {
    const url = new URL(authorization.redirectUri);

    url.searchParams.set('error', 'access_denied');

    if (authorization.state !== undefined) {
        url.searchParams.set('state', authorization.state);
    }

    return url.toString();
}

/**
 * @function AuthorizePage
 * @description The page an MCP client such as Claude sends the owner to, to be let into the whole account, every app
 * included. The server first checks it knows the client and the address it waits on, so the page can name it; the
 * owner then confirms with the passkey, and the page sends the client back with a one-time code bound to its PKCE
 * challenge. The page itself opens no session, and asks for the passkey every time.
 */
function AuthorizePage(): JSX.Element {
    const [params] = useSearchParams();
    const [authorization] = useState(() => authorizationOf(params));
    const [lookup, setLookup] = useState<ClientLookup>({ status: authorization !== null ? 'loading' : 'invalid' });
    const [error, setError] = useState<Maybe<string>>(null);
    const [isWorking, setIsWorking] = useState(false);
    const [isDone, setIsDone] = useState(false);

    useEffect(() => {
        if (authorization === null) {
            return;
        }

        identityService.describeClient(authorization.clientId, authorization.redirectUri).then((client) => setLookup({ status: 'known', client })).catch(() => setLookup({ status: 'invalid' }));
    }, [authorization]);

    /**
     * @function authorize
     * @description Confirms with the passkey and sends the client back with its code
     */
    const authorize = async (): Promise<void> => {
        if (authorization === null) {
            return;
        }

        setIsWorking(true);
        setError(null);

        try {
            const redirectUrl = await identityService.authorizeClient(await signWithPasskey(await identityService.getLoginOptions()), authorization);

            setIsDone(true);
            window.location.assign(redirectUrl);
        } catch (failure: unknown) {
            setError(failure instanceof PasskeyError && failure.isCancelled ? null : messageOf(failure));
        } finally {
            setIsWorking(false);
        }
    };

    /**
     * @function deny
     * @description Sends the client back, turned down
     */
    const deny = (): void => {
        if (authorization !== null) {
            window.location.assign(deniedUrl(authorization));
        }
    };

    const name = lookup.status !== 'known' ? '' : lookup.client.name;

    return (
        <main className='flex min-h-dvh items-center justify-center px-5'>
            <div className='w-full max-w-[380px] animate-rise text-center'>
                <div className='flex justify-center'>
                    <LogoComponent size={76} />
                </div>

                {lookup.status === 'loading' && (
                    <div className='mt-8 flex justify-center'>
                        <SpinnerComponent />
                    </div>
                )}

                {lookup.status === 'invalid' && (
                    <p className='mt-6 text-[15px] text-negative-text' role='alert'>{t('authorize.invalid')}</p>
                )}

                {lookup.status === 'known' && (
                    <>
                        <h1 className='mt-6 text-[28px] font-semibold tracking-tight'>{t('authorize.title', { name })}</h1>
                        {isDone ? (
                            <p className='mt-6 flex items-center justify-center gap-2 text-[15px] text-ink-secondary'>
                                <CircleCheck size={19} className='text-positive' />
                                {t('authorize.done', { name })}
                            </p>
                        ) : (
                            <>
                                <p className='mt-3 text-[15px] text-ink-secondary'>{t('authorize.prompt', { name, host: lookup.client.redirectHost })}</p>
                                <button type='button' className='button-primary mt-8' disabled={isWorking} onClick={() => void authorize()}>
                                    <KeyRound size={19} strokeWidth={2.3} />
                                    {t('authorize.action')}
                                </button>
                                <button type='button' className='mt-3 h-11 w-full rounded-2xl text-[15px] font-medium text-ink-secondary transition hover:bg-fill disabled:opacity-50' disabled={isWorking} onClick={deny}>
                                    {t('authorize.deny')}
                                </button>
                                <div className='mt-6 flex min-h-6 items-center justify-center'>
                                    {isWorking ? (
                                        <SpinnerComponent />
                                    ) : error !== null && (
                                        <p className='text-[15px] text-negative-text' role='alert'>{error}</p>
                                    )}
                                </div>
                            </>
                        )}
                    </>
                )}
            </div>
        </main>
    );
}

export default AuthorizePage;
