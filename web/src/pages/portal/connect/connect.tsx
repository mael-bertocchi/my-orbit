import LogoComponent from 'components/logo/logo';
import SpinnerComponent from 'components/spinner/spinner';
import { CircleCheck, KeyRound } from 'lucide-react';
import type { Maybe } from 'models';
import { PasskeyError, signWithPasskey } from 'modules/identity/identity-passkeys';
import identityService from 'modules/identity/identity-service';
import { t } from 'modules/language/language-service';
import { useState, type JSX } from 'react';
import { useSearchParams } from 'react-router-dom';
import { messageOf } from 'utils/errors';

/**
 * @constant CALLBACK
 * @description Where the page hands the one-time code back: the iOS app's own scheme, which the browser sheet it opened
 * the page in is waiting for.
 */
const CALLBACK = 'my-orbit://identity';

/**
 * @function isChallenge
 * @description Whether a PKCE challenge looks like one: a base64url SHA-256.
 */
function isChallenge(value: Maybe<string>): value is string {
    return value !== null && /^[A-Za-z0-9_-]{43}$/.test(value);
}

/**
 * @function isState
 * @description Whether the app's state looks like the random string it sends to recognise its own answer.
 */
function isState(value: Maybe<string>): value is string {
    return value !== null && /^[A-Za-z0-9_-]{16,128}$/.test(value);
}

/**
 * @function ConnectPage
 * @description The page the iOS app opens in a browser sheet to sign in, since the passkey belongs to the portal's site.
 * The owner signs in with it here; the server hands back a one-time code bound to the app's PKCE challenge, and the page
 * passes it to the app through its scheme. The page itself opens no session, and asks for the passkey every time.
 */
function ConnectPage(): JSX.Element {
    const [params] = useSearchParams();
    const [error, setError] = useState<Maybe<string>>(null);
    const [isWorking, setIsWorking] = useState(false);
    const [isDone, setIsDone] = useState(false);
    const challenge = params.get('challenge');
    const state = params.get('state');
    const isComplete = isChallenge(challenge) && isState(state);

    /**
     * @function connect
     * @description Signs in with the passkey and sends the app its code.
     */
    const connect = async (): Promise<void> => {
        if (!isChallenge(challenge) || !isState(state)) {
            return;
        }

        setIsWorking(true);
        setError(null);

        try {
            const code = await identityService.connectApplication(await signWithPasskey(await identityService.getLoginOptions()), challenge);
            const callback = new URL(CALLBACK);

            callback.searchParams.set('code', code);
            callback.searchParams.set('state', state);
            setIsDone(true);
            window.location.assign(callback.toString());
        } catch (failure: unknown) {
            setError(failure instanceof PasskeyError && failure.isCancelled ? null : messageOf(failure));
        } finally {
            setIsWorking(false);
        }
    };

    return (
        <main className='flex min-h-dvh items-center justify-center px-5'>
            <div className='w-full max-w-[380px] animate-rise text-center'>
                <div className='flex justify-center'>
                    <LogoComponent size={76} />
                </div>
                <h1 className='mt-6 text-[28px] font-semibold tracking-tight'>{t('connect.title')}</h1>

                {!isComplete && (
                    <p className='mt-3 text-[15px] text-negative-text' role='alert'>{t('connect.invalid')}</p>
                )}

                {isComplete && isDone && (
                    <p className='mt-6 flex items-center justify-center gap-2 text-[15px] text-ink-secondary'>
                        <CircleCheck size={19} className='text-positive' />
                        {t('connect.done')}
                    </p>
                )}

                {isComplete && !isDone && (
                    <>
                        <p className='mt-3 text-[15px] text-ink-secondary'>{t('connect.prompt')}</p>
                        <button type='button' className='button-primary mt-8' disabled={isWorking} onClick={() => void connect()}>
                            <KeyRound size={19} strokeWidth={2.3} />
                            {t('connect.action')}
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
            </div>
        </main>
    );
}

export default ConnectPage;
