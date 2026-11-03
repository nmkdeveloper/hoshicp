use hoshicp_lib::formatter::{format_code, format_source_with_cli, FormatterError};

#[test]
fn test_formatter_missing_binary_returns_clear_error() {
    let res = format_source_with_cli("int main(){}", "non_existent_clang_format_bin", &[]);
    match res {
        Err(FormatterError::BinaryNotFound(bin)) => {
            assert_eq!(bin, "non_existent_clang_format_bin");
        }
        other => panic!("Expected BinaryNotFound error, got {:?}", other),
    }
}

#[test]
fn test_formatter_unsupported_language() {
    let res = format_code("some code", "brainfuck", None);
    match res {
        Err(FormatterError::UnsupportedLanguage(lang)) => {
            assert_eq!(lang, "brainfuck");
        }
        other => panic!("Expected UnsupportedLanguage, got {:?}", other),
    }
}

#[test]
fn test_formatter_rustfmt_formats_code() {
    let unformatted = "fn main(){println!(\"hello\");}";
    let res = format_code(unformatted, "rust", None);
    assert!(res.is_ok(), "Expected rustfmt to format code successfully");
    let formatted = res.unwrap();
    assert!(
        formatted.contains("fn main() {\n") || formatted.contains("fn main() {\r\n"),
        "Formatted output did not have expected newline format: {}",
        formatted
    );
    assert!(formatted.contains("    println!(\"hello\");"));
}

#[test]
fn test_formatter_rustfmt_syntax_error_returns_execution_failed() {
    let invalid_rust = "fn main() { let x = ; }";
    let res = format_code(invalid_rust, "rust", None);
    match res {
        Err(FormatterError::ExecutionFailed(msg)) => {
            assert!(
                msg.contains("expected expression") || msg.contains("error"),
                "Expected error message detailing syntax error, got: {}",
                msg
            );
        }
        other => panic!("Expected ExecutionFailed for syntax error, got {:?}", other),
    }
}

#[test]
fn test_formatter_python_fallback() {
    // If black and yapf are not installed, returns BinaryNotFound
    let res = format_code("x = 1+2", "python", None);
    assert!(res.is_err());
}
