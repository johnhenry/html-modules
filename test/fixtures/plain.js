// A JS module without a manifest: only exports made with defineHTMLComponent()
// are components for a namespace import.
import { defineHTMLComponent } from '../../src/runtime.js';

export const VERSION = '1.0';
export class Loose extends HTMLElement {}
export const shoutBox = defineHTMLComponent({ name: 'shout-box', template: '<strong><slot></slot></strong>' });
export default defineHTMLComponent({ name: 'plain-default', template: '<em>default</em>' });
