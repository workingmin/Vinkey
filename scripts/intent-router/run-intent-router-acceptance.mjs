import { runAcceptanceCli } from '../lib/run-acceptance.mjs'

await runAcceptanceCli({
  label: 'IntentRouter 验收',
  slug: 'intent-router-acceptance',
  entry: 'scripts/intent-router/intent-router-acceptance.ts',
  env: { VINKEY_INTENT_MODEL_EVAL_CLI: '1' },
})
