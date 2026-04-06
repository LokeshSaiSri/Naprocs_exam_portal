"use client";

import { useState, useMemo, useEffect } from "react";
import { Search, SlidersHorizontal, ArrowRight, ShieldCheck, ShieldAlert, Award, FileSpreadsheet } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatToIST } from "@/lib/time";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type LeaderboardEntry = {
  id: string;
  name: string;
  rollNumber: string;
  score: number;
  warnings: number;
  timeTaken: string;
};

export default function LeaderboardPage() {
  const [search, setSearch] = useState("");
  const [cutoff, setCutoff] = useState<number[]>([70]);
  const [percentileFilter, setPercentileFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [candidates, setCandidates] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [drives, setDrives] = useState<any[]>([]);
  const [selectedDriveId, setSelectedDriveId] = useState<string>("all");

  useEffect(() => {
    fetchDrives();
    setIsMounted(true);
  }, []);

  useEffect(() => {
    fetchCandidates();
  }, [selectedDriveId]);

  const fetchDrives = async () => {
    try {
      const res = await fetch('/api/admin/drives');
      const data = await res.json();
      if (data.success) setDrives(data.drives);
    } catch (e) { console.error(e); }
  };

  const fetchCandidates = async () => {
    setIsLoading(true);
    try {
      const url = selectedDriveId === "all" ? '/api/admin/candidates' : `/api/admin/candidates?driveId=${selectedDriveId}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        // Map backend schema to UI component type
        const mapped: LeaderboardEntry[] = data.candidates.map((c: any) => ({
          id: c._id,
          name: c.name,
          rollNumber: c.collegeRollNumber,
          score: c.examScore || 0,
          warnings: c.cheatWarnings || 0,
          timeTaken: "Completed", // Placeholder as exact duration wasn't stored in basic schema yet
        }));
        setCandidates(mapped);
      }
    } catch (e) {
      console.error("Leaderboard Ingestion Fault", e);
    } finally {
      setIsLoading(false);
    }
  };

  // Sorting descending by score
  const sortedData = useMemo(() => {
    return [...candidates].sort((a, b) => b.score - a.score);
  }, [candidates]);

  // Filtering Logic
  const filteredData = useMemo(() => {
    return sortedData.filter((entry, index) => {
      // 1. Search filter
      const matchesSearch = entry.rollNumber.toLowerCase().includes(search.toLowerCase()) || 
                             entry.name.toLowerCase().includes(search.toLowerCase());
      if (!matchesSearch) return false;

      // 2. Cutoff filter
      const meetsCutoff = entry.score >= cutoff[0];
      if (!meetsCutoff) return false;

      // 3. Percentile filter
      if (percentileFilter === "top10") {
        return index < Math.ceil(sortedData.length * 0.1);
      }
      if (percentileFilter === "top20") {
        return index < Math.ceil(sortedData.length * 0.2);
      }

      return true;
    });
  }, [sortedData, search, cutoff, percentileFilter]);

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filteredData.map(d => d.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const toggleSelect = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) newSelected.add(id);
    else newSelected.delete(id);
    setSelectedIds(newSelected);
  };

  const currentSelectionCount = selectedIds.size;
  const isAllSelected = filteredData.length > 0 && currentSelectionCount === filteredData.length;

  const handleBulkMove = async () => {
    if (selectedIds.size === 0) return;
    
    setIsProcessing(true);
    try {
      const res = await fetch('/api/admin/candidates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          candidateIds: Array.from(selectedIds), 
          stage: 'TECH_ROUND' 
        })
      });

      const data = await res.json();
      if (res.ok) {
        // Success State
        setSelectedIds(new Set());
        fetchCandidates(); // Resync local roster
      } else {
        alert(`Transition Error: ${data.error || "Persistence Fault"}`);
      }
    } catch (e) {
      console.error("Bulk Transition Exception:", e);
      alert("Network or Protocol Error during bulk transition.");
    } finally {
      setIsProcessing(false);
    }
  };

  const generatePDFExport = () => {
    if (filteredData.length === 0) return;

    const doc = new jsPDF();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("Naprocs Intelligence: Global Leaderboard", 14, 22);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated exactly at: ${formatToIST(new Date())}`, 14, 30);
    doc.text(`Active Cutoff: ${cutoff[0]}% | Tier: ${percentileFilter}`, 14, 36);

    const tableData = filteredData.map((c, i) => [
      `#${i + 1}`,
      c.name,
      c.rollNumber,
      `${c.score}%`,
      c.warnings === 0 ? "Verified" : `${c.warnings} Flags`
    ]);

    autoTable(doc, {
      startY: 42,
      head: [['Rank', 'Identify', 'University ID', 'Final Score', 'Integrity Status']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [46, 204, 113], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [240, 255, 240] }
    });

    doc.save(`Naprocs_Leaderboard_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const exportAsJSON = () => {
    const dataStr = JSON.stringify(filteredData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = 'leaderboard_export.json';
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  return (
    <div className="flex-1 p-6 md:p-10 max-w-7xl mx-auto w-full space-y-8 animate-in fade-in zoom-in duration-500 relative z-10">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-medium tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-emerald-500 to-primary flex items-center gap-3">
            <Award className="h-8 w-8 text-emerald-500 hidden md:block" />
            Global Leaderboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Ranked compilation of completed assessments. Apply dynamic filters to generate the final shortlist.
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger className={cn(buttonVariants({ variant: "outline" }), "border-border/50 bg-card/40 backdrop-blur-md shadow-sm")}>
            <FileSpreadsheet className="h-4 w-4 mr-2" /> Export View
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 bg-card/95 backdrop-blur-xl border-border/40">
            <DropdownMenuItem onClick={() => {}}>Export as CSV</DropdownMenuItem>
            <DropdownMenuItem onClick={exportAsJSON}>Export as JSON</DropdownMenuItem>
            <DropdownMenuItem 
              onClick={generatePDFExport}
              className="text-emerald-500 font-medium focus:bg-emerald-500/10 focus:text-emerald-500"
            >
              Export PDF Roster
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center gap-3 bg-card/40 backdrop-blur-md p-4 rounded-xl border border-border/40 w-fit">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mr-2">Filter By Drive:</p>
          <Select value={selectedDriveId} onValueChange={(val: any) => setSelectedDriveId(val)}>
             <SelectTrigger className="w-[280px] h-9 text-xs font-semibold">
                <SelectValue placeholder="All Recruitment Batches" />
             </SelectTrigger>
             <SelectContent>
                <SelectItem value="all">All Recruitment Batches</SelectItem>
                {drives.map(d => (
                   <SelectItem key={d._id} value={d._id}>{d.title}</SelectItem>
                ))}
             </SelectContent>
          </Select>
      </div>

      {/* Advanced Filters Bar */}
      <Card className="border-border/40 bg-card/60 backdrop-blur-xl shadow-xl">
        <CardContent className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-12 gap-8 items-center border-t-2 border-primary/50">
          
          <div className="md:col-span-4 space-y-3">
             <label className="text-xs uppercase tracking-widest font-semibold text-muted-foreground flex justify-between">
              <span>Dynamic Cutoff Score</span>
              <span className="text-primary font-mono bg-primary/10 px-2 rounded-sm border border-primary/20">{(cutoff && Array.isArray(cutoff)) ? cutoff[0] : 0}%</span>
            </label>
            <div className="pt-2">
              {isMounted && (
                <Slider 
                  value={cutoff} 
                  onValueChange={(val: any) => setCutoff(Array.isArray(val) ? val : [val])} 
                  max={100} 
                  step={1} 
                  className="[&_[role=slider]]:bg-primary [&_[role=slider]]:h-5 [&_[role=slider]]:w-5" 
                />
              )}
            </div>
          </div>

          <div className="md:col-span-3 space-y-3">
            <label className="text-xs uppercase tracking-widest font-semibold text-muted-foreground">Percentile Filter</label>
            <Select value={percentileFilter} onValueChange={(val) => setPercentileFilter(val || "all")}>
              <SelectTrigger className="w-full bg-input/50 border-border/50 focus:ring-primary/50">
                <SelectValue placeholder="Select Tier" />
              </SelectTrigger>
              <SelectContent className="bg-card/95 backdrop-blur border-border/40">
                <SelectItem value="all">Unfiltered Roster</SelectItem>
                <SelectItem value="top20">Top 20% Candidates</SelectItem>
                <SelectItem value="top10">Top 10% Candidates</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="md:col-span-5 space-y-3">
            <label className="text-xs uppercase tracking-widest font-semibold text-muted-foreground">Search Identification</label>
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search by candidate name or CS-Roll..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-input/50 border-border/50 transition-colors focus-visible:ring-primary/50"
              />
            </div>
          </div>

        </CardContent>
      </Card>

      {/* Interactive Data Table Area */}
      <div className="space-y-4">
        
        {/* Bulk Action Context Menu */}
        <AnimatePresence>
          {currentSelectionCount > 0 && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-primary/10 border border-primary/30 rounded-xl p-4 flex items-center justify-between shadow-lg shadow-primary/5">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-mono font-bold text-sm">
                    {currentSelectionCount}
                  </div>
                  <span className="font-medium text-primary">Candidates Selected</span>
                </div>
                <Button 
                  onClick={handleBulkMove} 
                  disabled={isProcessing}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20 transition-transform active:scale-95"
                >
                  {isProcessing ? "Processing Transition..." : (
                    <>Move to Tech Round Pipeline <ArrowRight className="h-4 w-4 ml-2" /></>
                  )}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <Card className="border-border/40 bg-card/20 backdrop-blur-xl shadow-2xl relative overflow-hidden text-sm">
          <Table>
            <TableHeader className="bg-muted/20 border-b border-border/40">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-12 text-center py-4">
                  <Checkbox 
                    checked={isAllSelected} 
                    onCheckedChange={toggleSelectAll} 
                    aria-label="Select all"
                    className="border-primary/50 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                  />
                </TableHead>
                <TableHead className="w-16 text-center text-muted-foreground font-semibold">Rank</TableHead>
                <TableHead className="w-[240px] font-semibold text-muted-foreground uppercase tracking-widest text-xs">Candidate Trace</TableHead>
                <TableHead className="font-semibold text-muted-foreground uppercase tracking-widest text-xs text-center">Final Score</TableHead>
                <TableHead className="font-semibold text-muted-foreground uppercase tracking-widest text-xs text-center">Integrity Status</TableHead>
                <TableHead className="text-right font-semibold text-muted-foreground uppercase tracking-widest text-xs px-6">Timestamp</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-48 text-center text-muted-foreground">
                    <SlidersHorizontal className="h-10 w-10 mx-auto mb-3 opacity-20" />
                    No candidates match the current aggressive filter constraints.
                  </TableCell>
                </TableRow>
              ) : (
                filteredData.map((candidate, index) => {
                  const isSelected = selectedIds.has(candidate.id);
                  const isTop3 = index < 3;
                  
                  return (
                    <TableRow 
                      key={candidate.id} 
                      className={`border-border/30 transition-colors group ${isSelected ? 'bg-primary/5' : 'hover:bg-muted/30'}`}
                    >
                      <TableCell className="text-center">
                        <Checkbox 
                          checked={isSelected} 
                          onCheckedChange={(c) => toggleSelect(candidate.id, c as boolean)} 
                          aria-label={`Select ${candidate.name}`}
                          className="border-border/50 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                        />
                      </TableCell>
                      <TableCell className="text-center font-mono">
                        {isTop3 ? (
                          <div className={`mx-auto h-7 w-7 rounded-full flex items-center justify-center font-bold text-background ${index === 0 ? 'bg-amber-400' : index === 1 ? 'bg-zinc-300' : 'bg-amber-600'}`}>
                            {index + 1}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">#{index + 1}</span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium py-3">
                        <div className="flex flex-col">
                          <span className={isTop3 ? 'text-emerald-500 font-bold' : 'text-foreground/90'}>
                            {candidate.name}
                          </span>
                          <span className="font-mono text-[10px] text-muted-foreground mt-0.5 tracking-wider">
                            {candidate.rollNumber}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`text-xl font-bold tracking-tighter ${isTop3 ? 'text-emerald-500 text-2xl' : 'text-foreground'}`}>
                          {candidate.score}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center">
                          {candidate.warnings === 0 ? (
                            <div className="bg-emerald-500/10 text-emerald-500 p-1.5 rounded-lg border border-emerald-500/20 shadow-inner flex items-center gap-2 pr-3" title="Clean record">
                              <ShieldCheck className="h-4 w-4" /> <span className="text-[10px] uppercase font-bold tracking-widest">Verified</span>
                            </div>
                          ) : (
                            <div className="bg-destructive/10 text-destructive p-1.5 rounded-lg border border-destructive/20 flex items-center gap-1.5 font-bold tracking-wide" title={`${candidate.warnings} Warnings`}>
                              <ShieldAlert className="h-4 w-4" /> {candidate.warnings} <span className="text-[10px] uppercase font-semibold">Flags</span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right px-6 font-mono text-muted-foreground text-xs">
                        {candidate.timeTaken}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

    </div>
  );
}
