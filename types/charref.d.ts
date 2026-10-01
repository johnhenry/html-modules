/** The character a numeric reference to `code` stands for. */
export declare function numericReference(code: any): string;
/**
 * Decode the character references in `text`.
 * @param {string} text
 * @param {{ attribute?: boolean }} [options]  `attribute: true` for an attribute value (the default is element text)
 */
export declare function decodeCharacterReferences(text: string, { attribute }?: {
    attribute?: boolean;
}): string;
