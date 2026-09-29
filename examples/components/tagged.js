// A JS module with no manifest: a namespace import registers only the exports
// made with defineHTMLComponent(). The plain class and the constant are ignored.
import { defineHTMLComponent } from '../../src/runtime.js';

export const LIMIT = 3;
export class Untagged extends HTMLElement {}
export const shoutBox = defineHTMLComponent({
  name: 'shout-box',
  template: '<strong part="text" style="text-transform: uppercase; letter-spacing: .04em"><slot></slot></strong>',
});
