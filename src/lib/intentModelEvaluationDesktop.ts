import { getActiveModelId, listModelConnections, listModelProfiles, streamChat } from './desktop'
import {
  INTENT_CLASSIFICATION_EVALUATION_CASES,
  runConfiguredIntentModelEvaluation,
  type IntentClassificationEvaluationCase,
  type IntentModelEvaluationDependencies,
} from './intentModelEvaluation'

const desktopDependencies: IntentModelEvaluationDependencies = {
  listProfiles: listModelProfiles,
  listConnections: listModelConnections,
  stream: streamChat,
  getActiveProfileId: getActiveModelId,
}

/** Run the versioned suite through the model profile selected by the installed desktop app. */
export function runDesktopIntentModelEvaluation(
  preferredProfileId?: string | null,
  cases: IntentClassificationEvaluationCase[] = INTENT_CLASSIFICATION_EVALUATION_CASES,
) {
  return runConfiguredIntentModelEvaluation(preferredProfileId, desktopDependencies, cases)
}
