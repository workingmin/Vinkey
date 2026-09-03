use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const CHUNK_ALGORITHM_VERSION: &str = "chunk-v1";

pub fn source_fingerprint(text: &str) -> String {
    let digest = Sha256::digest(text.as_bytes());
    hex_digest(&digest)
}

pub fn cache_key(source_id: &str, text: &str, max_tokens: usize, overlap_tokens: usize) -> String {
    let mut hasher = Sha256::new();
    hasher.update(CHUNK_ALGORITHM_VERSION.as_bytes());
    hasher.update([0]);
    hasher.update(source_id.as_bytes());
    hasher.update([0]);
    hasher.update(source_fingerprint(text).as_bytes());
    hasher.update([0]);
    hasher.update(max_tokens.to_string().as_bytes());
    hasher.update([0]);
    hasher.update(overlap_tokens.to_string().as_bytes());
    hex_digest(&hasher.finalize())
}

fn hex_digest(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

/// Conservative token estimate used when the provider tokenizer is unavailable.
/// CJK characters are treated as one token; other text uses a four-character
/// approximation. The model-specific budget layer can replace this later.
pub fn estimate_tokens(value: &str) -> usize {
    let mut cjk = 0usize;
    let mut other = 0usize;
    for character in value.chars() {
        if is_cjk(character) {
            cjk += 1;
        } else {
            other += 1;
        }
    }
    cjk + other.div_ceil(4)
}

fn is_cjk(character: char) -> bool {
    matches!(
        character as u32,
        0x3400..=0x4dbf
            | 0x4e00..=0x9fff
            | 0xf900..=0xfaff
            | 0x3040..=0x30ff
            | 0xac00..=0xd7af
    )
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextChunk {
    pub id: String,
    pub source_id: String,
    pub text: String,
    pub start_char: usize,
    pub end_char: usize,
    pub line_start: usize,
    pub line_end: usize,
    pub heading: Option<String>,
    pub estimated_tokens: usize,
    pub split_reason: String,
    pub overlap_from_previous: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChunkManifest {
    pub source_id: String,
    pub source_fingerprint: String,
    pub algorithm_version: String,
    pub cache_key: String,
    pub source_tokens: usize,
    pub max_tokens: usize,
    pub overlap_tokens: usize,
    pub chunks: Vec<TextChunk>,
}

#[derive(Debug, Clone, Copy)]
struct Span {
    start: usize,
    end: usize,
}

#[derive(Debug, Clone)]
struct Unit {
    span: Span,
    heading: Option<String>,
    hard_split: bool,
    tokens: usize,
}

fn line_spans(text: &str) -> Vec<Span> {
    let mut spans = Vec::new();
    let mut start = 0;
    for (index, character) in text.char_indices() {
        if character == '\n' {
            spans.push(Span { start, end: index });
            start = index + character.len_utf8();
        }
    }
    if start < text.len() {
        spans.push(Span {
            start,
            end: text.len(),
        });
    }
    spans
}

fn heading_text(line: &str) -> Option<String> {
    let trimmed = line.trim();
    if trimmed.starts_with('#')
        && trimmed
            .chars()
            .nth(1)
            .map(|value| value.is_whitespace())
            .unwrap_or(false)
    {
        return Some(trimmed.trim_start_matches('#').trim().to_string());
    }
    if trimmed.starts_with('第') && trimmed.contains('章') {
        return Some(trimmed.to_string());
    }
    None
}

fn sentence_spans(text: &str, span: Span) -> Vec<Span> {
    let slice = &text[span.start..span.end];
    let mut result = Vec::new();
    let mut start = span.start;
    for (relative, character) in slice.char_indices() {
        if matches!(
            character,
            '。' | '！' | '？' | '!' | '?' | ';' | '；' | '\n'
        ) {
            let end = span.start + relative + character.len_utf8();
            if start < end {
                result.push(Span { start, end });
            }
            start = end;
        }
    }
    if start < span.end {
        result.push(Span {
            start,
            end: span.end,
        });
    }
    result
}

fn hard_split(text: &str, span: Span, max_tokens: usize, heading: Option<String>) -> Vec<Unit> {
    let slice = &text[span.start..span.end];
    let mut units = Vec::new();
    let mut start = span.start;
    let mut last = start;
    for (relative, character) in slice.char_indices() {
        let end = span.start + relative + character.len_utf8();
        if estimate_tokens(&text[start..end]) > max_tokens && start < last {
            units.push(Unit {
                span: Span { start, end: last },
                heading: heading.clone(),
                hard_split: true,
                tokens: estimate_tokens(&text[start..last]),
            });
            start = last;
        }
        last = end;
    }
    if start < span.end {
        units.push(Unit {
            span: Span {
                start,
                end: span.end,
            },
            heading,
            hard_split: true,
            tokens: estimate_tokens(&text[start..span.end]),
        });
    }
    units
}

fn split_span(text: &str, span: Span, heading: Option<String>, max_tokens: usize) -> Vec<Unit> {
    if estimate_tokens(&text[span.start..span.end]) <= max_tokens {
        return vec![Unit {
            span,
            heading,
            hard_split: false,
            tokens: estimate_tokens(&text[span.start..span.end]),
        }];
    }
    let sentences = sentence_spans(text, span);
    if sentences.len() <= 1 {
        return hard_split(text, span, max_tokens, heading);
    }
    let mut units = Vec::new();
    for sentence in sentences {
        if estimate_tokens(&text[sentence.start..sentence.end]) > max_tokens {
            units.extend(hard_split(text, sentence, max_tokens, heading.clone()));
        } else {
            units.push(Unit {
                span: sentence,
                heading: heading.clone(),
                hard_split: false,
                tokens: estimate_tokens(&text[sentence.start..sentence.end]),
            });
        }
    }
    units
}

fn document_units(text: &str, max_tokens: usize) -> Vec<Unit> {
    let lines = line_spans(text);
    let mut units = Vec::new();
    let mut paragraph: Option<Span> = None;
    let mut heading: Option<String> = None;
    let flush = |units: &mut Vec<Unit>, paragraph: &mut Option<Span>, heading: &Option<String>| {
        if let Some(span) = paragraph.take() {
            units.extend(split_span(text, span, heading.clone(), max_tokens));
        }
    };

    for line in lines {
        let value = &text[line.start..line.end];
        if value.trim().is_empty() {
            flush(&mut units, &mut paragraph, &heading);
            continue;
        }
        if let Some(found_heading) = heading_text(value) {
            flush(&mut units, &mut paragraph, &heading);
            heading = Some(found_heading);
            units.extend(split_span(text, line, heading.clone(), max_tokens));
            continue;
        }
        paragraph = Some(match paragraph {
            Some(existing) => Span {
                start: existing.start,
                end: line.end,
            },
            None => line,
        });
    }
    flush(&mut units, &mut paragraph, &heading);
    units
}

fn line_number(text: &str, byte_offset: usize) -> usize {
    text[..byte_offset.min(text.len())]
        .bytes()
        .filter(|value| *value == b'\n')
        .count()
        + 1
}

pub fn chunk_text(
    source_id: impl Into<String>,
    text: &str,
    max_tokens: usize,
    overlap_tokens: usize,
) -> Result<ChunkManifest, String> {
    if max_tokens == 0 {
        return Err("max_tokens 必须大于 0".into());
    }
    if overlap_tokens >= max_tokens {
        return Err("overlap_tokens 必须小于 max_tokens".into());
    }
    let source_id = source_id.into();
    let units = document_units(text, max_tokens);
    let mut chunks = Vec::new();
    let mut start = 0;
    while start < units.len() {
        let mut end = start;
        while end < units.len() {
            let candidate = Span {
                start: units[start].span.start,
                end: units[end].span.end,
            };
            let candidate_tokens = estimate_tokens(&text[candidate.start..candidate.end]);
            if end > start && candidate_tokens > max_tokens {
                break;
            }
            end += 1;
        }
        if end == start {
            end += 1;
        }
        let span = Span {
            start: units[start].span.start,
            end: units[end - 1].span.end,
        };
        let chunk_text = text[span.start..span.end].to_string();
        let actual_tokens = estimate_tokens(&chunk_text);
        chunks.push(TextChunk {
            id: format!("{}:chunk-{}", source_id, chunks.len()),
            source_id: source_id.clone(),
            text: chunk_text,
            start_char: text[..span.start].chars().count(),
            end_char: text[..span.end].chars().count(),
            line_start: line_number(text, span.start),
            line_end: line_number(text, span.end),
            heading: units[start].heading.clone(),
            estimated_tokens: actual_tokens,
            split_reason: if end == units.len() {
                "eof".into()
            } else if units[end - 1].hard_split {
                "hard-split".into()
            } else {
                "token-budget".into()
            },
            overlap_from_previous: start > 0,
        });

        let mut next_start = end;
        let mut overlap = 0;
        while next_start > start && overlap < overlap_tokens {
            next_start -= 1;
            overlap += units[next_start].tokens;
        }
        start = if next_start == start { end } else { next_start };
    }

    Ok(ChunkManifest {
        cache_key: cache_key(&source_id, text, max_tokens, overlap_tokens),
        source_fingerprint: source_fingerprint(text),
        algorithm_version: CHUNK_ALGORITHM_VERSION.into(),
        source_id,
        source_tokens: estimate_tokens(text),
        max_tokens,
        overlap_tokens,
        chunks,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preserves_headings_and_source_locations() {
        let manifest = chunk_text(
            "book.txt",
            "# 第一章\n\n林晚走进雾里。她看见旧钟楼。\n\n## 线索\n\n信封没有邮戳。",
            8,
            0,
        )
        .unwrap();
        assert!(manifest.chunks.len() >= 2);
        assert_eq!(manifest.chunks[0].heading.as_deref(), Some("第一章"));
        assert_eq!(manifest.chunks[0].line_start, 1);
        assert!(manifest.chunks.iter().all(|chunk| !chunk.text.is_empty()));
        assert!(manifest
            .chunks
            .iter()
            .all(|chunk| chunk.estimated_tokens <= manifest.max_tokens));
    }

    #[test]
    fn uses_sentence_and_hard_split_fallbacks() {
        let manifest = chunk_text("doc", "甲乙丙丁戊己庚辛壬癸。另一句。", 4, 0).unwrap();
        assert!(manifest.chunks.len() >= 2);
        assert!(manifest.chunks.iter().any(
            |chunk| chunk.split_reason == "hard-split" || chunk.split_reason == "token-budget"
        ));
    }

    #[test]
    fn overlap_repeats_previous_units_without_stalling() {
        let manifest =
            chunk_text("doc", "第一段内容。\n\n第二段内容。\n\n第三段内容。", 5, 2).unwrap();
        assert!(manifest.chunks.len() >= 2);
        assert!(manifest
            .chunks
            .iter()
            .skip(1)
            .all(|chunk| chunk.overlap_from_previous));
        for pair in manifest.chunks.windows(2) {
            assert!(
                pair[1].start_char < pair[0].end_char || pair[1].start_char == pair[0].end_char
            );
        }
    }

    #[test]
    fn rejects_invalid_budget() {
        assert!(chunk_text("doc", "text", 0, 0).is_err());
        assert!(chunk_text("doc", "text", 4, 4).is_err());
    }

    #[test]
    fn handles_multibyte_text_at_chunk_end() {
        let manifest = chunk_text("doc", "中文内容\nemoji 😀", 16, 0).unwrap();

        assert_eq!(manifest.chunks.len(), 1);
        assert_eq!(manifest.chunks[0].line_start, 1);
        assert_eq!(manifest.chunks[0].line_end, 2);
    }

    #[test]
    fn records_reusable_cache_identity() {
        let manifest = chunk_text("doc.md", "第一章\n内容。", 32, 4).unwrap();

        assert_eq!(manifest.algorithm_version, CHUNK_ALGORITHM_VERSION);
        assert_eq!(
            manifest.source_fingerprint,
            source_fingerprint("第一章\n内容。")
        );
        assert_eq!(
            manifest.cache_key,
            cache_key("doc.md", "第一章\n内容。", 32, 4)
        );
        assert_ne!(
            manifest.cache_key,
            cache_key("doc.md", "第一章\n内容。", 64, 4)
        );
    }
}
