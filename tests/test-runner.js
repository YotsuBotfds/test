#!/usr/bin/env node

/**
 * Minimal Test Runner for ES6 Modules
 * Provides describe/it/expect API with colors and exit codes
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  gray: '\x1b[90m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

// Test state
let currentSuite = null;
let suites = [];
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

/**
 * Assertion utilities
 */
const expect = (actual) => ({
  toBe(expected) {
    return assertion(actual === expected, `expected ${format(actual)} to be ${format(expected)}`);
  },
  toEqual(expected) {
    return assertion(deepEqual(actual, expected), `expected ${format(actual)} to equal ${format(expected)}`);
  },
  toStrictEqual(expected) {
    return assertion(actual === expected, `expected ${format(actual)} to strictly equal ${format(expected)}`);
  },
  toBeTruthy() {
    return assertion(!!actual, `expected ${format(actual)} to be truthy`);
  },
  toBeFalsy() {
    return assertion(!actual, `expected ${format(actual)} to be falsy`);
  },
  toBeNull() {
    return assertion(actual === null, `expected ${format(actual)} to be null`);
  },
  toBeUndefined() {
    return assertion(actual === undefined, `expected ${format(actual)} to be undefined`);
  },
  toBeGreaterThan(expected) {
    return assertion(actual > expected, `expected ${actual} to be greater than ${expected}`);
  },
  toBeLessThan(expected) {
    return assertion(actual < expected, `expected ${actual} to be less than ${expected}`);
  },
  toContain(expected) {
    return assertion(
      (actual && (Array.isArray(actual) ? actual.includes(expected) : actual.includes(expected))),
      `expected ${format(actual)} to contain ${format(expected)}`
    );
  },
  toMatch(pattern) {
    return assertion(pattern.test(actual), `expected ${format(actual)} to match ${pattern}`);
  },
  toThrow(expectedError) {
    try {
      actual();
      return assertion(false, `expected function to throw an error`);
    } catch (error) {
      if (expectedError) {
        const matches = error.message.includes(expectedError.message || expectedError);
        return assertion(matches, `expected to throw error matching ${expectedError}`);
      }
      return assertion(true);
    }
  },
  not: {
    toBe(expected) {
      return assertion(actual !== expected, `expected ${format(actual)} not to be ${format(expected)}`);
    },
    toEqual(expected) {
      return assertion(!deepEqual(actual, expected), `expected ${format(actual)} not to equal ${format(expected)}`);
    },
    toBeNull() {
      return assertion(actual !== null, `expected ${format(actual)} not to be null`);
    },
    toContain(expected) {
      return assertion(!actual.includes(expected), `expected ${format(actual)} not to contain ${format(expected)}`);
    },
    toThrow(expectedError) {
      try {
        actual();
        return assertion(true, `expected function not to throw an error`);
      } catch (error) {
        if (expectedError) {
          const matches = error.message.includes(expectedError.message || expectedError);
          return assertion(!matches, `expected not to throw error matching ${expectedError}`);
        }
        return assertion(false, `expected function not to throw an error`);
      }
    },
  },
});

/**
 * Deep equality check for objects and arrays
 */
function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, idx) => deepEqual(val, b[idx]));
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every(key => deepEqual(a[key], b[key]));
  }

  return false;
}

/**
 * Format value for display
 */
