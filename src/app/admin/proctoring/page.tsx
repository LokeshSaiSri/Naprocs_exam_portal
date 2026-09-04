"use client";

import { useState, useEffect } from "react";
import { Video, ShieldAlert, Camera, Trash2, Loader2 } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROCTORING_FLAG_TYPES as FLAG_TYPES, PROCTORING_FLAG_BY_EVENT_TYPE as FLAG_BY_EVENT_TYPE } from "@/lib/proctoringFlags";
import { ProctoringLightbox } from "@/components/proctoring/ProctoringLightbox";

// Admin views poll rather than requiring a manual refresh -- matches the
// existing setInterval(fetchData, 10000) idiom in admin/control-center/page.tsx.
const ADMIN_POLL_INTERVAL_MS = 30_000;

export default function ProctoringOverview() {
  const [drives, setDrives] = useState<any[]>([]);
  const [selectedDriveId, setSelectedDriveId] = useState<string>("");
  const [roster, setRoster] = useState<any[]>([]);
  const [isLoadingRoster, setIsLoadingRoster] = useState(false);

  const [galleryCandidate, setGalleryCandidate] = useState<any | null>(null);
  const [galleryEvents, setGalleryEvents] = useState<any[] | null>(null);
  const [isLoadingGallery, setIsLoadingGallery] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/drives");
        const data = await res.json();
        if (data.success && data.drives?.length > 0) {
          setDrives(data.drives);
          // Default to the first drive with webcam proctoring on, else the first drive overall.
          const preferred = data.drives.find((d: any) => d.webcamProctoringEnabled) || data.drives[0];
          setSelectedDriveId(preferred._id);
        }
      } catch (e) {
        console.error("Drive list fetch failure", e);
      }
    })();
  }, []);

  // Live-ish roster: poll every 30s while a drive is selected, instead of
  // requiring a manual page refresh to see new snapshots/flags land.
  useEffect(() => {
    if (!selectedDriveId) return;
    let cancelled = false;
    const fetchRoster = (showLoading: boolean) => {
      if (showLoading) setIsLoadingRoster(true);
      fetch(`/api/admin/drives/${selectedDriveId}/proctoring-summary`)
        .then((res) => res.json())
        .then((data) => {
          if (!cancelled && data.success) setRoster(data.candidates || []);
        })
        .catch((e) => console.error("Proctoring summary fetch failure", e))
        .finally(() => {
          if (!cancelled) setIsLoadingRoster(false);
        });
    };
    fetchRoster(true);
    const interval = setInterval(() => fetchRoster(false), ADMIN_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [selectedDriveId]);

  const fetchGalleryEvents = async (candidateId: string) => {
    try {
      const res = await fetch(`/api/admin/candidates/${candidateId}/proctoring`);
      const data = await res.json();
      if (data.success) setGalleryEvents(data.events);
    } catch (e) {
      console.error("Gallery fetch failure", e);
    }
  };

  const openGallery = async (candidate: any) => {
    setGalleryCandidate(candidate);
    setGalleryEvents(null);
    setIsLoadingGallery(true);
    await fetchGalleryEvents(candidate._id);
    setIsLoadingGallery(false);
  };

  // Poll the open gallery too -- an admin watching one candidate mid-exam
  // should see new snapshots land without reopening the dialog. Paused while
  // the lightbox is open: events sort newest-first, so a mid-view refetch
  // would shift indices and jump the viewer to a different image.
  useEffect(() => {
    if (!galleryCandidate || lightboxIndex !== null) return;
    const interval = setInterval(() => fetchGalleryEvents(galleryCandidate._id), ADMIN_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [galleryCandidate, lightboxIndex]);

  const purgeGallery = async () => {
    if (!galleryCandidate) return;
    setIsPurging(true);
    try {
      const res = await fetch(`/api/admin/candidates/${galleryCandidate._id}/proctoring`, { method: "DELETE" });
      if (res.ok) {
        setGalleryEvents([]);
        setRoster((prev) =>
          prev.map((c) =>
            c._id === galleryCandidate._id
              ? { ...c, snapshotCount: 0, noFace: 0, multipleFaces: 0, lookingAway: 0, highNoise: 0 }
              : c
          )
        );
      }
    } catch (e) {
      console.error("Purge failure", e);
    } finally {
      setIsPurging(false);
    }
  };

  const selectedDrive = drives.find((d) => d._id === selectedDriveId);
  const totalSnapshots = roster.reduce((acc, c) => acc + (c.snapshotCount || 0), 0);
  const totalFlags = roster.reduce((acc, c) => acc + (c.noFace || 0) + (c.multipleFaces || 0) + (c.lookingAway || 0) + (c.highNoise || 0), 0);
  const flaggedCandidates = roster.filter((c) => (c.noFace || 0) + (c.multipleFaces || 0) + (c.lookingAway || 0) + (c.highNoise || 0) > 0);
  const highestRisk = [...flaggedCandidates].sort(
    (a, b) =>
      (b.noFace + b.multipleFaces + b.lookingAway + b.highNoise) - (a.noFace + a.multipleFaces + a.lookingAway + a.highNoise)
  )[0];

  return (
    <div className="flex-1 p-6 md:p-10 max-w-7xl mx-auto w-full space-y-8 animate-in fade-in duration-700 relative z-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 bg-card/40 backdrop-blur-xl border border-border/40 p-8 rounded-3xl shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="space-y-3 relative z-10">
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-1.5">
            <Camera className="h-3 w-3" /> Proctoring Overview
          </p>
          <h1 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/60">
            {selectedDrive?.title || "Select a drive"}
          </h1>
          <p className="text-sm text-muted-foreground max-w-md">
            Webcam &amp; microphone monitoring across every candidate in this drive.
          </p>
        </div>
        <div className="relative z-10 w-full md:w-72">
          <Select
            items={drives.map((d) => ({ value: d._id, label: `${d.title}${d.webcamProctoringEnabled ? "" : " (webcam off)"}` }))}
            value={selectedDriveId}
            onValueChange={(v) => setSelectedDriveId(v || "")}
          >
            <SelectTrigger className="h-11 bg-background/40 border-border/40">
              <SelectValue placeholder="Select a drive" />
            </SelectTrigger>
            <SelectContent>
              {drives.map((d) => (
                <SelectItem key={d._id} value={d._id}>
                  {d.title} {d.webcamProctoringEnabled ? "" : "(webcam off)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedDrive && !selectedDrive.webcamProctoringEnabled && (
        <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 text-sm text-amber-500 flex items-center gap-3">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          Webcam proctoring is turned off for this drive -- enable it from Recruitment Drives or Settings to start collecting snapshots.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="border-border/40 bg-card/40 backdrop-blur-xl shadow-xl">
          <CardContent className="p-6">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Candidates Monitored</p>
            <h3 className="text-3xl font-bold tracking-tight mt-2">{roster.length}</h3>
          </CardContent>
        </Card>
        <Card className="border-border/40 bg-card/40 backdrop-blur-xl shadow-xl">
          <CardContent className="p-6">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Total Snapshots</p>
            <h3 className="text-3xl font-bold tracking-tight mt-2">{totalSnapshots.toLocaleString()}</h3>
          </CardContent>
        </Card>
        <Card className="border-border/40 bg-card/40 backdrop-blur-xl shadow-xl">
          <CardContent className="p-6">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Flags</p>
            <h3 className={`text-3xl font-bold tracking-tight mt-2 ${totalFlags > 0 ? "text-destructive" : ""}`}>{totalFlags}</h3>
          </CardContent>
        </Card>
        <Card className="border-border/40 bg-card/40 backdrop-blur-xl shadow-xl">
          <CardContent className="p-6">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Highest-Risk Candidate</p>
            <h3 className="text-base font-bold tracking-tight mt-3 truncate">
              {highestRisk ? highestRisk.name : "None"}
              {highestRisk && (
                <span className="text-destructive font-mono text-sm ml-2">
                  · {highestRisk.noFace + highestRisk.multipleFaces + highestRisk.lookingAway + highestRisk.highNoise} flags
                </span>
              )}
            </h3>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/40 bg-card/40 backdrop-blur-xl shadow-2xl">
        <CardContent className="p-0">
          {isLoadingRoster ? (
            <div className="h-40 flex items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading roster...
            </div>
          ) : roster.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-muted-foreground text-sm italic">
              No candidates registered for this drive yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/30 text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
                  <tr>
                    <th className="p-4 px-6 border-b border-border/40">Candidate</th>
                    <th className="p-4 border-b border-border/40">Roll No.</th>
                    <th className="p-4 border-b border-border/40 text-center">Snapshots</th>
                    {FLAG_TYPES.map((f) => (
                      <th key={f.key} className="p-4 border-b border-border/40 text-center">
                        <span className="inline-flex items-center gap-1"><f.icon className="h-3 w-3" /> {f.label}</span>
                      </th>
                    ))}
                    <th className="p-4 px-6 border-b border-border/40 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {roster.map((c) => {
                    const totalCandidateFlags = c.noFace + c.multipleFaces + c.lookingAway + c.highNoise;
                    return (
                      <tr key={c._id} className="hover:bg-muted/20 transition-colors">
                        <td className="p-4 px-6">
                          <p className="font-semibold text-foreground">{c.name}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{c.email}</p>
                        </td>
                        <td className="p-4">
                          <span className="font-mono text-xs bg-muted/50 px-2 py-1 rounded border border-border/40">
                            {c.collegeRollNumber}
                          </span>
                        </td>
                        <td className="p-4 text-center font-semibold">{c.snapshotCount}</td>
                        {FLAG_TYPES.map((f) => (
                          <td key={f.key} className="p-4 text-center">
                            {c[f.key] > 0 ? (
                              <Badge variant="destructive" className="text-[10px] font-bold">{c[f.key]}</Badge>
                            ) : (
                              <span className="text-muted-foreground/40 text-xs">0</span>
                            )}
                          </td>
                        ))}
                        <td className="p-4 px-6 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {totalCandidateFlags === 0 && (
                              <span className="inline-flex items-center gap-1.5 text-emerald-500 text-xs font-semibold">
                                <ShieldAlert className="h-3.5 w-3.5" /> Clean
                              </span>
                            )}
                            {c.snapshotCount > 0 && (
                              <Button variant={totalCandidateFlags > 0 ? "outline" : "ghost"} size="sm" className="h-8 gap-1.5" onClick={() => openGallery(c)}>
                                <Video className="h-3.5 w-3.5" /> {totalCandidateFlags > 0 ? "Gallery" : ""}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!galleryCandidate} onOpenChange={(o) => !o && setGalleryCandidate(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Video className="h-5 w-5 text-accent" /> {galleryCandidate?.name} -- Proctoring Gallery
            </DialogTitle>
          </DialogHeader>

          {isLoadingGallery ? (
            <div className="h-40 flex items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading snapshots...
            </div>
          ) : galleryEvents && galleryEvents.length > 0 ? (
            <>
              <div className="flex items-center justify-between pb-3 border-b border-border/40">
                <p className="text-xs text-muted-foreground">
                  <span className="font-bold text-foreground">{galleryEvents.length}</span> snapshots ·{" "}
                  <span className="font-bold text-destructive">{galleryEvents.filter((e) => e.eventType !== "SNAPSHOT").length}</span> flags
                </p>
                <Button variant="destructive" size="sm" disabled={isPurging} onClick={purgeGallery} className="h-8 text-[10px] font-bold uppercase tracking-widest gap-1.5">
                  <Trash2 className="h-3 w-3" /> {isPurging ? "Purging..." : "Purge Snapshots"}
                </Button>
              </div>
              <div className="grid grid-cols-4 gap-3 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
                {galleryEvents.map((ev) => {
                  const flag = FLAG_BY_EVENT_TYPE[ev.eventType];
                  const isFlag = !!flag;
                  const Icon = flag?.icon || Camera;
                  return (
                    <button
                      key={ev._id}
                      type="button"
                      onClick={() => setLightboxIndex(galleryEvents.indexOf(ev))}
                      className={`relative aspect-[4/3] rounded-lg overflow-hidden border-2 bg-black/40 cursor-zoom-in transition-transform hover:scale-[1.03] ${isFlag ? "border-destructive" : "border-border/30"}`}
                    >
                      {ev.snapshotUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={ev.snapshotUrl} alt={flag?.label || "Snapshot"} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                          <Video className="h-5 w-5" />
                        </div>
                      )}
                      <span className={`absolute bottom-1 left-1 flex items-center gap-1 text-[7px] font-bold uppercase px-1 rounded bg-black/60 ${isFlag ? "text-destructive" : "text-foreground/70"}`}>
                        <Icon className="h-2 w-2" /> {flag?.label || "Snapshot"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-muted-foreground text-xs italic">No snapshots recorded for this candidate.</div>
          )}
        </DialogContent>
      </Dialog>

      {lightboxIndex !== null && galleryEvents && (
        <ProctoringLightbox events={galleryEvents} startIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}
    </div>
  );
}
