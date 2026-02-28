#!/usr/bin/env node
/**
 * Test Catalog Generator for Capns-JS
 *
 * Scans all JavaScript test files and generates a markdown table cataloging all numbered tests
 * with their descriptions.
 */

const fs = require('fs');
const path = require('path');

/**
 * Information about a single test
 */
class TestInfo {
  constructor(number, functionName, description, filePath, lineNumber) {
    this.number = number;
    this.functionName = functionName;
    this.description = description;
    this.filePath = filePath;
    this.lineNumber = lineNumber;
  }
}

/**
 * Extract test information from a JavaScript test file.
 * Returns an array of TestInfo objects for all numbered tests found.
 */
function extractTestInfo(filePath) {
  const tests = [];

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Look for test function definitions: function test123_something()
      const testMatch = line.match(/^\s*function\s+(test(\d+)_\w+)\s*\(/);

      if (testMatch) {
        const functionName = testMatch[1];
        const testNumber = testMatch[2];

        // Look backwards for comment lines
        const descriptionLines = [];
        let j = i - 1;

        // Collect comment lines (typically one or two lines before the test)
        while (j >= 0 && lines[j].trim().startsWith('//')) {
          const commentLine = lines[j].trim();
          // Remove the '//' prefix and leading/trailing whitespace
          let commentText = commentLine.substring(2).trim();

          // Remove TEST### prefix if present (e.g., "// TEST001: description" -> "description")
          commentText = commentText.replace(/^TEST\d+:\s*/, '');

          descriptionLines.unshift(commentText);
          j--;
        }

        // Join description lines with space
        const description = descriptionLines.join(' ');

        // Get relative path from capns-js root
        const relativePath = path.relative(path.dirname(filePath), filePath);

        const testInfo = new TestInfo(
          testNumber,
          functionName,
          description,
          path.basename(filePath),
          i + 1
        );
        tests.push(testInfo);
      }
    }
  } catch (e) {
    console.warn(`Warning: Could not read ${filePath}: ${e.message}`);
  }

  return tests;
}

/**
 * Scan a directory for JavaScript test files and extract test information.
 */
function scanDirectory(rootDir) {
  const allTests = [];

  function scanRecursive(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        scanRecursive(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.test.js')) {
        const tests = extractTestInfo(fullPath);
        allTests.push(...tests);
      }
    }
  }

  scanRecursive(rootDir);
  return allTests;
}

/**
 * Generate a markdown table cataloging all tests.
 */
function generateMarkdownTable(tests, outputFile) {
  // Sort tests by test number (numerically)
  const testsSorted = tests.sort((a, b) => parseInt(a.number) - parseInt(b.number));

  let content = '# Capns-JS Test Catalog\n\n';
  content += `**Total Tests:** ${testsSorted.length}\n\n`;
  content += 'This catalog lists all numbered tests in the capns-js codebase.\n\n';

  // Table header
  content += '| Test # | Function Name | Description | Location |\n';
  content += '|--------|---------------|-------------|----------|\n';

  // Table rows
  for (const test of testsSorted) {
    // Escape pipe characters in description
    const description = test.description.replace(/\|/g, '\\|');

    // Create file location link
    const location = `${test.filePath}:${test.lineNumber}`;

    content += `| test${test.number} | \`${test.functionName}\` | ${description} | ${location} |\n`;
  }

  content += '\n---\n\n';
  content += '*Generated from capns-js source tree*\n';
  content += `*Total numbered tests: ${testsSorted.length}*\n`;

  fs.writeFileSync(outputFile, content, 'utf-8');
}

/**
 * Main entry point
 */
function main() {
  // Determine the capns-js root directory (where this script is located)
  const scriptDir = __dirname;

  console.log('Scanning for tests in capns-js codebase...');

  // Scan current directory for test files
  console.log(`  Scanning ${scriptDir}...`);
  const allTests = scanDirectory(scriptDir);
  console.log(`    Found ${allTests.length} tests`);

  console.log(`\nTotal tests found: ${allTests.length}`);

  // Generate markdown table
  const outputFile = path.join(scriptDir, 'TEST_CATALOG.md');
  console.log(`\nGenerating catalog: ${outputFile}`);
  generateMarkdownTable(allTests, outputFile);

  console.log('✓ Catalog generated successfully!');
  console.log(`  File: ${outputFile}`);

  // Print some statistics
  const testRanges = {};
  for (const test of allTests) {
    const century = Math.floor(parseInt(test.number) / 100) * 100;
    const rangeKey = `${century.toString().padStart(3, '0')}-${(century + 99).toString().padStart(3, '0')}`;
    testRanges[rangeKey] = (testRanges[rangeKey] || 0) + 1;
  }

  console.log('\nTest distribution by range:');
  for (const rangeKey of Object.keys(testRanges).sort()) {
    const count = testRanges[rangeKey];
    console.log(`  ${rangeKey}: ${count} tests`);
  }
}

if (require.main === module) {
  main();
}

module.exports = { extractTestInfo, scanDirectory, generateMarkdownTable };
