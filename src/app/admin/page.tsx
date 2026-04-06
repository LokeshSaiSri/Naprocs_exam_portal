"use client";

import { useState, useEffect } from "react";
import { Users, AlertTriangle, BookOpen, Clock, TrendingUp, Activity, ArrowUpRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { motion } from "framer-motion";

export default function AdminDashboardOverview() {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/admin/candidates');
        const data = await res.json();
        if (data.success) {
          setCandidates(data.candidates);
        }
      } catch (e) {
        console.error("Dashboard Stats Ingestion Failure", e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchStats();
  }, []);

  // Compute live metrics from the aggregate pool
  const totalEnrolled = candidates.length;
  const activeExams = candidates.filter(c => c.stage === 'EXAM_PENDING').length;
  const integrityFlags = candidates.reduce((acc, c) => acc + (c.cheatWarnings || 0), 0);
  const completedExams = candidates.filter(c => c.stage !== 'EXAM_PENDING').length;

  const METRICS = [
    {
      title: "Enrolled Candidates",
      value: totalEnrolled.toLocaleString(),
      icon: <Users className="h-5 w-5 text-primary" />,
      color: "bg-primary/10 border-primary/20",
    },
    {
      title: "Active Pipelines",
      value: activeExams.toLocaleString(),
      icon: <Activity className="h-5 w-5 text-emerald-500" />,
      color: "bg-emerald-500/10 border-emerald-500/20",
    },
    {
      title: "Completed Quotas",
      value: completedExams.toLocaleString(),
      icon: <Clock className="h-5 w-5 text-accent" />,
      color: "bg-accent/10 border-accent/20",
    },
    {
      title: "Integrity Flags",
      value: integrityFlags.toLocaleString(),
      icon: <AlertTriangle className="h-5 w-5 text-destructive" />,
      color: "bg-destructive/10 border-destructive/20",
    },
  ];

  const recentAnomalies = candidates
    .filter(c => (c.cheatWarnings || 0) > 0)
    .sort((a, b) => (b.cheatWarnings || 0) - (a.cheatWarnings || 0))
    .slice(0, 4);

  // Dynamic Chart Logic: Distribution Across Active Pipelines
  const getStageDistribution = () => {
    const counts = {
      'PENDING': candidates.filter(c => c.stage === 'EXAM_PENDING').length,
      'COMPLETED': candidates.filter(c => c.stage === 'EXAM_COMPLETED').length,
      'TECH': candidates.filter(c => c.stage === 'TECH_ROUND').length,
      'HR': candidates.filter(c => c.stage === 'HR_ROUND').length,
      'OFFERED': candidates.filter(c => c.stage === 'SELECTED').length,
    };
    const max = Math.max(...Object.values(counts), 1);
    return [
      { label: 'Pending', value: counts.PENDING, height: (counts.PENDING / max) * 100 },
      { label: 'Completed', value: counts.COMPLETED, height: (counts.COMPLETED / max) * 100 },
      { label: 'Technical', value: counts.TECH, height: (counts.TECH / max) * 100 },
      { label: 'HR Round', value: counts.HR, height: (counts.HR / max) * 100 },
      { label: 'Offered', value: counts.OFFERED, height: (counts.OFFERED / max) * 100 },
    ];
  };

  const chartData = getStageDistribution();

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { type: "spring" as const, stiffness: 300, damping: 24 },
    },
  };

  return (
    <div className="flex-1 p-6 md:p-10 max-w-7xl mx-auto w-full space-y-8 relative z-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-medium tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/60">
            System Overview
          </h1>
          <p className="text-sm text-muted-foreground">
            Aggregate placement metrics and drive vitals for the current semester.
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <Link href="/admin/drive">
            <Button variant="outline" className="border-border/50 bg-card/40 backdrop-blur-md shadow-sm">
              View Telemetry <ArrowUpRight className="h-4 w-4 ml-2 opacity-50" />
            </Button>
          </Link>
          <Link href="/admin/questions">
            <Button className="bg-primary text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:scale-[1.02]">
              Draft Assessments <BookOpen className="h-4 w-4 ml-2 opacity-80" />
            </Button>
          </Link>
        </div>
      </div>

      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pt-4"
      >
        {METRICS.map((metric, i) => (
          <motion.div key={i} variants={itemVariants}>
            <Card className="border-border/40 bg-card/40 backdrop-blur-xl shadow-xl overflow-hidden relative group">
              <div className={`absolute top-0 right-0 w-24 h-24 rounded-bl-full opacity-10 transition-transform group-hover:scale-110 ${metric.color}`} />
              <CardContent className="p-6 relative z-10">
                <div className="flex justify-between items-start mb-4">
                  <div className={`h-10 w-10 flex items-center justify-center rounded-xl border ${metric.color}`}>
                    {metric.icon}
                  </div>
                </div>
                <div className="space-y-1">
                  <h3 className="text-3xl font-bold tracking-tight">{isLoading ? "..." : metric.value}</h3>
                  <p className="text-sm font-medium text-muted-foreground">{metric.title}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.6 }}
        className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-4"
      >
        <Card className="lg:col-span-2 border-border/40 bg-card/40 backdrop-blur-xl shadow-xl">
          <CardHeader className="border-b border-border/40 pb-4">
            <CardTitle className="text-lg font-medium">Activity Statistics</CardTitle>
            <CardDescription>Live distribution across registration pools.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 h-[300px] flex items-end justify-between gap-2">
            {!isLoading && candidates.length === 0 ? (
               <div className="h-full w-full flex items-center justify-center text-muted-foreground text-sm italic">
                  No active telemetry signals found.
               </div>
            ) : (
              chartData.map((data, i) => (
                <div key={i} className="relative w-full group h-full flex flex-col items-center justify-end gap-3">
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 bg-card border border-border/40 px-2 py-1 rounded text-[10px] font-bold shadow-xl z-20">
                    {data.value} Candidates
                  </div>
                  <div 
                    className={`w-full max-w-[40px] bg-primary/20 rounded-t-lg transition-all duration-1000 group-hover:bg-primary/40 relative overflow-hidden`} 
                    style={{ height: `${Math.max(data.height, 4)}%` }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-transparent to-primary/30 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-tighter text-muted-foreground transition-colors group-hover:text-primary">{data.label}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-border/40 bg-card/40 backdrop-blur-xl shadow-xl">
          <CardHeader className="border-b border-border/40 pb-4">
            <CardTitle className="text-lg font-medium">Recent Anomalies</CardTitle>
            <CardDescription>Real-time integrity flags</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border/40">
              {recentAnomalies.length === 0 && (
                 <div className="p-10 text-center text-muted-foreground text-xs italic">
                    All candidates verified clean.
                 </div>
              )}
              {recentAnomalies.map((flag, i) => (
                <div key={i} className="p-4 flex flex-col gap-1 hover:bg-muted/30 transition-colors">
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-mono text-xs">{flag.collegeRollNumber}</span>
                    <span className="text-xs text-muted-foreground">{flag.name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {flag.cheatWarnings} Integrity Violations
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-border/40">
              <Link href="/admin/leaderboard">
                 <Button variant="ghost" className="w-full text-xs font-medium text-muted-foreground">Audit All Pipelines</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
