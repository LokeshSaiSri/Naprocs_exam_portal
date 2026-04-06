"use client";

import { useState, useEffect, useMemo } from "react";
import { 
  Settings as SettingsIcon, 
  Shield, 
  Clock, 
  Save, 
  Loader2, 
  AlertCircle, 
  Calendar,
  Briefcase,
  Database,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert
} from "lucide-react";
import { format, differenceInDays, addDays, startOfDay, isWithinInterval, parseISO } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

// --- Types ---
interface Drive {
  _id: string;
  title: string;
  slug: string;
  regStart: string;
  regEnd: string;
  examStart: string;
  examEnd: string;
  examDuration: number;
  proctoringSeverity: 'LOW' | 'MEDIUM' | 'HIGH';
  maxCheatWarnings: number;
  mcqCount: number;
  codingCount: number;
}

interface AppSettings {
  isExamActive: boolean;
  driveTitle: string; // Master title or fallback
}

// --- Visual Components ---

/**
 * Visual Gantt-style Timeline for a single drive
 */
const DriveTimeline = ({ drive, rangeStart, totalMs }: { drive: Drive, rangeStart: Date, totalMs: number }) => {
  const regStart = new Date(drive.regStart);
  const regEnd = new Date(drive.regEnd);
  const examStart = new Date(drive.examStart);
  const examEnd = new Date(drive.examEnd);

  const getPos = (date: Date) => {
    const diff = date.getTime() - rangeStart.getTime();
    return (diff / totalMs) * 100;
  };

  const regLeft = Math.max(0, getPos(regStart));
  const regRight = getPos(regEnd);
  const regWidth = Math.max(0.5, regRight - regLeft); // Minimum width for visibility
  
  const examLeft = Math.max(0, getPos(examStart));
  const examRight = getPos(examEnd);
  const examWidth = Math.max(0.5, examRight - examLeft);

  return (
    <div className="relative h-6 w-full bg-muted/20 rounded-full overflow-hidden border border-border/40 group">
      {/* Registration Bar */}
      <div 
        className="absolute h-full bg-sky-500/30 border-x border-sky-500/50 flex items-center px-1"
        style={{ left: `${regLeft}%`, width: `${regWidth}%` }}
      >
        <span className="text-[8px] font-bold text-sky-600 truncate opacity-0 group-hover:opacity-100 transition-opacity">REG</span>
      </div>
      
      {/* Exam Bar */}
      <div 
        className="absolute h-full bg-indigo-500/40 border-x border-indigo-500/70 flex items-center px-1"
        style={{ left: `${examLeft}%`, width: `${examWidth}%` }}
      >
        <span className="text-[8px] font-bold text-indigo-700 truncate opacity-0 group-hover:opacity-100 transition-opacity">EXAM</span>
      </div>

      {/* Markers */}
      <div className="absolute h-full w-[1px] bg-foreground/20 left-1/2 -ml-[0.5px]" />
    </div>
  );
};

