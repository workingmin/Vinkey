import { runAcceptanceCli } from '../lib/run-acceptance.mjs'

await runAcceptanceCli({
  label: '标题栏菜单验收',
  slug: 'title-bar-acceptance',
  entry: 'scripts/title-bar/title-bar-acceptance.ts',
  env: { VINKEY_TITLE_BAR_ACCEPTANCE_CLI: '1' },
  rootEnv: 'VINKEY_TITLE_BAR_ACCEPTANCE_ROOT',
  ui: true,
})
