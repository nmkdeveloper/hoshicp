use super::token::tokenize;
pub use super::{CheckVerdict, DiffSpan};

fn float_tokens_equal(act_str: &str, exp_str: &str, epsilon: f64) -> bool {
    let act_float = act_str.parse::<f64>();
    let exp_float = exp_str.parse::<f64>();

    match (act_float, exp_float) {
        (Ok(a), Ok(b)) => {
            if a.is_nan() || b.is_nan() {
                // NaN never compares equal in competitive programming verification
                false
            } else if a.is_infinite() || b.is_infinite() {
                a.is_infinite() && b.is_infinite() && a.is_sign_positive() == b.is_sign_positive()
            } else {
                // Supports scientific notation and negative zero (-0.0 vs 0.0)
                // Precision check: |a - b| <= max(1.0, |b|) * epsilon
                let diff = (a - b).abs();
                let tolerance = 1.0f64.max(b.abs()) * epsilon;
                diff <= tolerance
            }
        }
        _ => act_str == exp_str,
    }
}

/// Token stream checker with absolute & relative epsilon tolerance for floats.
pub fn check_floats(actual: &str, expected: &str, epsilon: f64) -> CheckVerdict {
    let (act_tokens, act_end_line, act_end_col) = tokenize(actual);
    let (exp_tokens, _, _) = tokenize(expected);

    let mut diff_positions = Vec::new();
    let min_len = act_tokens.len().min(exp_tokens.len());

    for i in 0..min_len {
        let act = act_tokens[i];
        let exp = exp_tokens[i];
        if !float_tokens_equal(act.text, exp.text, epsilon) {
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
        let message = if let (Ok(a), Ok(b)) =
            (first.actual.parse::<f64>(), first.expected.parse::<f64>())
        {
            let diff = (a - b).abs();
            let tolerance = 1.0f64.max(b.abs()) * epsilon;
            format!(
                "Float mismatch at line {}, col {}: expected '{}', got '{}' (|diff| = {:e}, tol = {:e})",
                first.line, first.col, first.expected, first.actual, diff, tolerance
            )
        } else if act_tokens.len() != exp_tokens.len()
            && diff_positions.len()
                == (act_tokens.len() as isize - exp_tokens.len() as isize).unsigned_abs()
            && (0..min_len)
                .all(|i| float_tokens_equal(act_tokens[i].text, exp_tokens[i].text, epsilon))
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
