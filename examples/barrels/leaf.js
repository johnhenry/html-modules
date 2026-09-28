// A JS leaf. HTML barrels re-export from it exactly as they do from HTML.
export const gamma = { from: 'leaf.js' };
export function hello(name = 'barrels') {
  return `hello, ${name}`;
}
export default { from: 'leaf.js', note: 'default (never re-exported by export *)' };
