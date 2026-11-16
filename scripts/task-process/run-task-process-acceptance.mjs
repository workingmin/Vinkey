import { runAcceptanceCli } from '../lib/run-acceptance.mjs'

await runAcceptanceCli({
  label: '长任务/日志中心验收',
  slug: 'task-process-acceptance',
  entry: 'scripts/task-process/task-process-acceptance.ts',
  env: { VINKEY_TASK_PROCESS_ACCEPTANCE_CLI: '1' },
  rootEnv: 'VINKEY_TASK_PROCESS_ACCEPTANCE_ROOT',
})
