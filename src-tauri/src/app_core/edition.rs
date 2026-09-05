use serde::{Deserialize, Serialize};
use std::fmt;

/// Edition authority for AzaleaOS Full.
/// No runtime switch - compile-time identity is always Full.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Edition {
    Full,
}

impl Edition {
    /// Returns the current edition. Hardcoded to Full - no runtime switch.
    pub fn current() -> Self {
        Self::Full
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Full => "full",
        }
    }
}

impl fmt::Display for Edition {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl Default for Edition {
    fn default() -> Self {
        Self::Full
    }
}
