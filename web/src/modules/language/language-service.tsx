import type { MessageKey, Messages } from 'modules/language/language-en';
import { en } from 'modules/language/language-en';
import { fr } from 'modules/language/language-fr';
import type { Language, LanguageChoice } from 'modules/language/language-models';

/**
 * @constant LANGUAGES
 * @description The languages the page speaks, each named in itself so it can be found whatever the page is in.
 */
export const LANGUAGES: readonly { code: Language; name: string }[] = [
    { code: 'en', name: 'English' },
    { code: 'fr', name: 'Français' }
];

/**
 * @constant MESSAGES
 * @description Every sentence, by language.
 */
const MESSAGES: Record<Language, Messages> = { en, fr };

/**
 * @constant CHOICE_KEY
 * @description Where the language picked in the account settings is kept.
 */
const CHOICE_KEY = 'my-orbit.language';

/**
 * @function isLanguage
 * @description Whether a code names a language the page speaks.
 */
function isLanguage(code: string): code is Language {
    return code in MESSAGES;
}

/**
 * @function isLanguageChoice
 * @description Whether a value is something the language picker can hold: a language the page speaks, or automatic
 *
 * @param {string} value The value
 * @returns {boolean} Whether it is one
 */
export function isLanguageChoice(value: string): value is LanguageChoice {
    return value === 'automatic' || isLanguage(value);
}

/**
 * @function storedChoice
 * @description The language picked on this browser, or automatic when none was or the storage can't be read.
 */
function storedChoice(): LanguageChoice {
    try {
        const stored = localStorage.getItem(CHOICE_KEY);

        return stored !== null && isLanguage(stored) ? stored : 'automatic';
    } catch {
        return 'automatic';
    }
}

/**
 * @function browserLanguage
 * @description The first of the browser's languages the page speaks, or English when it speaks none of them.
 */
function browserLanguage(): Language {
    try {
        for (const tag of navigator.languages) {
            const code = tag.toLowerCase().split('-')[0] ?? '';

            if (isLanguage(code)) {
                return code;
            }
        }
    } catch {
        return 'en';
    }

    return 'en';
}

/**
 * @function resolve
 * @description The language a choice comes down to.
 */
function resolve(choice: LanguageChoice): Language {
    return choice === 'automatic' ? browserLanguage() : choice;
}

/**
 * @var choice
 * @description What was picked in the account settings
 */
let choice: LanguageChoice = storedChoice();

/**
 * @var language
 * @description The language the page is in
 */
let language: Language = resolve(choice);

/**
 * @constant listeners
 * @description Who to tell when the language changes
 */
const listeners = new Set<() => void>();

/**
 * @function settle
 * @description Moves the page to the language its choice now resolves to, and tells the listeners when it changed.
 */
function settle(): void {
    const next = resolve(choice);

    if (next === language) {
        return;
    }

    language = next;
    applyToDocument();

    for (const listener of listeners) {
        listener();
    }
}

/**
 * @function applyToDocument
 * @description Tells the browser, and screen readers, which language the page is in.
 */
function applyToDocument(): void {
    if (typeof document !== 'undefined') {
        document.documentElement.lang = language;
    }
}

applyToDocument();

if (typeof window !== 'undefined') {
    window.addEventListener('languagechange', settle);
}

/**
 * @function currentLanguage
 * @description The language the page is in.
 */
export function currentLanguage(): Language {
    return language;
}

/**
 * @function languageChoice
 * @description What was picked in the account settings.
 */
export function languageChoice(): LanguageChoice {
    return choice;
}

/**
 * @function chooseLanguage
 * @description Picks the page's language, remembered on this browser.
 *
 * @param {LanguageChoice} next A language, or automatic to follow the browser.
 */
export function chooseLanguage(next: LanguageChoice): void {
    choice = next;

    settle();

    try {
        if (next === 'automatic') {
            localStorage.removeItem(CHOICE_KEY);
        } else {
            localStorage.setItem(CHOICE_KEY, next);
        }
    } catch {
        return;
    }
}

/**
 * @function subscribeLanguage
 * @description Registers a listener told when the page changes language.
 *
 * @returns {() => void} Unregisters it.
 */
export function subscribeLanguage(listener: () => void): () => void {
    listeners.add(listener);

    return () => {
        listeners.delete(listener);
    };
}

/**
 * @function isMessageKey
 * @description Whether a key names a sentence, for keys built from data such as a category's id.
 */
export function isMessageKey(key: string): key is MessageKey {
    return key in en;
}

/**
 * @function t
 * @description A sentence in the page's language, with its `{name}` slots filled in.
 *
 * @param {MessageKey} key The sentence.
 * @param {Record<string, string | number>} values What goes in its slots.
 *
 * @returns {string} The sentence.
 */
export function t(key: MessageKey, values?: Record<string, string | number>): string {
    const template = MESSAGES[language][key];

    if (values === undefined) {
        return template;
    }

    return template.replace(/\{(\w+)\}/g, (slot, name: string) => (name in values ? String(values[name]) : slot));
}
