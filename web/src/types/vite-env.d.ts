/// <reference types="vite/client" />

/**
 * @interface ImportMetaEnv
 * @description The variables a build can be given.
 */
interface ImportMetaEnv {
    readonly VITE_API_URL?: string; /*!< The portal API's origin; the page calls its own origin without it */
}

/**
 * @constant __APP_VERSION__
 * @description The web interface's version, read from package.json at build time.
 */
declare const __APP_VERSION__: string;
