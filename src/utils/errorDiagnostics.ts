export interface ErrorDiagnosis {
  title: string;
  name: string;
  hexCode: string;
  summary: string;
  causes: string[];
}

/**
 * Maps program exit codes (Windows NTSTATUS & POSIX signals) to detailed,
 * actionable competitive programming diagnostics in the style of Code::Blocks.
 */
export function getExitCodeDiagnosis(exitCode: number | null | undefined): ErrorDiagnosis | null {
  if (exitCode === undefined || exitCode === null || exitCode === 0) {
    return null;
  }

  // Convert negative 32-bit integers to unsigned 32-bit hex
  const unsignedCode = exitCode < 0 ? (exitCode >>> 0) : exitCode;
  const hex = `0x${unsignedCode.toString(16).toUpperCase().padStart(8, '0')}`;

  switch (unsignedCode) {
    // 0xC0000005: Access Violation / Segmentation Fault
    case 0xc0000005:
      return {
        title: 'Segmentation Fault (Access Violation)',
        name: 'STATUS_ACCESS_VIOLATION',
        hexCode: hex,
        summary: 'Process crashed due to unauthorized memory access.',
        causes: [
          'Array index out of bounds (e.g. accessing a[N] or negative index a[-1])',
          'Dereferencing a NULL, dangling, or uninitialized pointer',
          'Excessive memory allocation causing memory address overflow',
          'Using std::vector or std::string with invalid index without bounds checking',
        ],
      };

    // 0xC00000FD: Stack Overflow
    case 0xc00000fd:
      return {
        title: 'Stack Overflow',
        name: 'STATUS_STACK_OVERFLOW',
        hexCode: hex,
        summary: 'The program exceeded the thread call stack limit.',
        causes: [
          'Infinite or excessively deep recursion without a proper base case',
          'Allocating massive arrays locally inside functions (e.g. int arr[1000000];) — move large arrays to global scope or use std::vector on the heap',
        ],
      };

    // 0xC0000094: Divide by Zero
    case 0xc0000094:
      return {
        title: 'Integer Division by Zero',
        name: 'STATUS_INTEGER_DIVIDE_BY_ZERO',
        hexCode: hex,
        summary: 'The program attempted to divide or modulo an integer by zero.',
        causes: [
          'Division by zero (e.g. x / 0)',
          'Modulo by zero (e.g. x % 0)',
          'Variable evaluated to 0 unexpectedly in denominator',
        ],
      };

    // 0xC0000409: Stack Buffer Overrun (Security Cookie / Fast Fail)
    case 0xc0000409:
      return {
        title: 'Stack Buffer Overrun',
        name: 'STATUS_STACK_BUFFER_OVERRUN',
        hexCode: hex,
        summary: 'A stack buffer overrun was detected, terminating the application.',
        causes: [
          'Writing past the end of a local buffer or array on the stack',
          'Corrupted return address on the stack from strcpy or buffer overflow',
        ],
      };

    // 0xC000001D: Illegal Instruction
    case 0xc000001d:
      return {
        title: 'Illegal Instruction',
        name: 'STATUS_ILLEGAL_INSTRUCTION',
        hexCode: hex,
        summary: 'The CPU attempted to execute an invalid or privileged instruction.',
        causes: [
          'Calling an uninitialized function pointer or jumping to arbitrary memory',
          'Corrupted binary or compiled with CPU instructions (e.g. AVX2) unsupported by target host',
        ],
      };

    // 0xC000013A: Ctrl+C Exit
    case 0xc000013a:
      return {
        title: 'Application Terminated by User',
        name: 'STATUS_CONTROL_C_EXIT',
        hexCode: hex,
        summary: 'The application was terminated as a result of a Ctrl+C or kill signal.',
        causes: ['User aborted execution or closed terminal.'],
      };

    default:
      break;
  }

  // POSIX signals (or exit status 128 + signal)
  const posixSignal = exitCode < 0 ? -exitCode : (exitCode > 128 && exitCode < 255 ? exitCode - 128 : exitCode);

  switch (posixSignal) {
    case 11: // SIGSEGV
      return {
        title: 'Segmentation Fault (SIGSEGV)',
        name: 'SIGSEGV',
        hexCode: `Signal 11 (Exit ${exitCode})`,
        summary: 'The program attempted to read or write an illegal memory address.',
        causes: [
          'Array index out of bounds',
          'Dereferencing NULL or invalid pointer',
          'Accessing deleted memory',
        ],
      };

    case 8: // SIGFPE
      return {
        title: 'Floating Point / Arithmetic Exception (SIGFPE)',
        name: 'SIGFPE',
        hexCode: `Signal 8 (Exit ${exitCode})`,
        summary: 'Erroneous arithmetic operation (integer division by zero or overflow).',
        causes: [
          'Division by zero (a / 0)',
          'Modulo by zero (a % 0)',
          'Overflow in signed integer operation',
        ],
      };

    case 6: // SIGABRT
      return {
        title: 'Process Aborted (SIGABRT)',
        name: 'SIGABRT',
        hexCode: `Signal 6 (Exit ${exitCode})`,
        summary: 'The program was aborted by an assertion failure or uncaught exception.',
        causes: [
          'Failed assert(...) condition in code',
          'Uncaught std::exception or throw statement',
          'std::terminate() called due to double exception or destructor failure',
        ],
      };

    case 9: // SIGKILL
      return {
        title: 'Killed by System (SIGKILL)',
        name: 'SIGKILL',
        hexCode: `Signal 9 (Exit ${exitCode})`,
        summary: 'The process was killed by the OS (often Out-Of-Memory killer).',
        causes: [
          'Exceeded operating system memory limit (MLE)',
          'Terminated forcefully by parent process',
        ],
      };

    default:
      return {
        title: `Abnormal Exit (Code ${exitCode})`,
        name: 'RUNTIME_ERROR',
        hexCode: `Exit code: ${exitCode} (${hex})`,
        summary: `Process terminated with non-zero exit code ${exitCode}.`,
        causes: [
          'Non-zero return from main() function',
          'Uncaught runtime exception',
          'Abnormal exit status from system library',
        ],
      };
  }
}
