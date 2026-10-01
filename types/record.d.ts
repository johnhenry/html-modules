export type BindingRecord = {
    export: string;
    element?: string;
    adopt?: boolean;
};
export type ImportRecord = {
    src: string;
    as?: string;
    delimiter?: string;
    type?: string;
    integrity?: string;
    conflict?: 'error' | 'reuse';
    load?: 'eager' | 'lazy';
    errors?: 'event' | 'throw';
    registry?: 'global' | 'scoped';
    bindings: BindingRecord[];
};
export type ExportRecord = {
    kind: 'component';
    name: string | null;
    default?: true;
    template: string;
    shadow: 'open' | 'closed';
    delegatesFocus: boolean;
    styles: string[];
    props?: Array<{
        name: string;
        type: 'string' | 'number' | 'boolean';
    }>;
    formAssociated?: true;
    formControl?: string;
    formRole?: 'submit' | 'reset';
} | {
    kind: 'stylesheet';
    name: string | null;
    default?: true;
    css: string;
} | {
    kind: 'data';
    name: string | null;
    default?: true;
    value: unknown;
} | {
    kind: 'reexport';
    src: string;
    type?: string;
    integrity?: string;
    name?: string | null;
    default?: true;
    import?: string;
};
export type ModuleRecord = {
    url: string;
    imports: ImportRecord[];
    exports: ExportRecord[];
    importSettings?: {
        delimiter?: string;
        base?: string;
        conflict?: string;
        load?: string;
        errors?: string;
        registry?: string;
    };
    moduleSettings?: {
        shadow?: 'open' | 'closed';
        delegatesFocus?: boolean;
    };
};
export type RawElement = {
    tag: string;
    order?: number;
    attrs: Record<string, string>;
    children: Array<{
        tag: string;
        attrs: Record<string, string>;
        html?: string;
        text?: string;
    }>;
};
/**
 * Why an `<html-binding>` is misplaced, or null when its parent is an `<html-import>`. `parent` is the nearest
 * enclosing element, `{ tag, attrs }`, or null (outside any element but the document's own).
 * Shared by the module record (both readers) and by `<html-binding>` in a page.
 */
export declare function bindingPlacementProblem(attrs: any, parent: any, where?: string): string;
/** Build a binding record from an <html-binding>'s attributes. */
export declare function bindingRecord(attrs: any, where?: string): {
    export: any;
    element: any;
    adopt: boolean;
};
/**
 * The error message for a lazy import that has no tag to wait for (so nothing would ever load it), or null.
 * Shared by modules (`recordFromRaw`), `<html-import>` and `HTMLModules.import()`.
 */
export declare function lazyImportProblem({ src, as, bindings }: {
    as: any;
    bindings?: any[];
    src: any;
}, where?: string): string;
/** Build an import record from a raw <html-import>. */
export declare function importRecord(raw: any, url?: string): {
    src: any;
    as: any;
    delimiter: any;
    type: any;
    integrity: any;
    conflict: any;
    load: any;
    errors: any;
    registry: any;
    bindings: any;
};
/**
 * The options a module's own import is bound with: its attributes, then the
 * module's <html-import-settings>. Only values that were written are returned;
 * the rest are the built-in defaults (a page's options never reach a module).
 * @param {ModuleRecord} record
 * @param {ImportRecord} i
 * @returns {{ delimiter?: string, conflict?: string, load?: string, errors?: string, registry?: string }}
 */
export declare function moduleImportOptions(record: ModuleRecord, i: ImportRecord): {
    delimiter?: string;
    conflict?: string;
    load?: string;
    errors?: string;
    registry?: string;
};
/**
 * Validate raw elements and build a module record.
 * @param {{ imports: RawElement[], exports: RawElement[], importSettings?: RawElement[], moduleSettings?: RawElement[],
 *   bindings?: Array<{ tag: 'html-binding', attrs: Record<string, string>, parent: { tag: string, attrs: Record<string, string> } | null }> }} raw
 *   (`bindings` is every <html-binding> in the document, with its parent, so a misplaced one is rejected)
 * @param {string} [url]
 * @returns {ModuleRecord}
 */
export declare function recordFromRaw({ imports, exports, importSettings: iset, moduleSettings: mset, bindings: stray }: {
    imports: RawElement[];
    exports: RawElement[];
    importSettings?: RawElement[];
    moduleSettings?: RawElement[];
    bindings?: Array<{
        tag: 'html-binding';
        attrs: Record<string, string>;
        parent: {
            tag: string;
            attrs: Record<string, string>;
        } | null;
    }>;
}, url?: string): ModuleRecord;
/**
 * Read a parsed HTML module (a Document, e.g. from DOMParser, or any parent node holding the parsed elements) into a record.
 * `<html-export>` and `<html-import>` inside templates are ignored, as they
 * are not part of the document.
 * @param {ParentNode} doc
 * @param {string} [url]
 * @returns {ModuleRecord}
 */
export declare function readHTMLModule(doc: ParentNode, url?: string): ModuleRecord;