function format(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `'${value}'`;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Handle assertion result
 */
function assertion(passed, message) {
  totalTests++;
  if (passed) {
    passedTests++;
  } else {
    failedTests++;
    throw new Error(message);
  }
}

/**
 * Describe a test suite
 */
function describe(name, fn) {
  const suite = {
    name,
    tests: [],
    failures: [],
    befores: [],
    afters: [],
    nested: [],
  };

  const previousSuite = currentSuite;
  currentSuite = suite;
  fn();
  currentSuite = previousSuite;

  if (previousSuite === null) {
    suites.push(suite);
  } else {
    previousSuite.nested.push(suite);
  }
}

/**
 * Register a test case
 */
function it(description, fn) {
  if (!currentSuite) {
    throw new Error('it() must be called within a describe() block');
  }
  currentSuite.tests.push({ description, fn });
}

/**
 * Before hook
 */
function beforeEach(fn) {
  if (!currentSuite) {
    throw new Error('beforeEach() must be called within a describe() block');
  }
  currentSuite.befores.push(fn);
}

/**
 * After hook
 */
function afterEach(fn) {
  if (!currentSuite) {
    throw new Error('afterEach() must be called within a describe() block');
  }
  currentSuite.afters.push(fn);
}

/**
 * Flatten nested suites into a list of test objects with all hooks
 */
function flattenSuite(suite, parentBefores = [], parentAfters = []) {
  const befores = [...parentBefores, ...suite.befores];
  const afters = [...suite.afters, ...parentAfters];
  const flatTests = [];

  // Add tests from current suite
  suite.tests.forEach(test => {
    flatTests.push({
      name: `${suite.name} > ${test.description}`,
      fn: test.fn,
      befores,
      afters,
    });
  });

  // Add tests from nested suites
  suite.nested.forEach(nestedSuite => {
    flatTests.push(...flattenSuite(nestedSuite, befores, afters));
  });

  return flatTests;
}

/**
 * Run all tests
 */
async function runTests(testFiles) {
  console.log(`\n${colors.bold}${colors.dim}${'═'.repeat(50)}${colors.reset}`);
  console.log(`${colors.bold}Running Tests${colors.reset}`);
  console.log(`${colors.bold}${colors.dim}${'═'.repeat(50)}${colors.reset}\n`);
  console.log(`${colors.dim}Test Files: ${testFiles.length}${colors.reset}\n`);

  // Flatten all suites and their nested suites into individual tests
  const allTests = [];
  for (const suite of suites) {
    allTests.push(...flattenSuite(suite));
  }

  const failureMessages = [];

  for (const test of allTests) {
    // Run beforeEach hooks
    let skipped = false;
    for (const before of test.befores) {
      try {
        await before();
      } catch (error) {
        console.log(`  ${colors.red}✗${colors.reset} ${test.name}`);
        console.log(`    ${colors.red}Error in beforeEach: ${error.message}${colors.reset}`);
        failedTests++;
        totalTests++;
        skipped = true;
        break;
      }
    }

    if (!skipped) {
      // Run test
      try {
        await test.fn();
        console.log(`  ${colors.green}✓${colors.reset} ${test.name}`);
      } catch (error) {
        console.log(`  ${colors.red}✗${colors.reset} ${test.name}`);
        console.log(`    ${colors.red}${error.message}${colors.reset}`);
        failureMessages.push(`${test.name}: ${error.message}`);
        failedTests++;
      }
      totalTests++;
    }

    // Run afterEach hooks
    for (const after of test.afters) {
      try {
        await after();
      } catch (error) {
        console.log(`    ${colors.yellow}Warning in afterEach: ${error.message}${colors.reset}`);
      }
    }
  }

  console.log();
}

/**
 * Print summary and exit
 */
function printSummary() {
  const total = totalTests;
  const passed = passedTests;
  const failed = failedTests;
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;

  console.log(`${colors.bold}${colors.dim}${'─'.repeat(50)}${colors.reset}`);
  console.log(`${colors.bold}Test Summary${colors.reset}`);
  console.log(`${colors.dim}${'─'.repeat(50)}${colors.reset}`);
  console.log(`${colors.bold}Total Tests:${colors.reset} ${total}`);
  console.log(`${colors.green}${colors.bold}Passed:${colors.reset} ${passed}`);
  if (failed > 0) {
    console.log(`${colors.red}${colors.bold}Failed:${colors.reset} ${failed}`);
  }
  console.log(`${colors.bold}Pass Rate:${colors.reset} ${passRate}%`);
  console.log(`${colors.dim}${'─'.repeat(50)}${colors.reset}`);

  if (failed === 0) {
    console.log(`\n${colors.green}${colors.bold}✓ All ${total} tests passed${colors.reset}\n`);
    process.exit(0);
  } else {
    console.log(`\n${colors.red}${colors.bold}✗ ${failed} of ${total} tests failed${colors.reset}\n`);
    process.exit(1);
  }
}

/**
 * Discover and load test files
 */
async function loadTestFiles() {
  const testDir = path.join(__dirname);
  const files = fs.readdirSync(testDir).filter(f => f.endsWith('.test.js'));

  for (const file of files) {
    const testPath = path.join(testDir, file);
    await import(testPath);
  }

  return files;
}

// Export API for tests
export { describe, it, expect, beforeEach, afterEach };

// Main execution
async function main() {
  try {
    const testFiles = await loadTestFiles();
    await runTests(testFiles);
    printSummary();
  } catch (error) {
    console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

main();
