/**
 * Configure a window's security settings (only the keys given are changed).
 * @param {any} win
 * @param {{ trustedTypes?: { createHTML(html: string): unknown } | false, nonce?: string }} options
 */
export declare function configureWindow(win: any, { trustedTypes, nonce }?: {
    trustedTypes?: {
        createHTML(html: string): unknown;
    } | false;
    nonce?: string;
}): void;
/** `html` wrapped for an HTML sink in `win`: through the configured policy, else the "html-modules" one, else as is. */
export declare function trustedHTML(html: any, win?: typeof globalThis): any;
/** The CSP nonce configured for `win`, or undefined. */
export declare const nonceFor: (win?: typeof globalThis) => any;
