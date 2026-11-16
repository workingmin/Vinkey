import { runAcceptanceCli } from '../lib/run-acceptance.mjs'

await runAcceptanceCli({
  label: '标题栏菜单平台验收',
  slug: 'title-bar-p-acceptance',
  entry: 'scripts/title-bar/title-bar-menu-p-acceptance.ts',
  env: { VINKEY_TITLE_BAR_P_ACCEPTANCE_CLI: '1' },
  rootEnv: 'VINKEY_TITLE_BAR_ACCEPTANCE_ROOT',
  ui: true,
})
