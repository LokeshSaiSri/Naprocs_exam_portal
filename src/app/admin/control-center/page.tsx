"use client";

import { useState, useEffect } from "react";
import { 
  Activity, Users, Clock, AlertTriangle, Search, 
  RotateCcw, Power, ShieldCheck, PlayCircle, 
  PauseCircle, RefreshCw, Loader2, UserCheck
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { motion, AnimatePresence } from "framer-motion";

export default function ExamControlCenter() {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Real-time polling for candidates
  const fetchData = async () => {
    try {
      const cRes = await fetch('/api/admin/candidates');
      const cData = await cRes.json();
      if (cData.success) setCandidates(cData.candidates);
    } catch (e) {
      console.error("Control Center Data Sync Fault");
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000); // 10s auto-refresh
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => {
      clearInterval(interval);
      clearInterval(timer);
    };
  }, []);

  const handleReset = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to RESET ${name}'s attempt? This will clear their current score and flags.`)) return;
    
    setIsSyncing(true);
    try {
      const res = await fetch(`/api/admin/candidates/${id}/reset`, { method: 'POST' });
      if (res.ok) fetchData();
    } catch (e) {
      console.error("Reset Fault");
    } finally {
      setIsSyncing(false);
    }
  };

  // Derive live monitor stats
  const activeNow = candidates.filter(c => {
    if (!c.lastActiveAt) return false;
    const lastSeen = new Date(c.lastActiveAt).getTime();
    return (Date.now() - lastSeen) < 120000; // Active if seen in last 2 mins
  }).length;

  const completedToday = candidates.filter(c => c.stage === 'EXAM_COMPLETED').length;
  const anomaliesCount = candidates.reduce((acc, c) => acc + (c.cheatWarnings || 0), 0);

  const filteredCandidates = candidates.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.collegeRollNumber.toLowerCase().includes(searchQuery.toLowerCase())
  ).sort((a, b) => {
    // Sort by active status first
    const aActive = a.lastActiveAt && (Date.now() - new Date(a.lastActiveAt).getTime()) < 120000;
    const bActive = b.lastActiveAt && (Date.now() - new Date(b.lastActiveAt).getTime()) < 120000;
    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;
    return 0;
  });

  if (isLoading) return (
    <div className="flex-1 flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-10 w-10 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground animate-pulse font-medium">Synchronizing Mission Control...</p>
      </div>
    </div>
  );

  return (
    <div className="flex-1 p-6 md:p-10 max-w-7xl mx-auto w-full space-y-8 animate-in fade-in duration-700 relative z-10">
      
      {/* Dynamic Header with Master Kill Switch */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 bg-card/40 backdrop-blur-xl border border-border/40 p-8 rounded-3xl shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        
        <div className="space-y-4 relative z-10">
          <h1 className="text-4xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/60">
            Exam Control Center
          </h1>
          <p className="text-sm text-muted-foreground max-w-md">
            Monitor real-time candidate vitals, manage active sessions, and synchronize drive-wide security.
          </p>
        </div>
      </div>

      {/* Live Vitals Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="border-border/40 bg-card/40 backdrop-blur-xl shadow-xl overflow-hidden group">
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-primary/10 border border-primary/20 text-primary group-hover:scale-110 transition-transform">
                 <Activity className="h-5 w-5" />
              </div>
              <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-tighter bg-emerald-500/5 border-emerald-500/20 text-emerald-500">Live</Badge>
            </div>
            <div className="space-y-1">
              <h3 className="text-3xl font-bold tracking-tight">{activeNow}</h3>
              <p className="text-xs font-medium text-muted-foreground">Active Sessions</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/40 bg-card/40 backdrop-blur-xl shadow-xl overflow-hidden group">
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-accent/10 border border-accent/20 text-accent group-hover:scale-110 transition-transform">
                 <UserCheck className="h-5 w-5" />
              </div>
            </div>
            <div className="space-y-1">
              <h3 className="text-3xl font-bold tracking-tight">{completedToday}</h3>
              <p className="text-xs font-medium text-muted-foreground">Total Completions</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/40 bg-card/40 backdrop-blur-xl shadow-xl overflow-hidden group">
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-destructive/10 border border-destructive/20 text-destructive group-hover:scale-110 transition-transform">
                 <AlertTriangle className="h-5 w-5" />
              </div>
              {anomaliesCount > 0 && <span className="flex h-2 w-2 rounded-full bg-destructive animate-ping" />}
            </div>
            <div className="space-y-1">
              <h3 className="text-3xl font-bold tracking-tight">{anomaliesCount}</h3>
              <p className="text-xs font-medium text-muted-foreground">Anomalies Detected</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/40 bg-card/40 backdrop-blur-xl shadow-xl overflow-hidden group">
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-muted border border-border/40 text-muted-foreground group-hover:scale-110 transition-transform">
                 <Clock className="h-5 w-5" />
              </div>
            </div>
            <div className="space-y-1">
              <h3 className="text-xl font-bold tracking-tight">{currentTime.toLocaleTimeString()}</h3>
              <p className="text-xs font-medium text-muted-foreground">System Clock</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Candidate Management Dashboard */}
      <Card className="border-border/40 bg-card/40 backdrop-blur-xl shadow-2xl">
        <CardHeader className="border-b border-border/40 pb-6">
           <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="space-y-1">
                <CardTitle className="text-xl font-bold">Session Monitoring Grid</CardTitle>
                <CardDescription>Directly intervene in candidate sessions and grant re-entry.</CardDescription>
              </div>
              
              <div className="flex items-center gap-3 w-full md:w-auto">
                 <div className="relative flex-1 md:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input 
                      placeholder="Search Roll No / Name..." 
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="pl-9 bg-background/40 border-border/40 h-10 text-xs"
                    />
                 </div>
                 <Button variant="outline" size="icon" onClick={() => { setIsSyncing(true); fetchData(); }} className="h-10 w-10 shrink-0">
                    <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                 </Button>
              </div>
           </div>
        </CardHeader>
        <CardContent className="p-0">
           <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                 <thead className="bg-muted/30 text-[10px] uppercase font-bold tracking-widest">
                    <tr>
                       <th className="p-4 px-6 border-b border-border/40">Candidate</th>
                       <th className="p-4 border-b border-border/40">Roll Number</th>
                       <th className="p-4 border-b border-border/40">Current Vitals</th>
                       <th className="p-4 border-b border-border/40">Progress</th>
                       <th className="p-4 px-6 border-b border-border/40 text-right">Actions</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-border/40">
                    <AnimatePresence mode="popLayout">
                       {filteredCandidates.map((c) => {
                          const isActive = c.lastActiveAt && (Date.now() - new Date(c.lastActiveAt).getTime()) < 120000;
                          return (
                             <motion.tr 
                               key={c._id}
                               initial={{ opacity: 0 }}
                               animate={{ opacity: 1 }}
                               exit={{ opacity: 0 }}
                               className="hover:bg-muted/20 transition-colors group"
                             >
                                <td className="p-4 px-6">
                                   <div className="flex items-center gap-3">
                                      <div className={`h-2 w-2 rounded-full ${isActive ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)] animate-pulse' : 'bg-muted-foreground/30'}`} />
                                      <div className="space-y-0.5">
                                         <p className="font-semibold text-foreground">{c.name}</p>
                                         <p className="text-[10px] text-muted-foreground font-mono">{c.email}</p>
                                      </div>
                                   </div>
                                </td>
                                <td className="p-4">
                                   <span className="font-mono text-xs bg-muted/50 px-2 py-1 rounded border border-border/40">{c.collegeRollNumber}</span>
                                </td>
                                <td className="p-4">
                                   <div className="flex flex-wrap gap-2">
                                      <Badge variant="outline" className={`text-[9px] uppercase font-bold tracking-tighter ${c.stage === 'EXAM_COMPLETED' ? 'bg-emerald-500/5 text-emerald-500 border-emerald-500/20' : 'bg-primary/5 text-primary border-primary/20'}`}>
                                         {c.stage.replace('_', ' ')}
                                      </Badge>
                                      {c.cheatWarnings > 0 && (
                                         <Badge variant="outline" className="text-[9px] uppercase font-bold tracking-tighter bg-destructive/5 text-destructive border-destructive/20 flex items-center gap-1">
                                            <ShieldCheck className="h-2.5 w-2.5" /> Flags: {c.cheatWarnings}
                                         </Badge>
                                      )}
                                   </div>
                                </td>
                                <td className="p-4">
                                   <div className="flex items-center gap-2">
                                      <div className="h-1.5 w-24 bg-muted rounded-full overflow-hidden">
                                         <div 
                                           className={`h-full transition-all duration-1000 ${c.stage === 'EXAM_COMPLETED' ? 'bg-emerald-500' : 'bg-primary'}`} 
                                           style={{ width: c.stage === 'EXAM_COMPLETED' ? '100%' : '15%' }} 
                                         />
                                      </div>
                                      <span className="text-[10px] text-muted-foreground font-bold">{c.stage === 'EXAM_COMPLETED' ? '100%' : '15%'}</span>
                                   </div>
                                </td>
                                <td className="p-4 px-6 text-right">
                                   <Button 
                                     variant="ghost" 
                                     size="sm" 
                                     onClick={() => handleReset(c._id, c.name)}
                                     disabled={isSyncing}
                                     className="h-8 text-[10px] font-bold uppercase tracking-tighter hover:bg-primary/10 hover:text-primary gap-2"
                                   >
                                      <RotateCcw className="h-3 w-3" /> Reset Attempt
                                   </Button>
                                </td>
                             </motion.tr>
                          );
                       })}
                    </AnimatePresence>
                 </tbody>
              </table>
              {filteredCandidates.length === 0 && (
                 <div className="p-20 text-center space-y-3">
                    <UserCheck className="h-12 w-12 text-muted-foreground mx-auto opacity-20" />
                    <p className="text-sm text-muted-foreground italic">No candidates found matching the current link parameters.</p>
                 </div>
              )}
           </div>
        </CardContent>
      </Card>
    </div>
  );
}
