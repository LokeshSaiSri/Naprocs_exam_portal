"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

// Proctoring Overview was merged into the unified Live Monitoring page
// (admin/control-center) -- it now shows webcam flags/snapshots alongside
// activity/stage/cheat-warnings in one place, plus a "who's currently
// writing" filter this page never had. This stays as a thin redirect so any
// existing bookmark/external link (including admin/drives/page.tsx's old
// "Proctoring" card link) still lands somewhere correct instead of 404ing.
function ProctoringRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const driveId = searchParams.get("driveId");
    router.replace(driveId ? `/admin/control-center?driveId=${driveId}` : "/admin/control-center");
  }, [router, searchParams]);

  return (
    <div className="flex-1 flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-10 w-10 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground animate-pulse font-medium">
          Proctoring Overview has moved to Live Monitoring -- redirecting...
        </p>
      </div>
    </div>
  );
}

export default function ProctoringOverview() {
  return (
    <Suspense fallback={null}>
      <ProctoringRedirect />
    </Suspense>
  );
}
