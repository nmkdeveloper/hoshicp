pub mod problem;
pub mod testcase;

pub use problem::ProblemMetadata;
pub use testcase::TestCase;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct SidecarData {
    pub problem: ProblemMetadata,
    pub testcases: Vec<TestCase>,
}
