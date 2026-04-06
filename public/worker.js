// public/worker.js
// Hardened Isolated Code Evaluation Engine for Exam Portal

self.onmessage = function(e) {
  const { code, testCases } = e.data;
  const results = [];
  let testsPassed = 0;

  // 1. Setup Console Capture
  const consoleLogs = [];
  const mockConsole = {
    log: (...args) => {
      const msg = args.map(arg => {
        try {
          return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
        } catch (e) {
          return "[Unserializable Object]";
        }
      }).join(' ');
      consoleLogs.push(msg);
    }
  };

  try {
    // 2. Pre-process function detection
    const funcNameMatch = code.match(/function\s+([a-zA-Z0-9_$]+)/);
    const funcName = funcNameMatch ? funcNameMatch[1] : null;

    testCases.forEach((tc, index) => {
      // Clear logs for each test case to keep them specific
      consoleLogs.length = 0; 
      
      try {
        // 3. Robust Input Parsing (JSON-Aware)
        let args = [];
        const rawInput = String(tc.input).trim();
        
        if (rawInput.startsWith('[') || rawInput.startsWith('{')) {
          try {
            const parsed = JSON.parse(rawInput);
            // Treat the entire JSON structure as a SINGLE argument
            // This is critical for array-based questions like findMax([1, 2, 3])
            args = [parsed];
          } catch (e) {
            // Fallback to CSV if JSON parse fails
            args = rawInput.split(',').map(s => s.trim());
          }
        } else {
          args = rawInput.split(',').map(val => {
            const v = val.trim();
            if (v === 'true') return true;
            if (v === 'false') return false;
            if (!isNaN(v) && v !== "" && !v.startsWith("0x")) return Number(v);
            // Remove surrounding quotes if present
            if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
               return v.slice(1, -1);
            }
            return v;
          });
        }

        // 4. Construct Execution context with console injection
        let executionScript = "";
        if (funcName) {
           executionScript = `${code}\nreturn ${funcName}(...args);`;
        } else {
           executionScript = code;
        }

        // 5. Create the sandboxed runner with injected console
        const runner = new Function('input', 'args', 'console', `
          try {
            ${executionScript}
          } catch (err) {
            throw err;
          }
        `);

        // Execute
        const actualOutput = runner(tc.input, args, mockConsole);
        
        // 6. Deep Comparison (Handles Arrays/Objects)
        let passed = false;
        const expectedRaw = String(tc.expectedOutput).trim();

        // Try JSON match first
        try {
          const actualJson = JSON.stringify(actualOutput);
          // If expected is valid JSON, do exact string match of stringified versions
          const parsedExpected = JSON.parse(expectedRaw);
          passed = actualJson === JSON.stringify(parsedExpected);
        } catch (e) {
          // Fallback to normalized string comparison
          const normalizedActual = String(actualOutput).trim().toLowerCase();
          const normalizedExpected = expectedRaw.toLowerCase();
          passed = normalizedActual === normalizedExpected;
        }
        
        if (passed) testsPassed++;
        
        results.push({
          index,
          passed,
          input: tc.isHidden ? "[Hidden]" : tc.input,
          expected: tc.isHidden ? "[Hidden]" : tc.expectedOutput,
          actual: tc.isHidden ? (passed ? "[Correct]" : "[Incorrect]") : actualOutput,
          logs: [...consoleLogs],
          error: null
        });

      } catch (err) {
        results.push({
          index,
          passed: false,
          input: tc.isHidden ? "[Hidden]" : tc.input,
          logs: [...consoleLogs],
          error: err.message
        });
      }
    });

    self.postMessage({
      success: true,
      testsPassed,
      totalTests: testCases.length,
      results
    });

  } catch (globalErr) {
    self.postMessage({
      success: false,
      error: globalErr.message
    });
  }
};
