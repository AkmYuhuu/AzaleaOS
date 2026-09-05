use serde::Serialize;
use std::fmt;

/// Typed error contract for AzaleaOS Full backend.
/// Frontend receives code + safe message; raw stack traces are diagnostics-only.
#[derive(Debug, Clone, Serialize)]
pub enum AzaleaError {
    ConfigReadFailed(String),
    ConfigWriteFailed(String),
    UnsupportedEdition(String),
    InvalidPath(String),
    AppNotFound(String),
    AppLaunchFailed(String),
    Internal(String),
    WorkspaceLimitExceeded(String),
    AppLimitExceeded(String),
    WorkspaceNotFound(String),
    AppTabNotFound(String),
    WorkspaceNameEmpty(String),
    WindowNotFound(String),
    WindowIntegrationUnsupported(String),
    OptimizationRejected(String),
    FilesystemAccessDenied(String),
    HotkeyRegistrationFailed(String),
}

impl fmt::Display for AzaleaError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::ConfigReadFailed(m) => write!(f, "ConfigReadFailed: {}", m),
            Self::ConfigWriteFailed(m) => write!(f, "ConfigWriteFailed: {}", m),
            Self::UnsupportedEdition(m) => write!(f, "UnsupportedEdition: {}", m),
            Self::InvalidPath(m) => write!(f, "InvalidPath: {}", m),
            Self::AppNotFound(m) => write!(f, "AppNotFound: {}", m),
            Self::AppLaunchFailed(m) => write!(f, "AppLaunchFailed: {}", m),
            Self::Internal(m) => write!(f, "Internal: {}", m),
            Self::WorkspaceLimitExceeded(m) => write!(f, "WorkspaceLimitExceeded: {}", m),
            Self::AppLimitExceeded(m) => write!(f, "AppLimitExceeded: {}", m),
            Self::WorkspaceNotFound(m) => write!(f, "WorkspaceNotFound: {}", m),
            Self::AppTabNotFound(m) => write!(f, "AppTabNotFound: {}", m),
            Self::WorkspaceNameEmpty(m) => write!(f, "WorkspaceNameEmpty: {}", m),
            Self::WindowNotFound(m) => write!(f, "WindowNotFound: {}", m),
            Self::WindowIntegrationUnsupported(m) => {
                write!(f, "WindowIntegrationUnsupported: {}", m)
            }
            Self::OptimizationRejected(m) => write!(f, "OptimizationRejected: {}", m),
            Self::FilesystemAccessDenied(m) => write!(f, "FilesystemAccessDenied: {}", m),
            Self::HotkeyRegistrationFailed(m) => write!(f, "HotkeyRegistrationFailed: {}", m),
        }
    }
}

impl std::error::Error for AzaleaError {}

impl From<std::io::Error> for AzaleaError {
    fn from(e: std::io::Error) -> Self {
        Self::Internal(e.to_string())
    }
}
