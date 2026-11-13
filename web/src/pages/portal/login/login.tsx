import OrbitHeroComponent from 'components/orbit-hero/orbit-hero';
import SpinnerComponent from 'components/spinner/spinner';
import { KeyRound } from 'lucide-react';
import type { Maybe } from 'models';
import { useIdentityContext } from 'modules/identity/identity-hooks';
import type { IdentityContextProps } from 'modules/identity/identity-models';
import { PasskeyError } from 'modules/identity/identity-passkeys';
import identityService from 'modules/identity/identity-service';
import { t } from 'modules/language/language-service';
import { useEffect, useState, type FormEvent, type JSX } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { messageOf } from 'utils/errors';

/**
 * @type SignInMode
 * @description Whether the page signs in with a passkey, or creates the first one with the enrollment token.
 */
type SignInMode = 'signIn' | 'enroll';

/**
 * @function LoginPage
 * @description The portal's door: the logo with the apps turning around it, a sentence on what the portal holds and one
 * button that signs in with a passkey (Face ID or Touch ID on an Apple device), without dwelling on how. While
 * the server has an enrollment token set, it also offers to create a passkey with it, which is how the first one is made.
 * Once signed in, it goes back to the page asked for.
 *
 * @returns {JSX.Element} The sign-in page
 */
function LoginPage(): JSX.Element {
    const { status, signIn, enroll }: IdentityContextProps = useIdentityContext();
    const location = useLocation();
    const [mode, setMode] = useState<SignInMode>('signIn');
    const [isEnrollmentOpen, setIsEnrollmentOpen] = useState(false);
    const [token, setToken] = useState('');
    const [error, setError] = useState<Maybe<string>>(null);
    const [isWorking, setIsWorking] = useState(false);

    useEffect(() => {
        let isCurrent = true;

        identityService.isEnrollmentOpen().then((open: boolean) => {
            if (isCurrent) {
                setIsEnrollmentOpen(open);
            }
        }).catch(() => undefined);

        return () => {
            isCurrent = false;
        };
    }, []);

    /**
     * @function attempt
     * @description Runs a passkey request, saying why it failed unless the person dismissed it.
     */
    const attempt = async (request: () => Promise<void>): Promise<void> => {
        setIsWorking(true);
        setError(null);

        try {
            await request();
        } catch (failure: unknown) {
            setError(failure instanceof PasskeyError && failure.isCancelled ? null : messageOf(failure));
            setIsWorking(false);
        }
    };

    /**
     * @function submitToken
     * @description Creates the passkey with the token typed in.
     */
    const submitToken = (event: FormEvent<HTMLFormElement>): void => {
        event.preventDefault();

        if (token.trim() !== '') {
            void attempt(() => enroll(token.trim()));
        }
    };

    /**
     * @function switchTo
     * @description Switches between signing in and creating the first passkey, forgetting the last error
     *
     * @param {SignInMode} next What the page does next
     */
    const switchTo = (next: SignInMode): void => {
        setError(null);
        setMode(next);
    };

    if (status === 'signedIn') {
        const from: unknown = location.state !== null && typeof location.state === 'object' && 'from' in location.state ? location.state.from : null;

        return <Navigate to={typeof from === 'string' && from.startsWith('/') ? from : '/'} replace />;
    }

    return (
        <main className='flex min-h-dvh flex-col items-center justify-center overflow-hidden px-5 py-10'>
            <div className='w-full max-w-[560px] animate-rise text-center'>
                <div className='-my-[38px] scale-[0.8] sm:my-0 sm:scale-100'>
                    <OrbitHeroComponent />
                </div>
                <h1 className='mt-6 text-[56px] font-semibold leading-none tracking-[-0.035em] sm:text-[84px]'>Orbit</h1>

                {mode !== 'signIn' ? (
                    <form className='mx-auto mt-10 max-w-[380px] text-left' onSubmit={submitToken}>
                        <p className='text-center text-[15px] text-ink-secondary'>{t('signIn.setUpPrompt')}</p>
                        <label htmlFor='enrollment-token' className='field-label mt-6'>{t('signIn.token')}</label>
                        <input id='enrollment-token' type='password' autoComplete='off' spellCheck={false} value={token} disabled={isWorking} onChange={(event) => setToken(event.target.value)} className='field font-mono' />
                        <button type='submit' className='button-primary mt-5' disabled={isWorking || token.trim() === ''}>
                            <KeyRound size={19} strokeWidth={2.3} />
                            {t('signIn.create')}
                        </button>
                        <div className='text-center'>
                            <button type='button' className='mt-5 text-[15px] font-medium text-accent hover:text-accent-strong' onClick={() => switchTo('signIn')}>
                                {t('signIn.back')}
                            </button>
                        </div>
                    </form>
                ) : (
                    <div className='flex flex-col items-center'>
                        <p className='mx-auto mt-5 max-w-[480px] text-balance text-[20px] font-medium leading-snug tracking-tight text-ink-secondary sm:text-[24px]'>{t('signIn.headline')}</p>
                        <button type='button' className='button-primary mt-9 w-auto rounded-full px-9' disabled={isWorking} onClick={() => void attempt(signIn)}>
                            {t('signIn.action')}
                        </button>
                        {isEnrollmentOpen && (
                            <button type='button' className='mt-5 text-[15px] font-medium text-accent hover:text-accent-strong' onClick={() => switchTo('enroll')}>
                                {t('signIn.setUp')}
                            </button>
                        )}
                    </div>
                )}

                <div className='mt-6 flex min-h-6 items-center justify-center'>
                    {isWorking ? (
                        <SpinnerComponent />
                    ) : error !== null && <p className='text-[15px] text-negative-text' role='alert'>{error}</p>}
                </div>
            </div>
        </main>
    );
}

export default LoginPage;
