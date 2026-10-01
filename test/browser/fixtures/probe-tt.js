import { createHTMLModules } from '/src/index.js';

const modules = createHTMLModules();
try {
  await modules.load('./strict-mod.html');
  window.__result = 'ok';
} catch (error) {
  window.__result = `${error.name}: ${error.message}`;
}
window.__done = true;
