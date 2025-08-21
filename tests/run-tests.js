#!/usr/bin/env node
// run-tests.js
// Simple test runner script for Replit environment

const { spawn } = require('child_process');
const path = require('path');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(colorize(`\n🚀 Running: ${command} ${args.join(' ')}`, 'cyan'));

    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
      ...options
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(code);
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

async function runTests() {
  console.log(colorize('🧪 Marine AI Test Suite', 'magenta'));
  console.log(colorize('========================', 'magenta'));

  const testType = process.argv[2] || 'all';

  try {
    switch (testType) {
      case 'unit':
        console.log(colorize('\n📋 Running Unit Tests Only', 'blue'));
        await runCommand('npx', ['jest', 'tests/unit', '--verbose']);
        break;

      case 'integration':
        console.log(colorize('\n🔗 Running Integration Tests Only', 'blue'));
        await runCommand('npx', ['jest', 'tests/integration', '--verbose', '--testTimeout=15000']);
        break;

      case 'regression':
        console.log(colorize('\n🛡️  Running Regression Tests Only', 'blue'));
        await runCommand('npx', ['jest', 'tests/regression', '--verbose', '--testTimeout=20000']);
        break;

      case 'quick':
        console.log(colorize('\n⚡ Running Quick Tests (Unit + Basic)', 'blue'));
        await runCommand('npx', ['jest', 'tests/unit', 'tests/regression/current-behavior.test.js', '--verbose']);
        break;

      case 'all':
      default:
        console.log(colorize('\n🎯 Running Full Test Suite', 'blue'));

        // Run in order: unit, integration, regression
        console.log(colorize('\n1️⃣  Unit Tests', 'yellow'));
        await runCommand('npx', ['jest', 'tests/unit', '--verbose']);

        console.log(colorize('\n2️⃣  Integration Tests', 'yellow'));
        await runCommand('npx', ['jest', 'tests/integration', '--verbose', '--testTimeout=15000']);

        console.log(colorize('\n3️⃣  Regression Tests', 'yellow'));
        await runCommand('npx', ['jest', 'tests/regression', '--verbose', '--testTimeout=20000']);
        break;
    }

    console.log(colorize('\n✅ All tests completed successfully!', 'green'));

  } catch (error) {