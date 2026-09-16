use serde_json::Value;

pub(crate) fn strip_thinking_sections(value: &str) -> Result<String, String> {
    let lower = value.to_ascii_lowercase();
    let mut output = String::with_capacity(value.len());
    let mut cursor = 0;
    loop {
        let Some(open_relative) = lower[cursor..].find("<think>") else {
            if lower[cursor..].contains("</think>") {
                return Err("模型输出包含未匹配的 </think> 语段".into());
            }
            output.push_str(&value[cursor..]);
            break;
        };
        let open = cursor + open_relative;
        if lower[cursor..open].contains("</think>") {
            return Err("模型输出包含未匹配的 </think> 语段".into());
        }
        output.push_str(&value[cursor..open]);
        let body_start = open + "<think>".len();
        let Some(close_relative) = lower[body_start..].find("</think>") else {
            return Err("模型输出包含未闭合的 <think> 语段".into());
        };
        if lower[body_start..body_start + close_relative].contains("<think>") {
            return Err("模型输出包含未闭合的 <think> 嵌套语段".into());
        }
        cursor = body_start + close_relative + "</think>".len();
    }
    Ok(output.trim().to_string())
}

fn parse_admission_response(content: Option<&str>) -> Result<Value, String> {
    let content = content
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "模型检查未通过：模型没有返回可用结果".to_string())?;
    let lower = content.to_ascii_lowercase();
    if lower.contains("<think") || lower.contains("</think") {
        return Err("模型检查未通过：响应包含 <think> 推理语段".into());
    }
    if content.contains("```") || content.contains("~~~") {
        return Err("模型检查未通过：结构化响应被 Markdown 代码块包裹".into());
    }
    let value = serde_json::from_str::<Value>(content)
        .map_err(|_| "模型检查未通过：响应不是纯 JSON 结构".to_string())?;
    if value.as_object().map(|object| object.len()) != Some(2)
        || value.get("status").and_then(Value::as_str) != Some("ready")
        || value.get("structured").and_then(Value::as_bool) != Some(true)
    {
        return Err("模型检查未通过：响应字段不符合结构化输出合同".into());
    }
    Ok(value)
}

pub(crate) fn validate_admission_payload(payload: &Value, provider: &str) -> Result<(), String> {
    let (content, finish_reason) = if provider == "ollama" {
        (
            payload.pointer("/message/content"),
            payload.get("done_reason"),
        )
    } else {
        (
            payload.pointer("/choices/0/message/content"),
            payload.pointer("/choices/0/finish_reason"),
        )
    };
    if finish_reason.and_then(Value::as_str) == Some("length") {
        return Err("模型检查未通过：结构化响应被输出长度限制截断".into());
    }
    parse_admission_response(content.and_then(Value::as_str)).map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn removes_reasoning_but_preserves_the_final_answer() {
        let raw = "<think>思考中的错误引用 [source: bad]</think>\n最终答案 [source: chapter.md lines=1-1 quote=\"正文\"]";
        assert_eq!(
            strip_thinking_sections(raw).unwrap(),
            "最终答案 [source: chapter.md lines=1-1 quote=\"正文\"]"
        );
        assert_eq!(
            strip_thinking_sections("<THINK>中文</THINK>答案<think>继续思考</think>").unwrap(),
            "答案"
        );
        assert_eq!(strip_thinking_sections("  普通答案  ").unwrap(), "普通答案");
        assert_eq!(
            strip_thinking_sections("<think>只有思考</think>").unwrap(),
            ""
        );
    }

    #[test]
    fn rejects_incomplete_or_nested_reasoning() {
        for raw in [
            "<think>未结束",
            "答案</think>",
            "</think><think>思考</think>答案",
            "<think><think>嵌套</think></think>",
        ] {
            assert!(strip_thinking_sections(raw).is_err(), "{raw}");
        }
    }

    #[test]
    fn requires_plain_json_without_reasoning_or_markdown() {
        assert!(
            parse_admission_response(Some("{\"status\":\"ready\",\"structured\":true}")).is_ok()
        );
        for (raw, reason) in [
            (
                "<think>思考</think>{\"status\":\"ready\",\"structured\":true}",
                "<think>",
            ),
            ("<think>未闭合", "<think>"),
            ("```json\n{}\n```", "Markdown"),
            ("~~~json\n{}\n~~~", "Markdown"),
            (
                "结果：{\"status\":\"ready\",\"structured\":true}",
                "纯 JSON",
            ),
            (
                "{\"status\":\"ready\",\"structured\":true} trailing",
                "纯 JSON",
            ),
            (
                "{\"status\":\"ready\",\"structured\":true,\"extra\":1}",
                "字段",
            ),
            ("{\"status\":\"ready\",\"structured\":\"true\"}", "字段"),
        ] {
            assert!(
                parse_admission_response(Some(raw))
                    .unwrap_err()
                    .contains(reason),
                "{raw}"
            );
        }
        assert!(parse_admission_response(None).is_err());
    }

    #[test]
    fn checks_both_provider_payloads_and_rejects_truncation() {
        let content = "{\"status\":\"ready\",\"structured\":true}";
        let mut ollama = json!({"message": {"content": content}, "done_reason": "stop"});
        let mut compatible =
            json!({"choices": [{"message": {"content": content}, "finish_reason": "stop"}]});
        assert!(validate_admission_payload(&ollama, "ollama").is_ok());
        assert!(validate_admission_payload(&compatible, "openai-compatible").is_ok());
        ollama["done_reason"] = json!("length");
        compatible["choices"][0]["finish_reason"] = json!("length");
        assert!(validate_admission_payload(&ollama, "ollama")
            .unwrap_err()
            .contains("截断"));
        assert!(validate_admission_payload(&compatible, "openai-compatible")
            .unwrap_err()
            .contains("截断"));
    }
}
