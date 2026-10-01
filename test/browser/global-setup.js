// Runs once before the browser tests: bundle the pinned @johnhenry/safe-fragment commit (see scripts/vendor-safe-fragment.js).
import { vendorSafeFragment } from '../../scripts/vendor-safe-fragment.js';

export default async function globalSetup() {
  await vendorSafeFragment();
}
