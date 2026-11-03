use hoshicp_lib::checker::float::check_floats;
use hoshicp_lib::checker::testlib::check_testlib;
use hoshicp_lib::checker::token::check_tokens;
use std::fs;
use std::path::Path;

#[test]
fn test_token_checker_ignores_extra_trailing_whitespace() {
    let actual = "42   \n100\n\n";
    let expected = "42\n100";
    let verdict = check_tokens(actual, expected);
    assert!(verdict.ok);
}

#[test]
fn test_token_checker_mismatch() {
    let actual = "42 101";
    let expected = "42 100";
    let verdict = check_tokens(actual, expected);
    assert!(!verdict.ok);
    assert_eq!(verdict.diff_positions.len(), 1);
    assert_eq!(verdict.diff_positions[0].actual, "101");
    assert_eq!(verdict.diff_positions[0].expected, "100");
}

#[test]
fn test_token_checker_token_count_mismatch() {
    let actual = "42";
    let expected = "42 100";
    let verdict = check_tokens(actual, expected);
    assert!(!verdict.ok);

    let actual2 = "42 100 200";
    let expected2 = "42 100";
    let verdict2 = check_tokens(actual2, expected2);
    assert!(!verdict2.ok);
}

#[test]
fn test_float_checker_with_epsilon() {
    let actual = "3.14159265";
    let expected = "3.14159260";
    let verdict = check_floats(actual, expected, 1e-6);
    assert!(verdict.ok);
    let strict_verdict = check_floats(actual, expected, 1e-8);
    assert!(!strict_verdict.ok);
}

#[test]
fn test_float_checker_scientific_and_zero_signs() {
    // Review Focus #2: exponential notation and -0.0 vs 0.0
    let actual = "1e-9 -0.0 2.5E+4";
    let expected = "0.000000001 0.0 25000.0";
    let verdict = check_floats(actual, expected, 1e-6);
    assert!(verdict.ok);
}

#[test]
fn test_float_checker_nan_and_infinity() {
    // Review Focus #2: NaN and Infinity
    let verdict_nan = check_floats("NaN", "3.14", 1e-6);
    assert!(!verdict_nan.ok);

    let verdict_nan_both = check_floats("NaN", "NaN", 1e-6);
    assert!(!verdict_nan_both.ok);

    let verdict_inf = check_floats("inf", "inf", 1e-6);
    assert!(verdict_inf.ok);

    let verdict_inf_diff = check_floats("-inf", "inf", 1e-6);
    assert!(!verdict_inf_diff.ok);

    let verdict_inf_num = check_floats("inf", "1000000000.0", 1e-6);
    assert!(!verdict_inf_num.ok);
}

#[test]
fn test_float_checker_relative_error_large_numbers() {
    // Formula: |a - b| <= max(1.0, |b|) * epsilon
    // For b = 1,000,000, max(1.0, |b|) * 1e-5 = 10.0
    // Diff 0.5 <= 10.0 -> OK
    let verdict = check_floats("1000000.5", "1000000.0", 1e-5);
    assert!(verdict.ok);

    // With 1e-7 tolerance: max(1.0, |b|) * 1e-7 = 0.1
    // Diff 0.5 <= 0.1 -> FAIL
    let strict = check_floats("1000000.5", "1000000.0", 1e-7);
    assert!(!strict.ok);
}

#[test]
fn test_float_checker_mixed_tokens() {
    let actual = "Case #1: 3.14159 YES";
    let expected = "Case #1: 3.14158 YES";
    let verdict = check_floats(actual, expected, 1e-4);
    assert!(verdict.ok);

    let verdict_wa = check_floats(actual, "Case #2: 3.14158 YES", 1e-4);
    assert!(!verdict_wa.ok);
}

#[test]
fn test_testlib_checker_exit_codes() {
    let temp_dir = tempfile::tempdir().unwrap();
    let in_file = temp_dir.path().join("in.txt");
    let out_file = temp_dir.path().join("out.txt");
    let ans_file = temp_dir.path().join("ans.txt");
    fs::write(&in_file, "1 2\n").unwrap();
    fs::write(&out_file, "3\n").unwrap();
    fs::write(&ans_file, "3\n").unwrap();

    // Script exiting 0 with ok msg
    let checker_ok = temp_dir.path().join("checker_ok.py");
    fs::write(
        &checker_ok,
        "import sys\nsys.stderr.write('ok 1 numbers\\n')\nsys.exit(0)\n",
    )
    .unwrap();
    let verdict = check_testlib(&checker_ok, &in_file, &out_file, &ans_file);
    assert!(verdict.ok);
    assert!(verdict.message.contains("ok 1 numbers"));

    // Script exiting 1 (WA)
    let checker_wa = temp_dir.path().join("checker_wa.py");
    fs::write(
        &checker_wa,
        "import sys\nsys.stderr.write('wrong answer 1st numbers differ\\n')\nsys.exit(1)\n",
    )
    .unwrap();
    let verdict = check_testlib(&checker_wa, &in_file, &out_file, &ans_file);
    assert!(!verdict.ok);
    assert!(verdict.message.contains("wrong answer 1st numbers differ"));

    // Script exiting 2 (PE)
    let checker_pe = temp_dir.path().join("checker_pe.py");
    fs::write(
        &checker_pe,
        "import sys\nsys.stderr.write('presentation error extra tokens\\n')\nsys.exit(2)\n",
    )
    .unwrap();
    let verdict = check_testlib(&checker_pe, &in_file, &out_file, &ans_file);
    assert!(!verdict.ok);
    assert!(verdict.message.contains("presentation error extra tokens"));

    // Script exiting 3 (FAIL)
    let checker_fail = temp_dir.path().join("checker_fail.py");
    fs::write(
        &checker_fail,
        "import sys\nsys.stderr.write('FAIL internal checker error\\n')\nsys.exit(3)\n",
    )
    .unwrap();
    let verdict = check_testlib(&checker_fail, &in_file, &out_file, &ans_file);
    assert!(!verdict.ok);
    assert!(verdict.message.contains("FAIL internal checker error"));
}

#[test]
fn test_testlib_checker_not_found() {
    let verdict = check_testlib(
        Path::new("non_existent_checker_xyz_123"),
        Path::new("in.txt"),
        Path::new("out.txt"),
        Path::new("ans.txt"),
    );
    assert!(!verdict.ok);
    assert!(verdict.message.contains("Failed to execute"));
}
