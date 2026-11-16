import { runAcceptanceCli } from '../lib/run-acceptance.mjs'

await runAcceptanceCli({
  label: '对话验收',
  slug: 'chat-acceptance',
  entry: 'scripts/chat/chat-acceptance.ts',
  env: { VINKEY_CHAT_ACCEPTANCE_CLI: '1' },
  rootEnv: 'VINKEY_CHAT_ACCEPTANCE_ROOT',
})
