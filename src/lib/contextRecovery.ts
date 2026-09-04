/**
 * Detect model answers that explicitly indicate missing source context.
 * Keep this narrow so normal refusals or uncertainty do not trigger a retry.
 */
export function isContextRecoveryResponse(value: string): boolean {
  const response = value.trim()
  if (!response) return false
  return /(?:无法|不能|没(?:有|足够)|缺少|需要提供|请提供)[^。！？\n]{0,80}(?:上下文|原文|正文|文本|文档|小说|作品|角色|人物)|(?:关于|针对)[^。！？\n]{0,40}(?:文学作品|小说|角色|人物)[^。！？\n]{0,40}(?:无法|不能)(?:提供|回答|判断)|(?:无法|不能)(?:提供|回答)[^。！？\n]{0,40}(?:特定文学作品|小说|角色|人物)/u.test(response)
}
