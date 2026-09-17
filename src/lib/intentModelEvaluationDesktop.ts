import { listModelConnections, listModelProfiles, streamChat } from './desktop'
import {
  INTENT_CLASSIFICATION_EVALUATION_CASES,
  runConfiguredIntentModelEvaluation,
  type IntentClassificationEvaluationCase,
  type IntentModelEvaluationDependencies,
} from './intentModelEvaluation'

export const ACTIVE_MODEL_STORAGE_KEY = 'vinkey.activeModelId'

const desktopDependencies: IntentModelEvaluationDependencies = {
  listProfiles: listModelProfiles,
  listConnections: listModelConnections,
  stream: streamChat,
  getActiveProfileId: () => localStorage.getItem(ACTIVE_MODEL_STORAGE_KEY),
}

/** Run the versioned suite through the model profile selected by the installed desktop app. */
export function runDesktopIntentModelEvaluation(
  preferredProfileId?: string | null,
  cases: IntentClassificationEvaluationCase[] = INTENT_CLASSIFICATION_EVALUATION_CASES,
) {
  return runConfiguredIntentModelEvaluation(preferredProfileId, desktopDependencies, cases)
}
