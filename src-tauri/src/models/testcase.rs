use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct TestCase {
    pub id: String,
    pub input: String,
    pub output: String,
    pub custom: bool,
}
