/**
 * Judge Service — Piston Public API
 *
 * Replaces Judge0 with Piston (https://piston-meta.engineering.cdl.dev)
 * - Zero setup: public hosted endpoint, no API key, no Docker
 * - Supports C, C++, Java, Python (and 50+ other languages)
 * - Batch execution: we send all test cases in parallel Promise.all()
 *
 * Architecture fixes preserved:
 *   1. Batch/parallel execution (fixes O(N × timeout) → O(timeout))
 *   2. Language map hardcoded server-side (never trust client)
 *   3. Separated from DB transactions (called in Phase 2, outside any locks)
 */

const axios = require('axios');
const config = require('../config');

const PISTON_URL = config.piston.url;

// ─── Hardcoded language map for Piston ────────────────────
// Piston uses language name + version, not numeric IDs
const LANGUAGE_MAP = {
  c:      { pistonLang: 'c',      version: '10.2.0', label: 'C (GCC 10.2.0)' },
  cpp:    { pistonLang: 'c++',    version: '10.2.0', label: 'C++ (GCC 10.2.0)' },
  java:   { pistonLang: 'java',   version: '15.0.2', label: 'Java (OpenJDK 15.0.2)' },
  python: { pistonLang: 'python', version: '3.10.0', label: 'Python (3.10.0)' },
};

const pistonClient = axios.create({
  baseURL: PISTON_URL,
  timeout: 30000, // 30s hard timeout
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Validates language string and returns the Piston config.
 * @param {string} language - One of: c, cpp, java, python
 * @returns {Object} { pistonLang, version, label }
 * @throws {Error} If language is unsupported
 */
function resolveLanguage(language) {
  const lang = LANGUAGE_MAP[language?.toLowerCase()];
  if (!lang) {
    const supported = Object.keys(LANGUAGE_MAP).join(', ');
    throw Object.assign(
      new Error(`Unsupported language: "${language}". Supported: ${supported}`),
      { statusCode: 400 }
    );
  }
  return lang;
}

/**
 * Returns the list of supported language keys.
 * @returns {Array<{key: string, label: string}>}
 */
function getSupportedLanguages() {
  return Object.entries(LANGUAGE_MAP).map(([key, val]) => ({
    key,
    label: val.label,
  }));
}

/**
 * Executes code against a single test case via Piston.
 *
 * @param {string} code - Source code
 * @param {Object} lang - Resolved language config
 * @param {string} stdin - Test case input
 * @param {number} timeoutMs - Time limit in ms
 * @param {number} memoryLimitMb - Memory limit (Piston doesn't enforce this, but we log it)
 * @returns {Object} { stdout, stderr, exitCode, runtimeMs }
 */
async function executeOne(code, lang, stdin, timeoutMs, memoryLimitMb) {
  const response = await pistonClient.post('/execute', {
    language: lang.pistonLang,
    version: lang.version,
    files: [{ content: code }],
    stdin: stdin || '',
    compile_timeout: 10000,        // 10s compile timeout
    run_timeout: timeoutMs,        // per-test-case runtime limit
    compile_memory_limit: memoryLimitMb * 1024 * 1024,  // bytes
    run_memory_limit: memoryLimitMb * 1024 * 1024,
  });

  const result = response.data;
  const run = result.run || {};
  const compile = result.compile || {};

  // Compile error
  if (compile.code !== 0 && compile.code != null && compile.stderr) {
    return {
      stdout: '',
      stderr: compile.stderr,
      exitCode: compile.code,
      runtimeMs: 0,
      verdict: 'compile_error',
      compileOutput: compile.stderr,
    };
  }

  return {
    stdout: (run.stdout || '').trimEnd(),
    stderr: run.stderr || '',
    exitCode: run.code,
    runtimeMs: 0, // Piston doesn't return precise timing; we measure wall-clock below
    signal: run.signal || null,
  };
}

/**
 * Runs code against ALL test cases in parallel via Piston.
 *
 * FIX: Parallel execution — sends all test cases concurrently with Promise.all().
 * Wall-clock time is O(slowest_test_case), not O(N × timeout).
 *
 * Called in Phase 2 of the two-phase transaction split — NO DB transaction is held.
 *
 * @param {string} code - Source code to execute
 * @param {string} language - Language key (c, cpp, java, python)
 * @param {Object} problem - Problem row from DB ({ test_cases, time_limit_ms, memory_limit_mb })
 * @returns {Object} { status, runtimeMs, failedTestCase?, totalTestCases?, stderr?, compileOutput? }
 */
async function runBatch(code, language, problem) {
  const lang = resolveLanguage(language);
  const testCases = problem.test_cases || [];

  if (!testCases.length) {
    throw Object.assign(new Error('Problem has no test cases'), { statusCode: 500 });
  }

  const startTime = Date.now();

  try {
    // FIX: Parallel execution — all test cases run concurrently
    const results = await Promise.all(
      testCases.map((tc) =>
        executeOne(code, lang, tc.input || '', problem.time_limit_ms, problem.memory_limit_mb)
      )
    );

    const wallClockMs = Date.now() - startTime;

    // Check for compile errors first (all results will have the same compile error)
    const compileError = results.find((r) => r.verdict === 'compile_error');
    if (compileError) {
      return {
        status: 'compile_error',
        runtimeMs: 0,
        compileOutput: compileError.compileOutput,
      };
    }

    // Check each test case result
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const tc = testCases[i];
      const expectedOutput = (tc.expected_output || '').trimEnd();

      // Runtime error or signal (e.g., segfault, timeout)
      if (result.signal) {
        if (result.signal === 'SIGKILL') {
          // Likely TLE or MLE
          return {
            status: 'tle',
            runtimeMs: wallClockMs,
            failedTestCase: i + 1,
            totalTestCases: testCases.length,
          };
        }
        return {
          status: 'runtime_error',
          runtimeMs: wallClockMs,
          failedTestCase: i + 1,
          totalTestCases: testCases.length,
          stderr: result.stderr,
        };
      }

      // Non-zero exit code
      if (result.exitCode !== 0) {
        return {
          status: 'runtime_error',
          runtimeMs: wallClockMs,
          failedTestCase: i + 1,
          totalTestCases: testCases.length,
          stderr: result.stderr,
        };
      }

      // Wrong answer — compare stdout vs expected
      if (result.stdout !== expectedOutput) {
        return {
          status: 'wrong_answer',
          runtimeMs: wallClockMs,
          failedTestCase: i + 1,
          totalTestCases: testCases.length,
        };
      }
    }

    // All test cases passed
    return {
      status: 'accepted',
      runtimeMs: wallClockMs,
    };
  } catch (err) {
    // Piston unreachable or timed out
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      throw Object.assign(
        new Error('Piston API timed out — submission will be retried'),
        { statusCode: 503, retryable: true }
      );
    }
    if (err.response?.status === 429) {
      throw Object.assign(
        new Error('Piston API rate limited — please wait and retry'),
        { statusCode: 429, retryable: true }
      );
    }
    throw Object.assign(
      new Error(`Piston API error: ${err.message}`),
      { statusCode: 502 }
    );
  }
}

module.exports = {
  runBatch,
  resolveLanguage,
  getSupportedLanguages,
  LANGUAGE_MAP,
};
