import { NextResponse } from "next/server";
import vm from "node:vm";

export async function POST(req: Request) {
  try {
    const { wrappedCode } = await req.json();

    if (!wrappedCode) {
      return NextResponse.json({ error: "No execution payload provided" }, { status: 400 });
    }

    // 1. Setup secure sandbox
    const sandbox: any = {
       // We provide essentially nothing to the sandbox for security
       Buffer: null,
       process: null,
       require: null,
       setTimeout: null,
       setInterval: null,
       clearTimeout: null,
       clearInterval: null,
       RESULTS: null, // This is where we expect the output
    };

    const context = vm.createContext(sandbox);

    try {
      // 2. Execute the wrapped code
      const script = new vm.Script(wrappedCode);
      
      // Execute with a hard 2-second timeout per entire submission
      script.runInContext(context, { 
        timeout: 2500, // 2.5s allows for some overhead
        displayErrors: true,
      });

      // 3. Extract Results
      const results = sandbox.RESULTS;

      if (!results) {
        // This usually means the script threw an error that was caught by our wrapper 
        // but didn't set RESULTS, or the wrapper itself failed.
        return NextResponse.json({ 
           success: false, 
           verdict: 'RUNTIME_ERROR', 
           message: "Evaluation engine failed to produce results. Check for function signature mismatch." 
        });
      }

      return NextResponse.json({
        success: true,
        results
      });

    } catch (e: any) {
      console.error("VM Execution Failure:", e);
      
      if (e.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') {
        return NextResponse.json({ 
          success: false, 
          verdict: 'TIME_LIMIT_EXCEEDED',
          message: "Execution stopped after 2 seconds (Infinite Loop Detected)"
        });
      }

      // If it starts with COMPILATION_ERROR, it's our flagged error from the wrapper
      if (e.message?.includes("COMPILATION_ERROR")) {
        return NextResponse.json({ 
          success: false, 
          verdict: 'COMPILATION_ERROR', 
          message: e.message 
        });
      }

      return NextResponse.json({ 
        success: false, 
        verdict: 'RUNTIME_ERROR', 
        message: e.message 
      });
    }

  } catch (error: any) {
    console.error("Evaluation API Hardware Failure:", error);
    return NextResponse.json({ error: "Internal Evaluation Failure" }, { status: 500 });
  }
}
