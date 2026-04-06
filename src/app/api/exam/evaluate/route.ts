import { NextResponse } from "next/server";
import vm from "node:vm";
import connectToDatabase from "@/lib/mongodb";
import Question from "@/models/Question";

export async function POST(req: Request) {
  try {
    const { studentCode, questionId } = await req.json();

    if (!studentCode || !questionId) {
      return NextResponse.json({ error: "No execution payload or identity provided" }, { status: 400 });
    }

    await connectToDatabase();
    const question = await Question.findById(questionId).lean() as any;

    if (!question) {
       return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    const testCases = question.testCases || [];

    // 1. Generate Universal Wrapped Code
    const funcMatch = studentCode.match(/function\s+([a-zA-Z0-9_$]+)/);
    const entryPoint = funcMatch ? funcMatch[1] : null;

    const wrappedCode = `
      (function(global) {
        global.RESULTS = [];
        const cases = ${JSON.stringify(testCases)};
        const entry = "${entryPoint}";

        for (let i = 0; i < cases.length; i++) {
           const tc = cases[i];
           const res = { index: i, actual: null, error: null, runtime: 0 }; 
           const start = Date.now();
           
           // Initialize Stdin and Stdout for this specific test case
           global.STDOUT = [];
           global.STDIN_CONTENT = (tc.input || "").toString();

           try {
              // EXECUTE STUDENT CODE
              // Wrapping in a function to isolate scope but allow immediate execution
              (function() {
                ${studentCode}

                // If no console output was produced, but an entry function exists, 
                // try to call it (Function-based fallback)
                if (global.STDOUT.length === 0 && entry && typeof eval(entry) === 'function') {
                   let args = [];
                   const rawInput = (tc.input || "").trim();
                   if (rawInput.startsWith('[') || rawInput.startsWith('{')) {
                     args = [JSON.parse(rawInput)];
                   } else {
                     args = rawInput.split(',').map(v => {
                        const s = v.trim();
                        if (!isNaN(s) && s !== "" && !s.startsWith("0b") && !s.startsWith("0x")) return Number(s);
                        if (s === 'true') return true;
                        if (s === 'false') return false;
                        return s;
                     });
                   }
                   let retValue = eval(entry)(...args);
                   if (retValue !== undefined) {
                      if (Array.isArray(retValue) || (retValue !== null && typeof retValue === 'object')) {
                         retValue = JSON.stringify(retValue);
                      }
                      global.STDOUT.push(String(retValue));
                   }
                }
              })();

              if (global.STDOUT.length === 0) {
                 throw new Error("Logic produced no output. Use console.log() or return.");
              }

              res.actual = global.STDOUT.join('\\n').trim();
           } catch(e) {
              res.error = e.message;
           }
           res.runtime = Date.now() - start;
           global.RESULTS.push(res);
        }
      })(this);
    `;

    // 2. Setup Secure Sandbox with Mocks
    const sandbox: any = { 
       RESULTS: null,
       STDOUT: [],
       STDIN_CONTENT: "",
       Buffer: Buffer, // Required for some standard operations
       // Mocked Require for Competitive Programming Patterns
       require: (id: string) => {
          if (id === 'fs') {
             return {
                readFileSync: (fd: any) => {
                   // Mock stdin (file descriptor 0 or "/dev/stdin")
                   if (fd === 0 || fd === '/dev/stdin' || fd === '/dev/stdin') {
                      return sandbox.STDIN_CONTENT;
                   }
                   throw new Error("File System access restricted in sandbox");
                }
             };
          }
          throw new Error(`Module ${id} not found in sandbox`);
       },
       // Mocked Console to Capture Standard Output
       console: {
          log: (...args: any[]) => {
             sandbox.STDOUT.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
          },
          info: (...args: any[]) => sandbox.console.log(...args),
          error: (...args: any[]) => sandbox.console.log(...args),
          warn: (...args: any[]) => sandbox.console.log(...args),
       },
       process: {
          stdout: {
             write: (s: string) => sandbox.STDOUT.push(s)
          }
       }
    };
    
    const context = vm.createContext(sandbox);

    try {
      const script = new vm.Script(wrappedCode);
      script.runInContext(context, { timeout: 2500 });

      const results = sandbox.RESULTS;

      if (!results) {
        return NextResponse.json({ 
           success: false, 
           verdict: 'RUNTIME_ERROR', 
           message: "Evaluation engine failed to produce results. ReferenceError may have occurred." 
        });
      }

      // 3. Perform Comparison against Ground Truth (Server-side)
      const evaluatedResults = results.map((r: any, idx: number) => {
        const tc = testCases[idx];
        const expectedNorm = (tc.expectedOutput || "").toString().toLowerCase().trim();
        const actualNorm = (r.actual || "").toString().toLowerCase().trim();
        const isPassed = !r.error && (actualNorm === expectedNorm);

        // Scrub details for hidden test cases
        if (tc.isHidden) {
          return { 
            index: r.index, 
            passed: isPassed, 
            error: r.error, 
            runtime: r.runtime,
            isHidden: true 
          };
        }

        return { 
           ...r, 
           passed: isPassed,
           isHidden: false 
        };
      });

      return NextResponse.json({
        success: true,
        results: evaluatedResults
      });

    } catch (e: any) {
      if (e.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') {
        return NextResponse.json({ success: false, verdict: 'TIME_LIMIT_EXCEEDED' });
      }
      return NextResponse.json({ success: false, verdict: 'RUNTIME_ERROR', message: e.message });
    }

  } catch (error: any) {
    console.error("Evaluation API Hardware Failure:", error);
    return NextResponse.json({ error: "Internal Evaluation Failure" }, { status: 500 });
  }
}
