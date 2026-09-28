// A side-effect-only module: importing it runs it; it exports nothing.
globalThis.__registrationSetupRuns = (globalThis.__registrationSetupRuns ?? 0) + 1;
document.documentElement.dataset.registrationSetup = 'ran';
