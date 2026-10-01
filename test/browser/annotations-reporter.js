// Prints each test's annotations (what an engine does or does not support) after the run, so CI logs and the README can
// say per engine what was unsupported rather than only "passed".
export default class AnnotationsReporter {
  #rows = [];

  onTestEnd(test, result) {
    for (const a of test.annotations) {
      if (['trusted-types', 'scoped-registries', 'state-restore', 'fallback', 'sanitizer-engine'].includes(a.type)) {
        this.#rows.push(`${test.parent.project()?.name ?? '?'}: ${a.type} = ${a.description} (${result.status})`);
      }
    }
  }

  onEnd() {
    if (this.#rows.length) console.log(`\nEngine notes:\n  ${[...new Set(this.#rows)].sort().join('\n  ')}`);
  }

  printsToStdio() {
    return false;
  }
}