export default function MasterSchedulePage() {
  // State
  const [drives, setDrives] = useState<Drive[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [modifiedIds, setModifiedIds] = useState<Set<string>>(new Set());
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [mountedAt] = useState(new Date());

  // Timeline Range Logic
  const timelineRange = useMemo(() => {
    const start = startOfDay(addDays(mountedAt, -2));
    const end = addDays(start, 35); // 5 weeks total
    const totalMs = end.getTime() - start.getTime();
    const days = differenceInDays(end, start);
    
    // Generate scale markers
    const markers = [];
    for(let i=0; i<=days; i+=7) {
      markers.push(addDays(start, i));
    }
    
    return { start, end, days, totalMs, markers };
  }, [mountedAt]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [settingsRes, drivesRes] = await Promise.all([
        fetch('/api/admin/settings'),
        fetch('/api/admin/drives')
      ]);
      
      const settingsData = await settingsRes.json();
      const drivesData = await drivesRes.json();
      
      if (settingsData.success) setSettings(settingsData.settings);
      if (drivesData.success) setDrives(drivesData.drives);
    } catch (e) {
      console.error("Data ingestion failure");
    } finally {
      setIsLoading(false);
    }
  };

  const updateDriveField = (id: string, field: keyof Drive, value: any) => {
    setDrives(prev => prev.map(d => {
      if (d._id !== id) return d;
      
      const newDrive = { ...d, [field]: value };
      
      // Auto-calculate duration if timing changes
      if (field === 'examStart' || field === 'examEnd') {
         const start = new Date(newDrive.examStart);
         const end = new Date(newDrive.examEnd);
         if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
            const diffMs = end.getTime() - start.getTime();
            newDrive.examDuration = Math.max(0, Math.floor(diffMs / (1000 * 60)));
         }
      }
      
      return newDrive;
    }));
    setModifiedIds(prev => new Set(prev).add(id));
  };

  const handleGlobalToggle = async (active: boolean) => {
    if (!settings) return;
    const newSettings = { ...settings, isExamActive: active };
    setSettings(newSettings);
    
    try {
      await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      });
    } catch (e) { console.error(e); }
  };

  const syncModifiedDrives = async () => {
    setIsSyncing(true);
    try {
      const modifiedDrives = drives.filter(d => modifiedIds.has(d._id));
      await Promise.all(modifiedDrives.map(drive => 
        fetch(`/api/admin/drives/${drive._id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(drive)
        })
      ));
      setModifiedIds(new Set());
    } catch (e) {
      console.error("Batch synchronization failure");
    } finally {
      setIsSyncing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 md:p-10 max-w-7xl mx-auto w-full space-y-8 animate-in fade-in duration-700 selection:bg-primary/20">
      
      {/* Header Area */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div className="space-y-2">
          <h1 className="text-4xl font-semibold tracking-tighter flex items-center gap-3 bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/60">
            <Calendar className="h-10 w-10 text-primary" /> Master Recruitment Schedule
          </h1>
          <p className="text-muted-foreground text-sm font-medium">
            Visualizing and managing overlapping recruitment batches across the next 30 days.
          </p>
        </div>

        <div className="flex items-center gap-4">
           <AnimatePresence>
             {modifiedIds.size > 0 && (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, scale: 0.9 }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs font-bold"
                >
                  <AlertTriangle className="h-3 w-3" /> {modifiedIds.size} Pending Changes
                </motion.div>
             )}
           </AnimatePresence>

           <Button 
             onClick={syncModifiedDrives} 
             disabled={isSyncing || modifiedIds.size === 0}
             className="min-w-[180px] h-12 shadow-2xl shadow-primary/20 font-bold active:scale-95 transition-all"
           >
             {isSyncing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
             Commit Overhaul
           </Button>
        </div>
      </div>

      {/* Master Overview Card */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Global Controls */}
        <Card className="border-border/40 bg-card/40 backdrop-blur-xl shadow-xl flex flex-col justify-between">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <Shield className="h-4 w-4 text-emerald-500" /> Operational Control
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 flex-1">
              <div className="flex items-center justify-between p-4 rounded-2xl bg-background/40 border border-border/20">
                <div className="space-y-1">
                  <p className="text-xs font-bold uppercase tracking-tight">Master Kill Switch</p>
                  <p className="text-[10px] text-muted-foreground font-medium">Override all drive schedules</p>
                </div>
                <Switch 
                  checked={settings?.isExamActive} 
                  onCheckedChange={handleGlobalToggle}
                  className="data-[state=checked]:bg-emerald-500"
                />
              </div>
              
              {!settings?.isExamActive && (
                 <div className="flex items-center gap-3 p-4 rounded-2xl bg-destructive/10 border border-destructive/20 animate-pulse">
                    <AlertCircle className="h-5 w-5 text-destructive" />
                    <p className="text-[10px] font-bold text-destructive uppercase">Global Access Blocked</p>
                 </div>
              )}
            </CardContent>
        </Card>

        {/* Dynamic Timeline Canvas */}
        <Card className="lg:col-span-3 border-border/40 bg-card/40 backdrop-blur-xl shadow-xl overflow-hidden">
           <CardHeader className="pb-2 border-b border-border/40 bg-muted/20">
              <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                 <span>Rolling 30-Day Gantt Forecast</span>
                 <div className="flex gap-4">
                    <span className="flex items-center gap-1"><div className="h-2 w-2 rounded-full bg-sky-500/50" /> Registration</span>
                    <span className="flex items-center gap-1"><div className="h-2 w-2 rounded-full bg-indigo-500/50" /> Assessment</span>
                 </div>
              </div>
           </CardHeader>
           <CardContent className="p-0">
              <div className="relative pt-6 pb-2">
                 {/* Timeline Scale */}
                 <div className="flex justify-between px-6 mb-4">
                   {timelineRange.markers.map((m, i) => (
                     <div key={i} className="flex flex-col items-center">
                        <div className="h-2 w-[1px] bg-border/60 mb-1" />
                        <span className="text-[9px] font-mono text-muted-foreground/60">{format(m, 'MMM dd')}</span>
                     </div>
                   ))}
                 </div>

                 {/* Drive Rows */}
                 <div className="space-y-2 px-6">
                    {drives.map(drive => (
                      <div key={drive._id} className="grid grid-cols-12 gap-4 items-center group">
                        <div className="col-span-3 text-[10px] font-bold text-foreground/70 truncate group-hover:text-primary transition-colors">
                          {drive.title}
                        </div>
                        <div className="col-span-9">
                          <DriveTimeline drive={drive} rangeStart={timelineRange.start} totalMs={timelineRange.totalMs} />
                        </div>
                      </div>
                    ))}
                 </div>
                 
                 {/* Current Date Vertical Indicator */}
                  <div 
                    className="absolute top-0 bottom-0 w-[2.5px] bg-primary/40 pointer-events-none z-10 shadow-[0_0_10px_rgba(var(--primary),0.5)]"
                    style={{ left: `${((new Date().getTime() - timelineRange.start.getTime()) / timelineRange.totalMs) * 100}%` }}
                  >
                    <div className="bg-primary text-[8px] font-bold text-white px-1.5 py-0.5 rounded-full absolute -top-1 left-1/2 -translate-x-1/2 shadow-lg">NOW</div>
                 </div>
              </div>
           </CardContent>
        </Card>
      </div>

      {/* Master Configuration Matrix */}
      <Card className="border-border/40 bg-card/10 backdrop-blur-3xl shadow-2xl overflow-hidden">
         <CardHeader className="border-b border-border/40 bg-card/40">
            <div className="flex items-center gap-4">
               <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
                  <Database className="h-5 w-5 text-primary" />
               </div>
               <div>
                  <CardTitle className="text-xl font-bold tracking-tight">Session Configuration Matrix</CardTitle>
                  <CardDescription>Batch update parameters for overlapping recruitment flows.</CardDescription>
               </div>
            </div>
         </CardHeader>
         <CardContent className="p-0">
            <div className="overflow-x-auto">
               <table className="w-full text-left border-collapse min-w-[1000px]">
                  <thead>
                     <tr className="bg-muted/5 font-bold text-[10px] uppercase tracking-widest text-muted-foreground/60 border-b border-border/40">
                        <th className="px-6 py-4">Drive Instance</th>
                        <th className="px-6 py-4">Registration Window (IST)</th>
                        <th className="px-6 py-4">Assessment Window (IST)</th>
                        <th className="px-6 py-4">Duration</th>
                        <th className="px-6 py-4">Security Governance</th>
                        <th className="px-6 py-4 text-center">Pooling (MCQ/Code)</th>
                        <th className="px-6 py-4">Status</th>
                     </tr>
                  </thead>
                  <tbody>
                     {drives.map(drive => {
                        const isModified = modifiedIds.has(drive._id);
                        return (
                           <tr key={drive._id} className={`border-b border-border/20 transition-colors ${isModified ? 'bg-amber-500/[0.03]' : 'hover:bg-muted/10'}`}>
                              <td className="px-6 py-4">
                                 <p className="font-bold text-foreground text-sm flex items-center gap-2">
                                    {drive.title}
                                    {isModified && <div className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />}
                                 </p>
                                 <p className="text-[10px] font-mono text-muted-foreground uppercase opacity-60">/{drive.slug}</p>
                              </td>
                              
                               <td className="px-6 py-4">
                                 <div className="flex flex-col gap-2">
                                    <Input 
                                       type="datetime-local" 
                                       value={drive.regStart ? format(new Date(drive.regStart), "yyyy-MM-dd'T'HH:mm") : ""} 
                                       onChange={(e) => updateDriveField(drive._id, 'regStart', e.target.value)}
                                       className="h-9 text-[11px] bg-background/50 border-border/40 font-mono w-[180px]"
                                    />
                                    <Input 
                                       type="datetime-local" 
                                       value={drive.regEnd ? format(new Date(drive.regEnd), "yyyy-MM-dd'T'HH:mm") : ""} 
                                       onChange={(e) => updateDriveField(drive._id, 'regEnd', e.target.value)}
                                       className="h-9 text-[11px] bg-background/50 border-border/40 font-mono w-[180px]"
                                    />
                                 </div>
                              </td>

                              <td className="px-6 py-4">
                                 <div className="flex flex-col gap-2">
                                    <Input 
                                       type="datetime-local" 
                                       value={drive.examStart ? format(new Date(drive.examStart), "yyyy-MM-dd'T'HH:mm") : ""} 
                                       onChange={(e) => updateDriveField(drive._id, 'examStart', e.target.value)}
                                       className="h-9 text-[11px] bg-indigo-500/5 border-indigo-500/20 font-mono w-[180px]"
                                    />
                                    <Input 
                                       type="datetime-local" 
                                       value={drive.examEnd ? format(new Date(drive.examEnd), "yyyy-MM-dd'T'HH:mm") : ""} 
                                       onChange={(e) => updateDriveField(drive._id, 'examEnd', e.target.value)}
                                       className="h-9 text-[11px] bg-indigo-500/5 border-indigo-500/20 font-mono w-[180px]"
                                    />
                                 </div>
                              </td>

                               <td className="px-6 py-4">
                                  <div className="flex flex-col gap-2 w-[120px]">
                                     <div className="flex bg-muted/20 rounded-lg p-0.5 border border-border/40">
                                        {['LOW', 'MED', 'HIGH'].map((s) => {
                                           const fullS = s === 'MED' ? 'MEDIUM' : s;
                                           const active = drive.proctoringSeverity === fullS;
                                           return (
                                              <button 
                                                key={s}
                                                onClick={() => updateDriveField(drive._id, 'proctoringSeverity', fullS)}
                                                className={`flex-1 text-[8px] font-bold py-1 rounded-md transition-all ${active ? 'bg-destructive text-white shadow-lg' : 'text-muted-foreground hover:bg-muted'}`}
                                              >
                                                 {s}
                                              </button>
                                           );
                                        })}
                                     </div>
                                     <div className="flex items-center gap-2">
                                        <div className="relative flex-1">
                                           <Input 
                                              type="number" 
                                              value={drive.maxCheatWarnings} 
                                              onChange={(e) => updateDriveField(drive._id, 'maxCheatWarnings', parseInt(e.target.value))}
                                              className="h-8 text-[10px] font-bold bg-background/50 border-destructive/20 text-destructive text-center pr-6"
                                           />
                                           <ShieldAlert className="h-3 w-3 text-destructive/40 absolute right-2 top-1/2 -translate-y-1/2" />
                                        </div>
                                        <span className="text-[8px] font-bold text-muted-foreground uppercase">Warns</span>
                                     </div>
                                  </div>
                               </td>

                              <td className="px-6 py-4">
                                 <div className="flex items-center justify-center gap-3">
                                    <div className="space-y-1 flex flex-col items-center">
                                       <Input 
                                          type="number" 
                                          value={drive.mcqCount} 
                                          onChange={(e) => updateDriveField(drive._id, 'mcqCount', parseInt(e.target.value))}
                                          className="h-9 w-16 text-center font-bold bg-background/50 border-border/40"
                                       />
                                       <span className="text-[8px] font-bold text-muted-foreground uppercase">MCQ</span>
                                    </div>
                                    <div className="space-y-1 flex flex-col items-center">
                                       <Input 
                                          type="number" 
                                          value={drive.codingCount} 
                                          onChange={(e) => updateDriveField(drive._id, 'codingCount', parseInt(e.target.value))}
                                          className="h-9 w-16 text-center font-bold bg-background/50 border-border/40"
                                       />
                                       <span className="text-[8px] font-bold text-muted-foreground uppercase">Code</span>
                                    </div>
                                 </div>
                              </td>

                              <td className="px-6 py-4">
                                 {isWithinInterval(new Date(), { start: parseISO(drive.examStart), end: parseISO(drive.examEnd) }) ? (
                                    <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 font-bold uppercase text-[9px] tracking-tight">Live Exam</Badge>
                                 ) : isWithinInterval(new Date(), { start: parseISO(drive.regStart), end: parseISO(drive.regEnd) }) ? (
                                    <Badge className="bg-sky-500/10 text-sky-500 border-sky-500/30 font-bold uppercase text-[9px] tracking-tight">Reg Open</Badge>
                                 ) : (
                                    <Badge variant="outline" className="text-muted-foreground font-bold uppercase text-[9px] tracking-tight">Idle / Pending</Badge>
                                 )}
                              </td>
                           </tr>
                        );
                     })}
                  </tbody>
               </table>
            </div>
         </CardContent>
      </Card>
      
    </div>
  );
}
