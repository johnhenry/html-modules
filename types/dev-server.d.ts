export declare const MIME: {
    '.html': string;
    '.htm': string;
    '.js': string;
    '.mjs': string;
    '.css': string;
    '.json': string;
    '.svg': string;
    '.png': string;
    '.jpg': string;
    '.jpeg': string;
    '.gif': string;
    '.webp': string;
    '.ico': string;
    '.woff2': string;
    '.woff': string;
    '.txt': string;
    '.map': string;
    '.wasm': string;
};
/** `html` with the client script added before `</body>` (or at the end). */
export declare function injectClient(html: any): string;
/**
 * @param {object} [options]
 * @param {string} [options.dir]     the directory to serve and watch (default: the current directory)
 * @param {number} [options.port]    (default 5173; 0 picks a free one)
 * @param {string} [options.host]    (default 127.0.0.1)
 * @param {boolean} [options.watch]  watch for changes (default true)
 * @param {(line: string) => void} [options.log]
 * @returns {Promise<{ server: import('node:http').Server, url: string, port: number, dir: string, clients: Set<object>, notify: (path: string, kind?: string) => void, close: () => Promise<void> }>}
 */
export declare function createDevServer({ dir, port, host, watch: watching, log }?: {
    dir?: string;
    port?: number;
    host?: string;
    watch?: boolean;
    log?: (line: string) => void;
}): Promise<{
    server: import('node:http').Server;
    url: string;
    port: number;
    dir: string;
    clients: Set<object>;
    notify: (path: string, kind?: string) => void;
    close: () => Promise<void>;
}>;
