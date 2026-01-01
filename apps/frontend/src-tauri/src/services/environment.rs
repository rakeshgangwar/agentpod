const APP_NAME: &str = "agentpod";
const APP_NAME_DEV: &str = "agentpod-dev";

#[inline]
pub fn is_dev() -> bool {
    cfg!(debug_assertions) || std::env::var("TAURI_DEBUG").is_ok()
}

pub fn get_app_name() -> &'static str {
    if is_dev() {
        APP_NAME_DEV
    } else {
        APP_NAME
    }
}

pub fn get_service_name() -> &'static str {
    get_app_name()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_app_name_contains_agentpod() {
        let name = get_app_name();
        assert!(name.starts_with("agentpod"));
    }

    #[test]
    fn test_service_name_matches_app_name() {
        assert_eq!(get_app_name(), get_service_name());
    }

    #[test]
    #[cfg(debug_assertions)]
    fn test_is_dev_in_debug_build() {
        assert!(is_dev());
    }
}
