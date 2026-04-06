import Link from "next/link";
import { ArrowRight, BookOpen, ShieldCheck, GraduationCap } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden selection:bg-none">
      <div className="absolute inset-0 bg-noise opacity-[0.03] pointer-events-none z-0" />
      
      {/* Decorative Orbs */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-primary/10 blur-[120px] rounded-full mix-blend-screen pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-emerald-500/10 blur-[100px] rounded-full mix-blend-screen pointer-events-none" />

      <main className="max-w-4xl w-full z-10 text-center space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-1000">
        
        <div className="space-y-6">
          <div className="mx-auto w-max px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-sm font-medium tracking-wide flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Secure Examination Environment
          </div>
          <h1 className="text-5xl md:text-7xl font-semibold tracking-tighter bg-clip-text text-transparent bg-gradient-to-br from-foreground to-foreground/50">
            Naprocs Placement Portal
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            The next generation platform for university recruitment. Seamless candidate registration, uncompromising integrity monitoring, and live telemetry.
          </p>
        </div>

        <div className="flex justify-center pt-8">
          
          {/* Main Entry: Exam Environment */}
          <Link href="/exam" className="group max-w-sm w-full">
            <div className="relative h-full text-left p-8 rounded-2xl border border-border/50 bg-card/40 backdrop-blur-xl transition-all duration-300 hover:bg-card/60 hover:-translate-y-1 hover:shadow-2xl hover:shadow-accent/5 hover:border-accent/30 overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-accent/10 blur-[50px] rounded-full group-hover:bg-accent/20 transition-colors" />
              <div className="h-12 w-12 rounded-xl bg-background border border-border/60 flex items-center justify-center mb-6 shadow-sm">
                <BookOpen className="h-6 w-6 text-foreground/80 group-hover:text-accent transition-colors" />
              </div>
              <h3 className="text-xl font-medium tracking-tight mb-2">Exam Environment</h3>
              <p className="text-sm text-muted-foreground mb-8">
                Strict, monitored testing suite featuring Monaco IDE, anti-cheat visibility detection, and lock-down mode.
              </p>
              <div className="flex items-center text-sm font-medium text-accent mt-auto">
                Enter Exam <ArrowRight className="h-4 w-4 ml-1 transform group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </Link>

        </div>
      </main>
    </div>
  );
}
