import { runAcceptanceCli } from '../lib/run-acceptance.mjs'

await runAcceptanceCli({
  label: '模型设置验收',
  slug: 'model-acceptance',
  entry: 'scripts/model/model-acceptance.ts',
  env: { VINKEY_MODEL_ACCEPTANCE_CLI: '1' },
  rootEnv: 'VINKEY_MODEL_ACCEPTANCE_ROOT',
})
