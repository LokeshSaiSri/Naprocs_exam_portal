"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { LockKeyhole, ArrowRight, ShieldCheck, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export default function AdminLogin() {
  const [passphrase, setPassphrase] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/auth/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase }),
      });

      if (res.ok) {
        router.push("/admin/drive");
      } else {
        const data = await res.json();
        setError(data.error || "Authentication blocked.");
      }
    } catch (err) {
      setError("Network or infrastructure failure.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center relative overflow-hidden">
      {/* Heavy aesthetic overlay generic noise logic */}
      <div className="absolute inset-0 bg-noise opacity-[0.05] pointer-events-none mix-blend-overlay" />
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-accent/20 rounded-full blur-[120px] pointer-events-none" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="z-10 w-full max-w-md px-6"
      >
        <div className="text-center mb-10 space-y-2">
          <div className="mx-auto w-16 h-16 bg-card border border-border/50 rounded-2xl flex items-center justify-center mb-6 shadow-2xl">
            <LockKeyhole className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-medium tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">
            Secure Entry Pipeline
          </h1>
          <p className="text-muted-foreground text-sm tracking-wide">
            Provide the master passphrase evaluating access control.
          </p>
        </div>

        <Card className="bg-card/40 backdrop-blur-2xl border-border/40 p-8 shadow-2xl overflow-hidden relative">
           <form onSubmit={handleAuth} className="space-y-6 relative z-10">
             
             <div className="space-y-2">
               <label className="text-xs uppercase tracking-widest font-semibold text-muted-foreground ml-1">
                 Access Passphrase
               </label>
               <Input 
                 type="password"
                 required
                 value={passphrase}
                 onChange={(e) => setPassphrase(e.target.value)}
                 className="h-14 bg-input/40 border-border/50 text-center tracking-[0.3em] font-mono focus-visible:ring-primary focus-visible:border-primary transition-all text-lg"
                 placeholder="••••••••••••"
               />
             </div>

             {error && (
               <motion.div 
                 initial={{ opacity: 0, height: 0 }} 
                 animate={{ opacity: 1, height: "auto" }}
                 className="bg-destructive/10 text-destructive border border-destructive/20 rounded-lg p-3 flex items-center gap-3 text-sm font-medium"
               >
                 <ShieldAlert className="h-4 w-4 shrink-0" />
                 {error}
               </motion.div>
             )}

             <Button 
               type="submit" 
               disabled={isSubmitting || !passphrase}
               className="w-full h-14 bg-primary text-primary-foreground font-semibold tracking-wide shadow-xl shadow-primary/20 hover:bg-primary/90 hover:scale-[1.02] transition-all"
             >
               {isSubmitting ? (
                 <div className="h-5 w-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
               ) : (
                 <>Initialize Auth Handshake <ArrowRight className="ml-2 h-4 w-4" /></>
               )}
             </Button>
           </form>

           {/* Generic glass shimmer effect */}
           <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent pointer-events-none" />
        </Card>
      </motion.div>
    </div>
  );
}
