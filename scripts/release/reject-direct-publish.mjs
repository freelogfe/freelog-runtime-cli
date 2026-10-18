#!/usr/bin/env node
console.error('Direct workspace npm publish is disabled. Use the approved release:prepare → candidate dev acceptance → release:check → release -- --candidate <path> workflow. The controlled writer publishes the same accepted tarball without rebuilding.');
process.exitCode = 1;
