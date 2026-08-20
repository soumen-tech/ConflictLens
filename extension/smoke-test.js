/**
 * smoke-test.js — Phase 2
 *
 * Validates the compiled output with a minimal vscode stub so we can run
 * outside the Extension Development Host. Tests: mock shape, error exports.
 *
 * Run: node smoke-test.js
 */

// ── Minimal vscode stub ──────────────────────────────────────────────────────
// analyzerClient reads workspace config; stub getConfiguration() to return
// an empty endpoint so the mock path is exercised (no real API call made).
const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') {
    return {
      workspace: {
        getConfiguration: () => ({
          get: (key, defaultVal) => defaultVal, // apiEndpoint → '' (mock mode)
        }),
        workspaceFolders: [],
      },
    };
  }
  return originalLoad.apply(this, arguments);
};

// ── Now safe to require the compiled module ───────────────────────────────────
const {
  getMockResult,
  analyzeProject,
  ApiUnavailableError,
  ApiTimeoutError,
  ApiMalformedError,
} = require('./out/analyzerClient');

let passed = 0;
let failed = 0;

function check(label, condition) {
  if (condition) {
    console.log(`  [PASS] ${label}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${label}`);
    failed++;
  }
}

console.log('\n=== ConflictLens Phase 2 Smoke Test ===\n');

// ── 1. getMockResult() ───────────────────────────────────────────────────────
const mock = getMockResult();
console.log('── getMockResult() ──');
check('returns an object',                      typeof mock === 'object');
check('analysis_id is a string',                typeof mock.analysis_id === 'string');
check('risks is a non-empty array',             Array.isArray(mock.risks) && mock.risks.length > 0);
check('risk has nested location.file',          typeof mock.risks[0].location.file === 'string');
check('risk has nested location.line',          typeof mock.risks[0].location.line === 'number');
check('risk has ai_context.explanation',        typeof mock.risks[0].ai_context.explanation === 'string');
check('risk has ai_context.recommendation',     typeof mock.risks[0].ai_context.recommendation === 'string');

// ── 2. Error class exports ───────────────────────────────────────────────────
console.log('\n── Error class exports ──');
const unavail = new ApiUnavailableError('ECONNREFUSED');
const timeout = new ApiTimeoutError(8000, 'http://localhost:3000/analyze');
const malform = new ApiMalformedError('unexpected shape');

check('ApiUnavailableError.name',   unavail.name === 'ApiUnavailableError');
check('ApiTimeoutError.name',       timeout.name === 'ApiTimeoutError');
check('ApiMalformedError.name',     malform.name === 'ApiMalformedError');
check('All are Error instances',
  unavail instanceof Error && timeout instanceof Error && malform instanceof Error);

// ── 3. analyzeProject() mock path ────────────────────────────────────────────
console.log('\n── analyzeProject() mock path ──');
analyzeProject().then((result) => {
  check('resolves to an object',              typeof result === 'object');
  check('risks is an array',                  Array.isArray(result.risks));
  check('has analysis_id',                    typeof result.analysis_id === 'string');
  check('has timestamp',                      typeof result.timestamp === 'string');

  console.log(`\n${passed} passed, ${failed} failed`);

  if (failed > 0) {
    console.error('\nSome checks failed. See above.');
    process.exit(1);
  } else {
    console.log('\nAll checks passed. Phase 2 build is ready — F5 to test in VS Code.');
  }
}).catch((err) => {
  console.error('\n[FAIL] analyzeProject() threw unexpectedly:', err);
  process.exit(1);
});
