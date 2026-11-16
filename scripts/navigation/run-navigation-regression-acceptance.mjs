import { runAcceptanceCli } from '../lib/run-acceptance.mjs'

await runAcceptanceCli({
  label: '导航回归验收',
  slug: 'navigation-regression',
  entry: 'scripts/navigation/navigation-regression-acceptance.ts',
  env: { VINKEY_NAVIGATION_REGRESSION_CLI: '1' },
  rootEnv: 'VINKEY_NAVIGATION_REGRESSION_ROOT',
})
