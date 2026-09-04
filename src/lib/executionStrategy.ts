import type { AnalysisMode, SourcePolicy } from '../types'
import type { DocumentAccess, TaskIntent } from './intent'

export type CurrentExecutionMode = 'deterministic-service' | 'direct-model' | 'fixed-workflow'
export type TargetExecutionMode = CurrentExecutionMode | 'adaptive-agent' | 'hybrid-agent-workflow'
export type AgentUpgradePolicy = 'never' | 'optional' | 'recommended'
export type WorkflowId = 'structure-segmentation' | 'focused-analysis' | 'long-text-analysis' | null
export type RuntimeCapability =
  | 'model-streaming'
  | 'cancellation'
  | 'checkpointing'
  | 'evidence-validation'
  | 'planning'
  | 'tool-selection'
  | 'structured-output'
  | 'human-approval'

export interface ExecutionStrategy {
  currentMode: CurrentExecutionMode
  targetMode: TargetExecutionMode
  workflow: WorkflowId
  agentUpgrade: AgentUpgradePolicy
  requiredCapabilities: RuntimeCapability[]
}

interface ExecutionStrategyInput {
  intent: TaskIntent
  documentAccess: DocumentAccess
  analysisMode: AnalysisMode | null
  sourcePolicy: SourcePolicy
  requiresModel: boolean
}

const LONG_TEXT_CAPABILITIES: RuntimeCapability[] = [
  'model-streaming',
  'cancellation',
  'checkpointing',
  'evidence-validation',
]

export function resolveExecutionStrategy(input: ExecutionStrategyInput): ExecutionStrategy {
  if (input.intent === 'structure-segmentation') {
    return {
      currentMode: 'deterministic-service',
      targetMode: 'deterministic-service',
      workflow: 'structure-segmentation',
      agentUpgrade: 'never',
      requiredCapabilities: ['human-approval'],
    }
  }

  if (!input.requiresModel) {
    return {
      currentMode: 'deterministic-service',
      targetMode: 'deterministic-service',
      workflow: null,
      agentUpgrade: 'never',
      requiredCapabilities: [],
    }
  }

  if (input.analysisMode === 'focused') {
    return {
      currentMode: 'fixed-workflow',
      targetMode: 'fixed-workflow',
      workflow: 'focused-analysis',
      agentUpgrade: 'optional',
      requiredCapabilities: ['model-streaming', 'cancellation'],
    }
  }

  const readsDocumentBodies = input.documentAccess === 'selected' || input.documentAccess === 'workspace'
  if (input.sourcePolicy === 'local-chunks' && readsDocumentBodies) {
    const agentRecommended = input.intent === 'structure-enhancement'
      || input.intent === 'document-revision'
      || input.intent === 'character-analysis'
      || input.intent === 'continuity-review'
    return {
      currentMode: 'fixed-workflow',
      targetMode: 'hybrid-agent-workflow',
      workflow: 'long-text-analysis',
      agentUpgrade: agentRecommended ? 'recommended' : 'optional',
      requiredCapabilities: agentRecommended
        ? [...LONG_TEXT_CAPABILITIES, 'planning', 'tool-selection', 'structured-output']
        : [...LONG_TEXT_CAPABILITIES],
    }
  }

  return {
    currentMode: 'direct-model',
    targetMode: 'direct-model',
    workflow: null,
    agentUpgrade: 'never',
    requiredCapabilities: ['model-streaming', 'cancellation'],
  }
}

export function usesLongTextWorkflow(strategy: ExecutionStrategy): boolean {
  return strategy.currentMode === 'fixed-workflow' && strategy.workflow === 'long-text-analysis'
}
