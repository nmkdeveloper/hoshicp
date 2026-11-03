pub use super::{CheckVerdict, DiffSpan};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct Token<'a> {
    pub(crate) text: &'a str,
    pub(crate) line: usize,
    pub(crate) col: usize,
}

pub(crate) fn tokenize(input: &str) -> (Vec<Token<'_>>, usize, usize) {
    let mut tokens = Vec::new();
    let mut current_start = None;
    let mut line = 1;
    let mut col = 1;
    let mut token_line = 1;
    let mut token_col = 1;

    for (byte_idx, ch) in input.char_indices() {
        if ch.is_whitespace() {
            if let Some(start) = current_start.take() {
                tokens.push(Token {
                    text: &input[start..byte_idx],
                    line: token_line,
                    col: token_col,
                });
            }
            if ch == '\n' {
                line += 1;
                col = 1;
            } else if ch != '\r' {
                col += 1;
            }
        } else {
            if current_start.is_none() {
                current_start = Some(byte_idx);
                token_line = line;
                token_col = col;
            }
            col += 1;
        }
    }

    if let Some(start) = current_start {
        tokens.push(Token {
            text: &input[start..],
            line: token_line,
            col: token_col,
        });
    }

    (tokens, line, col)
}

/// Whitespace-agnostic token stream checker.
pub fn check_tokens(actual: &str, expected: &str) -> CheckVerdict {
    let (act_tokens, act_end_line, act_end_col) = tokenize(actual);
    let (exp_tokens, _, _) = tokenize(expected);

    let mut diff_positions = Vec::new();
    let min_len = act_tokens.len().min(exp_tokens.len());

    for i in 0..min_len {
        let act = act_tokens[i];
        let exp = exp_tokens[i];
        if act.text != exp.text {
            diff_positions.push(DiffSpan {
                line: act.line,
                col: act.col,
                actual: act.text.to_string(),
                expected: exp.text.to_string(),
            });
        }
    }

    if act_tokens.len() < exp_tokens.len() {
        for exp in &exp_tokens[act_tokens.len()..] {
            diff_positions.push(DiffSpan {
                line: act_end_line,
                col: act_end_col,
                actual: "<EOF>".to_string(),
                expected: exp.text.to_string(),
            });
        }
    } else if act_tokens.len() > exp_tokens.len() {
        for act in &act_tokens[exp_tokens.len()..] {
            diff_positions.push(DiffSpan {
                line: act.line,
                col: act.col,
                actual: act.text.to_string(),
                expected: "<EOF>".to_string(),
            });
        }
    }

    if diff_positions.is_empty() {
        CheckVerdict::ok("OK")
    } else {
        let first = &diff_positions[0];
        let message = if act_tokens.len() != exp_tokens.len()
            && diff_positions.len()
                == (act_tokens.len() as isize - exp_tokens.len() as isize).unsigned_abs()
            && (0..min_len).all(|i| act_tokens[i].text == exp_tokens[i].text)
        {
            if act_tokens.len() < exp_tokens.len() {
                format!(
                    "Premature EOF: expected {} tokens, got {}",
                    exp_tokens.len(),
                    act_tokens.len()
                )
            } else {
                format!(
                    "Extra tokens found: expected {} tokens, got {}",
                    exp_tokens.len(),
                    act_tokens.len()
                )
            }
        } else {
            format!(
                "Token mismatch at line {}, col {}: expected '{}', got '{}'",
                first.line, first.col, first.expected, first.actual
            )
        };
        CheckVerdict::wa(message, diff_positions)
    }
}
