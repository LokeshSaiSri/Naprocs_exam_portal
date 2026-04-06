"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { 
  Plus, Briefcase, Calendar, Clock, ShieldCheck, Trash2, ArrowRight, ExternalLink, Link as LinkIcon, AlertTriangle, CheckCircle2 
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export default function DrivesManagement() {
  const [drives, setDrives] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [purgeTarget, setPurgeTarget] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    title: "",
    slug: "",
    examDuration: 60,
    passingCutoff: 70,
    proctoringSeverity: "MEDIUM",
    maxCheatWarnings: 3,
    mcqCount: 15,
    codingCount: 2,
    shuffleQuestions: true,
    shuffleOptions: true,
    regStart: "",
    regEnd: "",
    examStart: "",
    examEnd: ""
  });

  const fetchDrives = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/drives");
      const data = await res.json();
      if (data.success) {
        setDrives(data.drives);
      }
    } catch (err) {
      console.error("Fetch Data Error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDrives();
  }, []);

  const handleCreateDrive = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    try {
      const res = await fetch("/api/admin/drives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        setShowCreateDialog(false);
        fetchDrives();
        // Reset form
        setFormData({
          title: "", slug: "", examDuration: 60, passingCutoff: 70, 
          proctoringSeverity: "MEDIUM", maxCheatWarnings: 3, 
          mcqCount: 15, codingCount: 2, shuffleQuestions: true, shuffleOptions: true, 
          regStart: "", regEnd: "", examStart: "", examEnd: ""
        });
      }
    } catch (err) {
      console.error("Creation Fault:", err);
    } finally {
      setIsCreating(false);
    }
  };

  const handlePurge = async (id: string | null) => {
    if (!id) return;
    setIsPurging(true);
    try {
      const res = await fetch(`/api/admin/drives/${id}`, { method: "DELETE" });
      if (res.ok) {
        setPurgeTarget(null);
        fetchDrives();
      }
    } catch (err) {
      console.error("Purge Exception:", err);
    } finally {
      setIsPurging(false);
    }
  };

  const getStatusColor = (regStart: string, regEnd: string) => {
    const now = new Date();
    if (now < new Date(regStart)) return "border-amber-500/50 text-amber-500 bg-amber-500/5";
    if (now > new Date(regEnd)) return "border-destructive/50 text-destructive bg-destructive/5";
    return "border-emerald-500/50 text-emerald-500 bg-emerald-500/5";
  };

  const getStatusText = (regStart: string, regEnd: string) => {
    const now = new Date();
    if (now < new Date(regStart)) return "Pending";
    if (now > new Date(regEnd)) return "Closed";
    return "Accepting Registrations";
  };

  return (
    <div className="flex-1 p-6 md:p-10 max-w-7xl mx-auto w-full space-y-8 animate-in fade-in duration-700 relative z-10">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 pb-2">
        <div className="space-y-1">
          <h1 className="text-4xl font-semibold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/50">
            Recruitment Pipelines
          </h1>
          <p className="text-muted-foreground font-medium">
            Manage independent batches, university-specific windows, and proctoring levels.
          </p>
        </div>

        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger render={<Button className="bg-primary hover:bg-primary/90 text-primary-foreground h-12 px-6 rounded-xl shadow-xl shadow-primary/20 transition-all hover:scale-[1.02] active:scale-95" />}>
              <Plus className="h-5 w-5 mr-2" /> Initialize New Flow
          </DialogTrigger>
          <DialogContent className="max-w-2xl bg-card/95 backdrop-blur-xl border-border/40 max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                <Briefcase className="h-6 w-6 text-primary" /> Create Recruitment Drive
              </DialogTitle>
              <DialogDescription className="text-base">
                Configure scheduling, pooling targets, and anti-cheat thresholds.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreateDrive} className="space-y-6 pt-4">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2 col-span-2 md:col-span-1">
                  <Label>Drive Title (Identifier)</Label>
                  <Input 
                    placeholder="e.g. IIT Summer 2024" 
                    value={formData.title} 
                    onChange={e => setFormData({...formData, title: e.target.value})}
                    required
                    className="bg-input/20 h-11"
                  />
                </div>
                <div className="space-y-2 col-span-2 md:col-span-1">
                  <Label>URL Slug (Unique Path)</Label>
                  <Input 
                    placeholder="iit-summer-2024" 
                    value={formData.slug} 
                    onChange={e => setFormData({...formData, slug: e.target.value.toLowerCase().replace(/ /g, "-")})}
                    required
                    className="bg-input/20 h-11 font-mono text-sm"
                  />
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">reg link: /register/[slug]</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 p-5 rounded-2xl bg-muted/20 border border-border/40">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><Calendar className="h-4 w-4" /> Registration Opening</Label>
                  <Input 
                    type="datetime-local" 
                    value={formData.regStart} 
                    onChange={e => setFormData({...formData, regStart: e.target.value})}
                    required
                    className="bg-input/20 h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><Calendar className="h-4 w-4" /> Registration Deadline</Label>
                  <Input 
                    type="datetime-local" 
                    value={formData.regEnd} 
                    onChange={e => setFormData({...formData, regEnd: e.target.value})}
                    required
                    className="bg-input/20 h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><Clock className="h-4 w-4 text-emerald-500" /> Exam Start Window</Label>
                  <Input 
                    type="datetime-local" 
                    value={formData.examStart} 
                    onChange={e => setFormData({...formData, examStart: e.target.value})}
                    required
                    className="bg-input/20 h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><Clock className="h-4 w-4 text-destructive" /> Exam Close Window</Label>
                  <Input 
                    type="datetime-local" 
                    value={formData.examEnd} 
                    onChange={e => setFormData({...formData, examEnd: e.target.value})}
                    required
                    className="bg-input/20 h-10"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-primary"><ShieldCheck className="h-4 w-4" /> Proctoring Severity</Label>
                    <Select value={formData.proctoringSeverity} onValueChange={v => setFormData({...formData, proctoringSeverity: v as any})}>
                       <SelectTrigger className="h-11 bg-input/20">
                          <SelectValue />
                       </SelectTrigger>
                       <SelectContent>
                          <SelectItem value="LOW">Low Sensitivity</SelectItem>
                          <SelectItem value="MEDIUM">Moderated</SelectItem>
                          <SelectItem value="HIGH">Strict Auto-Submit</SelectItem>
                       </SelectContent>
                    </Select>
                 </div>
                 <div className="space-y-2">
                    <Label>MCQ Target</Label>
                    <Input 
                      type="number" 
                      value={formData.mcqCount} 
                      onChange={e => setFormData({...formData, mcqCount: parseInt(e.target.value)})}
                      className="bg-input/20 h-11"
                    />
                 </div>
                 <div className="space-y-2">
                    <Label>Coding Target</Label>
                    <Input 
                      type="number" 
                      value={formData.codingCount} 
                      onChange={e => setFormData({...formData, codingCount: parseInt(e.target.value)})}
                      className="bg-input/20 h-11"
                    />
                 </div>
              </div>

              <DialogFooter className="pt-4 border-t border-border/40">
                <Button variant="outline" type="button" onClick={() => setShowCreateDialog(false)} className="h-11 border-border/50">Cancel</Button>
                <Button type="submit" disabled={isCreating} className="h-11 px-8 animate-pulse-slow">
                  {isCreating ? "Initializing Flow..." : "Acknowledge & Deploy"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
           {[1,2,3].map(i => <div key={i} className="h-64 rounded-3xl bg-muted/20 animate-pulse" />)}
         </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {drives.map((drive) => (
              <motion.div 
                key={drive._id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="group"
              >
                <Card className="border-border/40 bg-card/40 backdrop-blur-xl shadow-xl hover:shadow-2xl transition-all duration-300 relative overflow-hidden h-full flex flex-col group-hover:border-primary/30">
                  <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-primary/40 via-accent/40 to-primary/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                  
                  <CardHeader className="pb-4">
                    <div className="flex justify-between items-start mb-4">
                       <Badge variant="outline" className={`px-3 py-1 rounded-full font-bold uppercase tracking-tighter text-[9px] ${getStatusColor(drive.regStart, drive.regEnd)}`}>
                         {getStatusText(drive.regStart, drive.regEnd)}
                       </Badge>
                       <div className="flex gap-2">
                         <TooltipProvider>
                           <Tooltip>
                             <TooltipTrigger>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10" onClick={() => {
                                   const link = `${window.location.origin}/register/${drive.slug}`;
                                   navigator.clipboard.writeText(link);
                                }}>
                                   <LinkIcon className="h-4 w-4" />
                                </Button>
                             </TooltipTrigger>
                             <TooltipContent side="top" className="text-xs">Copy Registration Link</TooltipContent>
                           </Tooltip>
                         </TooltipProvider>

                         <TooltipProvider>
                           <Tooltip>
                             <TooltipTrigger>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={() => setPurgeTarget(drive._id)}>
                                   <Trash2 className="h-4 w-4" />
                                </Button>
                             </TooltipTrigger>
                             <TooltipContent side="top" className="text-xs">Purge All Drive Content</TooltipContent>
                           </Tooltip>
                         </TooltipProvider>
                       </div>
                    </div>
                    <CardTitle className="text-2xl font-bold tracking-tight line-clamp-1">{drive.title}</CardTitle>
                    <CardDescription className="font-mono text-[10px] uppercase tracking-widest text-primary/80">Batch Slug: {drive.slug}</CardDescription>
                  </CardHeader>

                  <CardContent className="flex-grow space-y-5">
                    <div className="space-y-3">
                       <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-widest border-b border-border/40 pb-2">
                          <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> Lifecycle</span>
                          <span className="text-foreground">IST</span>
                       </div>
                       <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                             <p className="text-[10px] text-muted-foreground font-bold uppercase">Registration Opens</p>
                             <p className="text-xs font-medium">{format(new Date(drive.regStart), "MMM d, HH:mm")}</p>
                          </div>
                          <div className="space-y-1 text-right">
                             <p className="text-[10px] text-muted-foreground font-bold uppercase">Exam Starts</p>
                             <p className="text-xs font-medium">{format(new Date(drive.examStart), "MMM d, HH:mm")}</p>
                          </div>
                       </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                        <div className="bg-muted/30 p-2.5 rounded-xl border border-border/40 text-center space-y-0.5">
                           <p className="text-[9px] font-bold text-muted-foreground uppercase">MCQs</p>
                           <p className="text-sm font-bold text-primary">{drive.mcqCount}</p>
                        </div>
                        <div className="bg-muted/30 p-2.5 rounded-xl border border-border/40 text-center space-y-0.5">
                           <p className="text-[9px] font-bold text-muted-foreground uppercase">Algorithms</p>
                           <p className="text-sm font-bold text-accent">{drive.codingCount}</p>
                        </div>
                        <div className="bg-muted/30 p-2.5 rounded-xl border border-border/40 text-center space-y-0.5">
                           <p className="text-[9px] font-bold text-muted-foreground uppercase">Proct-Lvl</p>
                           <p className="text-[10px] font-bold text-foreground">{drive.proctoringSeverity}</p>
                        </div>
                    </div>
                  </CardContent>

                  <CardFooter className="pt-2 pb-6 flex gap-3">
                     <Link href={`/admin/questions?driveId=${drive._id}`} className="flex-1">
                        <Button variant="outline" className="w-full h-10 border-border/60 hover:bg-muted/50 gap-2 relative overflow-hidden transition-all group">
                           <Plus className="h-3.5 w-3.5" /> Questioning
                           <div className="absolute inset-0 bg-primary/10 translate-x-full group-hover:translate-x-0 transition-transform duration-300" />
                        </Button>
                     </Link>
                     <Link href="/admin/settings" className="flex-1">
                        <Button className="w-full h-10 gap-2 font-semibold shadow-lg shadow-primary/20">
                           View Matrix <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                     </Link>
                  </CardFooter>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Purge Confirmation Dialog */}
      <Dialog open={!!purgeTarget} onOpenChange={(o) => (!o && setPurgeTarget(null))}>
         <DialogContent className="border-destructive/30 bg-destructive/5 backdrop-blur-2xl sm:max-w-md">
            <DialogHeader className="pt-4 text-center">
               <div className="h-16 w-16 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center mb-6 mx-auto">
                  <AlertTriangle className="h-8 w-8 text-destructive animate-pulse" />
               </div>
               <DialogTitle className="text-2xl font-bold text-destructive tracking-tight">Destructive Operation</DialogTitle>
               <DialogDescription className="text-base text-foreground/80 mt-2">
                  This will PERMANENTLY purge the recruitment flow, all registered candidate profiles, their responses, and the specific question bank associated with it.
                  <br/><br/>
                  <span className="font-bold text-destructive">This action cannot be undone.</span>
               </DialogDescription>
            </DialogHeader>
            <DialogFooter className="sm:justify-center pb-2 pt-6 gap-3">
               <Button variant="outline" className="w-full h-12 border-border/50" onClick={() => setPurgeTarget(null)}>Cancel</Button>
               <Button variant="destructive" className="w-full h-12 font-bold shadow-2xl shadow-destructive/20" onClick={() => handlePurge(purgeTarget as string)} disabled={isPurging}>
                  {isPurging ? "Purging Matrix..." : "Purge Everything"}
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
    </div>
  );
}
