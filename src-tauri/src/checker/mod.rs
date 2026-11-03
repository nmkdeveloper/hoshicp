pub mod float;
pub mod testlib;
pub mod token;

pub use float::check_floats;
pub use testlib::check_testlib;
pub use token::check_tokens;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DiffSpan {
    pub line: usize,
    pub col: usize,
    pub actual: String,
    pub expected: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CheckVerdict {
    pub ok: bool,
    pub message: String,
    pub diff_positions: Vec<DiffSpan>,
}

impl CheckVerdict {
    pub fn ok(message: impl Into<String>) -> Self {
        Self {
            ok: true,
            message: message.into(),
            diff_positions: Vec::new(),
        }
    }

    pub fn wa(message: impl Into<String>, diff_positions: Vec<DiffSpan>) -> Self {
        Self {
            ok: false,
            message: message.into(),
            diff_positions,
        }
    }
}
