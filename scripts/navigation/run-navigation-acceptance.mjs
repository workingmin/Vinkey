import { runAcceptanceCli } from '../lib/run-acceptance.mjs'

await runAcceptanceCli({
  label: '项目/会话导航验收',
  slug: 'navigation-acceptance',
  entry: 'scripts/navigation/navigation-acceptance.ts',
  env: { VINKEY_NAVIGATION_ACCEPTANCE_CLI: '1' },
  rootEnv: 'VINKEY_NAVIGATION_ACCEPTANCE_ROOT',
})
