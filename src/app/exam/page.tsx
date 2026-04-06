"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldAlert, Maximize, Play, Lock, CheckCircle2, ArrowLeft, Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { useExamStore } from "@/store/examStore";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email."),
  pin: z.string().length(6, "PIN must be exactly 6 digits."),
});

export default function ExamLoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, setFullscreen } = useExamStore();
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAlreadySubmitted, setIsAlreadySubmitted] = useState(false);
  const [isNotStarted, setIsNotStarted] = useState(false);
  const [isConcurrentSession, setIsConcurrentSession] = useState(false);
  const [submittedCandidate, setSubmittedCandidate] = useState<any>(null);
  const [scheduledStartTime, setScheduledStartTime] = useState<string | null>(null);

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", pin: "" },
  });

  const onSubmit = async (values: z.infer<typeof loginSchema>) => {
    setIsLoggingIn(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/exam-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: values.email,
          accessPin: values.pin,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        // Update store with actual candidate data
        login({
          id: data.candidateId,
          name: data.name,
          email: values.email,
          pin: values.pin,
          collegeRollNumber: data.collegeRollNumber
        });
      } else if (res.status === 403) {
        const errorMsg = data.error?.toLowerCase() || "";
        if (errorMsg.includes("opens on") || errorMsg.includes("scheduled")) {
          setIsNotStarted(true);
          setScheduledStartTime(data.error);
        } else {
          setIsAlreadySubmitted(true);
          setSubmittedCandidate({ name: data.name, rollNumber: data.collegeRollNumber });
        }
      } else if (res.status === 409) {
        setIsConcurrentSession(true);
        setSubmittedCandidate({ name: data.name, rollNumber: data.collegeRollNumber });
      } else {
        setError(data.error || "Authentication failed. Please check your credentials.");
      }
    } catch (err) {
      setError("Network error. Please check your connection.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const startExam = async () => {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        setFullscreen(true);
      }
      setTimeout(() => {
        router.push("/exam/dashboard");
      }, 500);
    } catch (err) {
      console.error("Fullscreen failed:", err);
      // Fallback
      router.push("/exam/dashboard");
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-background relative overflow-hidden">
      {/* Decorative noise */}
      <div className="absolute inset-0 bg-noise pointer-events-none opacity-5mix-blend-overlay z-0" />
      
      {/* Immersive glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 blur-[150px] rounded-full pointer-events-none z-0" />

      <AnimatePresence mode="wait">
        {!isAuthenticated ? (
          <motion.div
            key={isAlreadySubmitted ? "already-submitted" : "login-form"}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95, filter: "blur(4px)" }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-md z-10"
          >
            {isAlreadySubmitted ? (
               <Card className="border-emerald-500/30 bg-card/40 backdrop-blur-2xl shadow-2xl overflow-hidden relative text-center">
                  <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-emerald-500/50 via-primary/50 to-emerald-500/50" />
                  <CardHeader className="pt-10 pb-6">
                    <div className="h-16 w-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-6 mx-auto">
                      <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                    </div>
                    <CardTitle className="text-2xl font-bold tracking-tight text-foreground">Assessment Received</CardTitle>
                    <CardDescription className="text-muted-foreground mt-3 px-4">
                      Your identity has been verified, but our records indicate that your examination session has already been processed.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pb-8">
                    <div className="p-5 rounded-2xl bg-primary/5 border border-primary/10 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                         <div className="text-left">
                            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1">Candidate</p>
                            <p className="text-sm font-medium">{submittedCandidate?.name}</p>
                         </div>
                         <div className="text-right">
                            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1">University ID</p>
                            <p className="text-sm font-mono">{submittedCandidate?.rollNumber}</p>
                         </div>
                      </div>
                      <div className="pt-4 border-t border-primary/10 flex items-center justify-center gap-2 text-emerald-500/80 font-medium text-xs">
                         <ShieldAlert className="h-3 w-3" />
                         Transmission Finalized & Locked
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="pb-10 pt-2 px-8 flex flex-col gap-4">
                    <Button 
                      variant="outline" 
                      onClick={() => setIsAlreadySubmitted(false)}
                      className="w-full h-12 border-border/40 hover:bg-muted/50 gap-2 font-medium"
                    >
                      <ArrowLeft className="h-4 w-4" /> Switch Account
                    </Button>
                    <p className="text-[10px] text-muted-foreground leading-relaxed italic">
                      If you believe this is an error, please contact your drive coordinator immediately. Duplicate attempts are strictly prohibited under drive policy.
                    </p>
                  </CardFooter>
               </Card>
            ) : isConcurrentSession ? (
              <Card className="border-destructive/30 bg-card/40 backdrop-blur-2xl shadow-2xl overflow-hidden relative text-center">
                  <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-destructive/50 via-primary/50 to-destructive/50" />
                  <CardHeader className="pt-10 pb-6">
                    <div className="h-16 w-16 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center mb-6 mx-auto">
                      <ShieldAlert className="h-8 w-8 text-destructive animate-pulse" />
                    </div>
                    <CardTitle className="text-2xl font-bold tracking-tight text-foreground">Concurrency Lock</CardTitle>
                    <CardDescription className="text-muted-foreground mt-3 px-4">
                      Security Alert: An active session for this candidate is already running on another device or browser tab.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pb-8">
                    <div className="p-6 rounded-2xl bg-destructive/5 border border-destructive/10 space-y-4">
                      <p className="text-sm text-foreground/80 leading-relaxed">
                        To maintain assessment integrity, multiple simultaneous logins are prohibited. 
                      </p>
                      <div className="pt-4 border-t border-destructive/10 text-xs text-muted-foreground italic">
                        Session will auto-expire after 2 minutes of inactivity. Please close other tabs and try again.
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="pb-10 pt-2 px-8 flex flex-col gap-4">
                    <Button 
                      variant="outline" 
                      onClick={() => setIsConcurrentSession(false)}
                      className="w-full h-12 border-border/40 hover:bg-muted/50 font-medium"
                    >
                      Back to Login
                    </Button>
                  </CardFooter>
               </Card>
            ) : isNotStarted ? (
               <Card className="border-primary/30 bg-card/40 backdrop-blur-2xl shadow-2xl overflow-hidden relative text-center">
                  <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-primary/50 via-accent/50 to-primary/50" />
                  <CardHeader className="pt-10 pb-6">
                    <div className="h-16 w-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mb-6 mx-auto">
                      <Clock className="h-8 w-8 text-primary animate-pulse" />
                    </div>
                    <CardTitle className="text-2xl font-bold tracking-tight text-foreground">Admission Pending</CardTitle>
                    <CardDescription className="text-muted-foreground mt-3 px-4">
                      {scheduledStartTime || "The assessment drive is scheduled for a future window and has not opened yet."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pb-10 px-8 flex flex-col items-center">
                     <div className="h-2 w-full bg-muted rounded-full overflow-hidden mb-6">
                        <div className="h-full w-1/3 bg-primary animate-[loading_2s_infinite_ease-in-out]" />
                     </div>
                     <Button 
                       variant="outline" 
                       onClick={() => setIsNotStarted(false)}
                       className="w-full h-11 border-border/40"
                    >
                       Acknowledge
                    </Button>
                  </CardContent>
               </Card>
            ) : (
               <Card className="border-border/30 bg-card/40 backdrop-blur-2xl shadow-2xl overflow-hidden relative">
                 <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
                 
                 <CardHeader className="pt-8 pb-6 flex flex-col items-center text-center">
                   <div className="h-12 w-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
                     <Lock className="h-6 w-6 text-primary" />
                   </div>
                   <CardTitle className="text-2xl font-medium tracking-tight">Exam Portal Authentication</CardTitle>
                   <CardDescription className="text-muted-foreground mt-2 px-6">
                     Verify your identity using the access PIN generated during registration.
                   </CardDescription>
                 </CardHeader>
                 
                 <CardContent>
                   <form id="exam-login" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                     {error && (
                       <motion.div 
                         initial={{ opacity: 0, height: 0 }}
                         animate={{ opacity: 1, height: "auto" }}
                         className="bg-destructive/10 border border-destructive/20 text-destructive text-sm p-3 rounded-lg text-center"
                       >
                         {error}
                       </motion.div>
                     )}
                     
                     <div className="space-y-2">
                       <Label className="text-foreground/70">Candidate Email</Label>
                       <Input 
                         type="email" 
                         placeholder="Enter verified email" 
                         className="bg-input/50 h-12"
                         disabled={isLoggingIn}
                         {...form.register("email")}
                       />
                     </div>
                     <div className="space-y-2">
                       <Label className="text-foreground/70">6-Digit Access PIN</Label>
                       <Input 
                         type="text" 
                         inputMode="numeric"
                         maxLength={6}
                         placeholder="••••••" 
                         className="bg-input/50 h-12 text-center tracking-[0.5em] font-mono text-lg"
                         disabled={isLoggingIn}
                         {...form.register("pin")}
                       />
                     </div>
                   </form>
                 </CardContent>
                 
                 <CardFooter className="pb-8">
                   <Button 
                     type="submit" 
                     form="exam-login" 
                     disabled={isLoggingIn}
                     className="w-full h-12 text-base shadow-lg shadow-primary/10 transition-transform active:scale-[0.98]"
                   >
                     {isLoggingIn ? "Verifying..." : "Authenticate"}
                   </Button>
                 </CardFooter>
               </Card>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="pre-exam-checks"
            initial={{ opacity: 0, scale: 0.95, filter: "blur(4px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="w-full max-w-lg z-10"
          >
            <Card className="border-primary/20 bg-card/60 backdrop-blur-3xl shadow-2xl relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-1 bg-primary animate-pulse-slow" />
              
              <CardHeader className="pt-10 pb-4 text-center">
                <ShieldAlert className="h-12 w-12 text-primary mx-auto mb-4 opacity-80" />
                <CardTitle className="text-2xl font-medium">Authentication Successful</CardTitle>
                <CardDescription className="text-muted-foreground mt-2">
                  Read the instructions carefully before beginning the examination.
                </CardDescription>
              </CardHeader>
              
              <CardContent className="px-8 pb-8 space-y-4">
                <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-5 space-y-3">
                  <h4 className="font-semibold text-destructive flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4" /> Anti-Cheat Enforced
                  </h4>
                  <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
                    <li>This test is monitored via browser visibility APIs.</li>
                    <li>Switching tabs or minimizing the window is recorded.</li>
                    <li>Copy, paste, and right-click functions are disabled.</li>
                    <li>The exam requires full-screen mode to begin.</li>
                  </ul>
                </div>
                
                <p className="text-center text-sm text-foreground/70 pb-2">
                  By clicking 'Start', you agree to abide by the academic integrity policy.
                </p>
                
                <Button 
                  onClick={startExam}
                  className="w-full h-14 text-lg bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-3 transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Maximize className="h-5 w-5" />
                  <span>Enter Fullscreen & Start Exam</span>
                  <Play className="h-4 w-4 ml-2 fill-current" />
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
