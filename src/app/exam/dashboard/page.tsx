"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useExamStore } from "@/store/examStore";
import { useExamSync } from "@/hooks/useExamSync";
import { motion, AnimatePresence } from "framer-motion";
import Editor from "@monaco-editor/react";
import { 
  AlertTriangle, ChevronLeft, ChevronRight, Clock, 
  LayoutDashboard, CheckCircle2, Circle, Menu, Code, ShieldAlert
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

export default function ExamDashboard() {
  const router = useRouter();
  
  const { isAuthenticated, candidate, cheatWarnings, incrementCheatWarning, logout } = useExamStore();
  
  // Real auth tracking - no more "anonymous" fallbacks
  const sessionId = candidate ? `session-${candidate.id}` : ""; 
  const candidateId = candidate?.id || "";

  // New Auto-Sync Hook Integration
  const { 
    questions, 
    settings, 
    responses, 
    examStage, 
    setExamStage, 
    updateResponse, 
    manualSync, 
    isSyncing, 
    recoveredSessionId 
  } = useExamSync(candidateId, sessionId);

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(3600); 
  const [timerInitialized, setTimerInitialized] = useState(false);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [showStageTransitionModal, setShowStageTransitionModal] = useState(false);
  const [showFinalSubmitModal, setShowFinalSubmitModal] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isTerminated, setIsTerminated] = useState(false);
  const [finalCandidateData, setFinalCandidateData] = useState<{name: string, roll: string} | null>(null);

  // Derive stage-specific questions
  const stageQuestions = (questions || []).filter(q => q.type === examStage);

  const unansweredCount = stageQuestions.filter(q => {
     const res = responses[q._id];
     if (!res) return true;
     if (q.type === 'MCQ') return !res.selectedOption;
     if (q.type === 'CODING') return !res.codeStr || res.codeStr.trim() === '';
     return false;
  }).length;

  // Reset index if stage changes or if index is out of bounds for the current stage
  useEffect(() => {
    setCurrentQuestionIndex(0);
  }, [examStage]);

  // Initialize timer from settings with Hard Cutoff Enforcement
  useEffect(() => {
    if (settings?.examDuration && settings?.examEnd && !timerInitialized) {
       const now = new Date();
       const driveEnd = new Date(settings.examEnd);
       const durationSeconds = settings.examDuration * 60;
       
       // Calculate remaining time until the drive window strictly closes
       const remainingToGlobalEnd = Math.max(0, Math.floor((driveEnd.getTime() - now.getTime()) / 1000));
       
       // Timer should be the lesser of (Full Duration) and (Time left until Drive Ends)
       // This ensures late-joiners only get the remaining window time.
       const initialTime = Math.min(durationSeconds, remainingToGlobalEnd);
       
       setTimeLeft(initialTime);
       setTimerInitialized(true);
    }
  }, [settings, timerInitialized]);

  // Auth Context Check - STRICT ENFORCEMENT
  useEffect(() => {
    if (!isAuthenticated && !isSubmitted) router.replace('/exam');
  }, [isAuthenticated, isSubmitted, router]);

  // Anti-Cheat: Visibility API & Context blocks
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && !isSubmitted && !isTerminated) {
        if (settings?.proctoringSeverity === 'HIGH') {
           setIsTerminated(true);
           handleViolationSubmit("Tab Switch (Strict Violation)");
        } else {
           incrementCheatWarning();
           setShowWarningModal(true);
        }
      }
    };
    
    const handleFullscreenChange = () => {
       if (!document.fullscreenElement && !isSubmitted && !isTerminated) {
          if (settings?.proctoringSeverity === 'HIGH') {
             setIsTerminated(true);
             handleViolationSubmit("Fullscreen Exit (Strict Violation)");
          } else {
             incrementCheatWarning();
             setShowWarningModal(true);
          }
       }
    };
    const blockEvent = (e: Event) => e.preventDefault();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("contextmenu", blockEvent);
    document.addEventListener("copy", blockEvent);
    document.addEventListener("paste", blockEvent);
    
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("contextmenu", blockEvent);
      document.removeEventListener("copy", blockEvent);
      document.removeEventListener("paste", blockEvent);
    };
  }, [incrementCheatWarning, settings, isSubmitted, isTerminated]);

  // Timer
  useEffect(() => {
    const timer = setInterval(() => setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  /**
   * Safe Web Worker Evaluation with Kill-Switch
   */
  const evaluateCodingQuestion = (code: string, testCases: any[]): Promise<any> => {
    return new Promise((resolve, reject) => {
      const worker = new Worker("/worker.js");
      
      const timeoutId = setTimeout(() => {
        worker.terminate();
        resolve({ passed: false, error: "Time Limit Exceeded (Infinite Loop Detected)" });
      }, 5000);

      worker.onmessage = (e) => {
        clearTimeout(timeoutId);
        worker.terminate();
        resolve(e.data); // Returns generic payload logic { testsPassed, totalTests, results }
      };

      worker.onerror = (err) => {
        clearTimeout(timeoutId);
        worker.terminate();
        resolve({ passed: false, error: "Runtime Syntax Fault" });
      };

      worker.postMessage({ code, testCases });
    });
  };

  const handleViolationSubmit = async (reason: string) => {
     console.warn(`AUTO-SUBMIT: ${reason}`);
     await handleSubmit(true);
  };

  const handleSubmit = async (isViolation: boolean = false, forceStage?: 'MCQ' | 'CODING') => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    
    // Determine context (Partial Stage Submit vs Final Submission)
    const targetStage = forceStage || examStage;
    const isStageTransition = targetStage === 'MCQ' && !isViolation;

    // Use the legitimate sessionId from the sync engine
    const activeSession = recoveredSessionId || sessionId;
    
    // Generically package evaluated mapping
    const finalEvaluatedResponses = { ...responses };

    // If it's the final submission (CODING) or a violation, evaluate coding questions
    if (!isStageTransition || isViolation) {
       for (const q of questions) {
          if (q.type === 'CODING' && q.testCases && responses[q._id]) {
             const evalResult = await evaluateCodingQuestion(responses[q._id].codeStr, q.testCases);
             finalEvaluatedResponses[q._id] = {
                codeStr: responses[q._id].codeStr,
                testsPassed: evalResult.testsPassed || 0,
                totalTests: evalResult.totalTests || q.testCases.length,
                errorState: evalResult.error || null
             };
          }
       }
    }

    // Submit cleanly evaluated json map to database node
    try {
      const res = await fetch('/api/exam/submit', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ 
            sessionId: activeSession, 
            candidateId, 
            finalResponses: finalEvaluatedResponses,
            stageAction: isStageTransition ? 'MCQ_SUBMIT' : 'FINAL_SUBMIT'
         })
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Submission rejected by server");
      }

      if (isStageTransition) {
         setExamStage('CODING');
         setShowStageTransitionModal(false);
      } else {
         if (candidate) {
            setFinalCandidateData({ name: candidate.name, roll: candidate.collegeRollNumber });
         }
         setIsSubmitted(true);
         if (isViolation) setIsTerminated(true);
         logout();
      }
    } catch (e: any) {
      console.error("Submit API Failure:", e);
      alert(`Submission Failed: ${e.message}. Please try again once or contact support.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 1. Success Screen View
  if (isSubmitted) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-noise opacity-[0.03] pointer-events-none z-0" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 blur-[120px] rounded-full mix-blend-screen pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/10 blur-[100px] rounded-full mix-blend-screen pointer-events-none" />

        <motion.div 
          initial={{ opacity: 0, scale: 0.9, filter: "blur(10px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-2xl z-10"
        >
          <Card className="border-border/50 bg-card/60 backdrop-blur-xl shadow-2xl relative overflow-hidden text-center">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-emerald-500 via-primary to-emerald-500" />
            
            <div className="pt-12 pb-8 px-8 space-y-6">
              <motion.div 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.3 }}
                className="mx-auto bg-emerald-500/10 p-5 rounded-full w-20 h-20 flex items-center justify-center mb-4 relative"
              >
                <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping opacity-20" />
                <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              </motion.div>

              <div className="space-y-2">
                <h1 className={`text-4xl font-semibold tracking-tighter bg-clip-text text-transparent ${isTerminated ? 'bg-gradient-to-br from-destructive to-destructive/70' : 'bg-gradient-to-br from-foreground to-foreground/70'}`}>
                  {isTerminated ? 'Assessment Terminated' : 'Mission Accomplished'}
                </h1>
                <p className="text-lg text-muted-foreground">
                  {isTerminated 
                    ? 'Your exam was automatically submitted due to multiple proctoring violations or security policy breaches.' 
                    : 'Your assessment has been securely submitted and encrypted.'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 py-8 border-y border-border/40">
                <div className="text-left space-y-1">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Candidate Trace</p>
                  <p className="text-lg font-medium">{finalCandidateData?.name || "Candidate"}</p>
                </div>
                <div className="text-right space-y-1">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">University ID</p>
                  <p className="text-lg font-mono font-medium">{finalCandidateData?.roll || "N/A"}</p>
                </div>
              </div>

              <div className="space-y-6 pt-4">
                <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 text-sm text-foreground/80 leading-relaxed italic">
                  "Your telemetry and responses have been logged for final evaluation. Please close this window or return to the main portal. Results will be communicated through your placement coordinator."
                </div>
                
                <div className="flex flex-col sm:flex-row gap-4">
                  <Button 
                    variant="outline" 
                    className="flex-1 h-12 text-base font-medium transition-all hover:bg-muted/50"
                    onClick={() => router.replace('/')}
                  >
                    Return to Portal
                  </Button>
                  <Button 
                    className="flex-1 h-12 text-base font-medium shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                    onClick={() => window.close()}
                  >
                    Exit Dashboard
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </motion.div>
      </div>
    );
  }

  // 2. Loading State View
  if (!questions || questions.length === 0) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background font-mono text-primary animate-pulse">
        Initializing Secure Sandbox Environment...
      </div>
    );
  }

  // 3. Main Dashboard View
  const currentQ = stageQuestions[currentQuestionIndex];
  const isAnswered = (id: string) => !!responses[id];

  if (!currentQ && stageQuestions.length === 0) {
     return (
        <div className="h-screen w-full flex items-center justify-center bg-background font-mono text-primary">
           Synchronizing Section Content...
        </div>
     );
  }

  return (
    <div className="h-screen w-full flex bg-background overflow-hidden relative selection:bg-none font-sans">
      <div className="absolute inset-0 bg-noise opacity-[0.03] pointer-events-none z-0" />

      {/* Warning Modal */}
      <Dialog open={showWarningModal && !isTerminated} onOpenChange={setShowWarningModal}>
        <DialogContent className="border-destructive/30 bg-destructive/5 backdrop-blur-2xl sm:max-w-md">
          <DialogHeader className="pt-4 text-center">
             <div className="h-16 w-16 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center mb-6 mx-auto">
                <AlertTriangle className="h-8 w-8 text-destructive animate-pulse" />
             </div>
             <DialogTitle className="text-2xl font-bold text-destructive tracking-tight">Proctoring Violation</DialogTitle>
             <DialogDescription className="text-base text-foreground/80 mt-2">
                System detected you switched tabs or left the secure environment. This incident has been logged.
                <br/><br/>
                {settings?.proctoringSeverity === 'MEDIUM' ? (
                   <span className="font-bold text-destructive">
                     WARNING {cheatWarnings} / {settings?.maxCheatWarnings}. 
                     Next violation will terminate your session.
                   </span>
                ) : (
                  "Multiple violations will lead to automatic submission."
                )}
             </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center pb-2 pt-6">
             <Button variant="destructive" className="w-full h-12 font-bold shadow-2xl shadow-destructive/20" onClick={() => {
                setShowWarningModal(false);
                if (settings?.proctoringSeverity === 'MEDIUM' && cheatWarnings >= settings?.maxCheatWarnings) {
                   handleViolationSubmit("Max Warnings Exceeded");
                }
             }}>
                Acknowledge & Resume
             </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stage Transition Modal */}
      <Dialog open={showStageTransitionModal && !isTerminated} onOpenChange={setShowStageTransitionModal}>
        <DialogContent className="border-primary/30 bg-card/60 backdrop-blur-2xl sm:max-w-md">
          <DialogHeader className="pt-4 text-center">
             <div className="h-16 w-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mb-6 mx-auto">
                <CheckCircle2 className="h-8 w-8 text-primary animate-pulse" />
             </div>
             <DialogTitle className="text-2xl font-bold tracking-tight">Finalize MCQ Section?</DialogTitle>
             <DialogDescription className="text-base text-foreground/80 mt-2">
                You are about to submit the objective section and proceed to the programming sandbox.
                <br/><br/>
                {unansweredCount > 0 ? (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-500 text-sm font-medium flex items-center gap-3">
                     <AlertTriangle className="h-5 w-5" />
                     Attention: {unansweredCount} questions are still unanswered.
                  </div>
                ) : (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-500 text-sm font-medium flex items-center gap-3">
                     <CheckCircle2 className="h-5 w-5" />
                     Perfect! All questions in this section have been answered.
                  </div>
                )}
                <br/>
                <span className="font-bold text-primary">
                  Note: You cannot return to edit MCQs after this transition.
                </span>
             </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center pb-2 pt-6 flex flex-col sm:flex-row gap-3">
             <Button variant="outline" className="flex-1 h-12" onClick={() => setShowStageTransitionModal(false)}>
                Back to Review
             </Button>
             <Button className="flex-1 h-12 font-bold shadow-2xl shadow-primary/20" onClick={() => handleSubmit(false, 'MCQ')}>
                {isSubmitting ? "Syncing..." : "Confirm & Proceed"}
             </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Final Submit Modal */}
      <Dialog open={showFinalSubmitModal && !isTerminated} onOpenChange={setShowFinalSubmitModal}>
        <DialogContent className="border-emerald-500/30 bg-card/60 backdrop-blur-2xl sm:max-w-md">
          <DialogHeader className="pt-4 text-center">
             <div className="h-16 w-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-6 mx-auto">
                <ShieldAlert className="h-8 w-8 text-emerald-500 animate-pulse" />
             </div>
             <DialogTitle className="text-2xl font-bold tracking-tight">Final Submission</DialogTitle>
             <DialogDescription className="text-base text-foreground/80 mt-2">
                You are about to submit your entire assessment for evaluation.
                <br/><br/>
                {unansweredCount > 0 ? (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-500 text-sm font-medium flex items-center gap-3">
                     <AlertTriangle className="h-5 w-5" />
                     Warning: {unansweredCount} coding problems are still unattempted.
                  </div>
                ) : (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-500 text-sm font-medium flex items-center gap-3">
                     <CheckCircle2 className="h-5 w-5" />
                     All programming tasks have been attempted.
                  </div>
                )}
                <br/>
                Once submitted, your responses will be encrypted and transmitted for final grading.
             </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center pb-2 pt-6 flex flex-col sm:flex-row gap-3">
             <Button variant="outline" className="flex-1 h-12" onClick={() => setShowFinalSubmitModal(false)}>
                Continue Coding
             </Button>
             <Button className="flex-1 h-12 font-bold bg-emerald-500 hover:bg-emerald-600 shadow-2xl shadow-emerald-500/20" onClick={() => handleSubmit(false, 'CODING')}>
                {isSubmitting ? "Finalizing..." : "Submit Everything"}
             </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sidebar Navigation */}
      <AnimatePresence initial={false}>
        {isSidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="h-full border-r border-border/40 bg-card/40 backdrop-blur shrink-0 z-10 hidden md:flex flex-col relative"
          >
            <div className="p-5 border-b border-border/40 flex items-center justify-between">
              <div className="flex items-center gap-3 text-foreground/80">
                <LayoutDashboard className="h-5 w-5 text-primary" />
                <h2 className="font-medium tracking-tight text-lg">
                   {examStage === 'MCQ' ? 'Objective Bank' : 'Coding Sandbox'}
                </h2>
              </div>
              {isSyncing && <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" title="Telemetry Sync Active" />}
            </div>
            
            <ScrollArea className="flex-1 p-5">
              <div className="grid grid-cols-5 gap-2 pb-10">
                {stageQuestions.map((q, i) => {
                  const answered = isAnswered(q._id);
                  const active = currentQuestionIndex === i;
                  return (
                    <button
                      key={q._id}
                      onClick={() => setCurrentQuestionIndex(i)}
                      className={`
                        aspect-square rounded-md text-xs font-semibold flex items-center justify-center transition-all border
                        ${active ? 'border-primary ring-2 ring-primary/30 bg-primary text-primary-foreground transform scale-[1.05]' 
                                 : answered ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30 font-bold' 
                                 : 'bg-input/20 border-border/50 text-muted-foreground hover:bg-muted/80'}
                      `}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </motion.aside>
        )}
      </AnimatePresence>

      <main className="flex-1 flex flex-col h-full bg-background relative z-10 w-full overflow-hidden">
        <header className="h-16 px-6 border-b border-border/40 bg-card/40 backdrop-blur flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="hidden md:flex">
              <Menu className="h-5 w-5" />
            </Button>
            <h1 className="font-semibold tracking-tight text-lg flex items-center gap-2">
              Section: {examStage} 
              <span className="text-muted-foreground text-sm font-normal">— Concept {currentQuestionIndex + 1} / {stageQuestions.length}</span>
            </h1>
          </div>
          
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg font-mono font-medium ${timeLeft < 300 ? 'bg-destructive/10 text-destructive animate-pulse' : 'bg-primary/10 text-primary'}`}>
            <Clock className="h-4 w-4" />
            {formatTime(timeLeft)}
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4 md:p-8">
          <motion.div
            key={`${examStage}-${currentQ._id}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-5xl mx-auto space-y-8"
          >
            <div className="space-y-4">
              <div className={`inline-flex px-3 py-1 rounded-full border font-semibold text-[10px] tracking-widest uppercase ${currentQ.type === 'CODING' ? 'bg-accent/10 border-accent/20 text-accent' : 'bg-primary/10 border-primary/20 text-primary'}`}>
                {currentQ.type === 'CODING' ? 'Programming Sandbox' : 'Objective Assessment'}
              </div>
              <h2 className="text-3xl md:text-4xl font-semibold tracking-tight leading-tight text-foreground/90">
                {currentQ.title}
              </h2>
              <div className="prose prose-invert max-w-none text-foreground/70 font-medium leading-relaxed pb-6 border-b border-border/40" dangerouslySetInnerHTML={{ __html: currentQ.content || '' }} />
            </div>

            {currentQ.type === 'MCQ' && currentQ.options && (
              <RadioGroup 
                value={responses[currentQ._id]?.selectedOption || ""} 
                onValueChange={(val) => updateResponse(currentQ._id, { selectedOption: val })}
                className="space-y-3"
              >
                {currentQ.options.map((opt: string, i: number) => {
                  const checked = responses[currentQ._id]?.selectedOption === opt;
                  return (
                    <Label 
                      key={i} 
                      className={`flex items-center space-x-4 p-5 rounded-2xl border border-border/50 cursor-pointer transition-all duration-200 ${checked ? 'bg-primary/10 border-primary ring-1 ring-primary/30' : 'bg-card/40 hover:bg-muted/40 hover:border-border/80'}`}
                    >
                      <RadioGroupItem value={opt} id={`opt-${i}`} className="sr-only" />
                      <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors ${checked ? 'border-primary' : 'border-muted-foreground/30'}`}>
                        {checked && <div className="h-2.5 w-2.5 rounded-full bg-primary" />}
                      </div>
                      <span className="text-base font-medium">{opt}</span>
                    </Label>
                  );
                })}
              </RadioGroup>
            )}

            {currentQ.type === 'CODING' && (
              <div className="rounded-2xl overflow-hidden border border-border/50 shadow-2xl shadow-black/80 bg-[#1e1e1e] h-[550px] relative">
                <div className="h-10 bg-muted/20 border-b border-border/30 flex items-center px-4 justify-between">
                   <div className="flex items-center gap-2">
                      <Code className="h-4 w-4 text-accent" />
                      <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Compiler Suite v1.0</span>
                   </div>
                   <div className="flex gap-1.5">
                      <div className="h-2 w-2 rounded-full bg-destructive/40" />
                      <div className="h-2 w-2 rounded-full bg-amber-500/40" />
                      <div className="h-2 w-2 rounded-full bg-emerald-500/40" />
                   </div>
                </div>
                <Editor
                  height="calc(100% - 40px)"
                  defaultLanguage="javascript"
                  theme="vs-dark"
                  value={responses[currentQ._id]?.codeStr || currentQ.boilerplateCode || ""}
                  onChange={(val) => updateResponse(currentQ._id, { codeStr: val || "" })}
                  options={{ 
                    minimap: { enabled: false }, 
                    fontSize: 15, 
                    fontFamily: 'var(--font-geist-mono)', 
                    padding: { top: 20 }, 
                    contextmenu: false,
                    lineNumbersMinChars: 3,
                    smoothScrolling: true,
                    cursorSmoothCaretAnimation: "on"
                  }}
                  onMount={(editor) => {
                     // Bind blur event to manual sync
                     editor.onDidBlurEditorText(() => manualSync());
                  }}
                />
              </div>
            )}
          </motion.div>
        </div>

        <footer className="h-20 px-6 border-t border-border/40 bg-card/60 backdrop-blur flex items-center justify-between shrink-0 z-10">
          <Button variant="outline" size="lg" onClick={() => setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1))} disabled={currentQuestionIndex === 0} className="h-12 px-6 border-border/50">
            <ChevronLeft className="h-5 w-5 mr-2" /> Previous
          </Button>
 
          {currentQuestionIndex === stageQuestions.length - 1 ? (
             <div className="flex flex-col items-end gap-1">
               <Button 
                 size="lg" 
                 onClick={() => examStage === 'MCQ' ? setShowStageTransitionModal(true) : setShowFinalSubmitModal(true)} 
                 disabled={isSubmitting || (examStage === 'CODING' && (timeLeft > (settings?.examDuration * 30)))} 
                 className={`${examStage === 'MCQ' ? 'bg-primary shadow-primary/20' : 'bg-emerald-500 shadow-emerald-500/20'} text-white font-semibold px-10 h-12 shadow-lg active:scale-95 transition-all disabled:opacity-50 disabled:grayscale`}
               >
                 {isSubmitting ? "Encrypting Matrix..." : examStage === 'MCQ' ? "Finish & Proceed to Coding" : "Submit Final Assessment"}
               </Button>
               {examStage === 'CODING' && timeLeft > (settings?.examDuration * 30) && (
                  <span className="text-[10px] font-bold text-destructive/70 uppercase tracking-widest animate-pulse">
                     Final submission unlocks in {formatTime(timeLeft - (settings?.examDuration * 30))}
                  </span>
               )}
             </div>
          ) : (
            <Button size="lg" onClick={() => setCurrentQuestionIndex(Math.min(stageQuestions.length - 1, currentQuestionIndex + 1))} className="px-10 h-12 shadow-lg shadow-primary/10">
              Next Stage <ChevronRight className="h-5 w-5 ml-2" />
            </Button>
          )}
        </footer>
      </main>
    </div>
  );
}
