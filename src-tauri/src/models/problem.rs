use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct ProblemMetadata {
    pub name: String,
    pub group: String,
    pub url: String,
    pub time_limit: u64,
    pub memory_limit: u64,
}
