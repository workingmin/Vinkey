import { runAcceptanceCli } from '../lib/run-acceptance.mjs'

await runAcceptanceCli({
  label: '基础编辑器验收',
  slug: 'editor-acceptance',
  entry: 'scripts/editor/editor-acceptance.ts',
  env: { VINKEY_EDITOR_ACCEPTANCE_CLI: '1' },
  rootEnv: 'VINKEY_EDITOR_ACCEPTANCE_ROOT',
})
