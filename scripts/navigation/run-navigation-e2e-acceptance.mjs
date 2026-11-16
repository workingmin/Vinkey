import { runAcceptanceCli } from '../lib/run-acceptance.mjs'

await runAcceptanceCli({
  label: '导航端到端验收',
  slug: 'navigation-e2e',
  entry: 'scripts/navigation/navigation-e2e-acceptance.ts',
  env: { VINKEY_NAVIGATION_E2E_CLI: '1' },
  rootEnv: 'VINKEY_NAVIGATION_E2E_ROOT',
})
