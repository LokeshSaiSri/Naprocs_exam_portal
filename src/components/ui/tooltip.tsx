"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence, HTMLMotionProps } from "framer-motion"
import { cn } from "@/lib/utils"

interface TooltipTriggerProps extends React.HTMLAttributes<HTMLDivElement> {
  isOpen?: boolean;
}

interface TooltipContentProps extends HTMLMotionProps<"div"> {
  side?: "top" | "bottom" | "left" | "right";
  children?: React.ReactNode;
  triggerRef?: React.RefObject<HTMLDivElement | null>;
}

/**
 * Custom Tooltip Provider to maintain API compatibility with Radix/Base UI layouts.
 */
function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

/**
 * Custom Tooltip Root.
 */
function Tooltip({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLDivElement>(null);

  // Find Trigger and Content in children
  const trigger = React.Children.toArray(children).find(
    (child: any) => child.type === TooltipTrigger
  ) as React.ReactElement<TooltipTriggerProps>;

  const content = React.Children.toArray(children).find(
    (child: any) => child.type === TooltipContent
  ) as React.ReactElement<TooltipContentProps>;

  return (
    <div
      ref={triggerRef}
      className="relative inline-block"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onFocus={() => setIsOpen(true)}
      onBlur={() => setIsOpen(false)}
    >
      {trigger && React.cloneElement(trigger, { isOpen })}
      <AnimatePresence>
        {isOpen && content && React.cloneElement(content, { triggerRef })}
      </AnimatePresence>
    </div>
  );
}

function TooltipTrigger({ children, className, isOpen, ...props }: TooltipTriggerProps) {
  return (
    <div className={cn("inline-block", className)} {...props}>
      {children}
    </div>
  );
}

// Portals into document.body and positions itself off the trigger's live
// bounding rect. A card that clips its own decorative elements with
// overflow-hidden (needed for rounded-corner accents) would otherwise slice
// off any tooltip popping up near its edge -- portaling sidesteps that
// entirely instead of loosening overflow rules the card actually needs.
function TooltipContent({
  className,
  side = "top",
  children,
  triggerRef,
  ...props
}: TooltipContentProps) {
  const [coords, setCoords] = React.useState<{ top: number; left: number } | null>(null);

  React.useLayoutEffect(() => {
    const el = triggerRef?.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 8;
    switch (side) {
      case "top":
        setCoords({ top: rect.top - gap, left: rect.left + rect.width / 2 });
        break;
      case "bottom":
        setCoords({ top: rect.bottom + gap, left: rect.left + rect.width / 2 });
        break;
      case "left":
        setCoords({ top: rect.top + rect.height / 2, left: rect.left - gap });
        break;
      case "right":
        setCoords({ top: rect.top + rect.height / 2, left: rect.right + gap });
        break;
    }
  }, [triggerRef, side]);

  if (!coords || typeof document === "undefined") return null;

  const translateBySide = {
    top: "translate(-50%, -100%)",
    bottom: "translate(-50%, 0)",
    left: "translate(-100%, -50%)",
    right: "translate(0, -50%)",
  };

  return createPortal(
    // Plain div owns fixed positioning via a static transform; framer-motion
    // drives its own transform on the inner motion.div for the open/close
    // animation -- kept separate so the two transforms don't fight.
    <div
      style={{ position: "fixed", top: coords.top, left: coords.left, transform: translateBySide[side], zIndex: 100 }}
      className="pointer-events-none"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: side === "top" ? 5 : side === "bottom" ? -5 : 0 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: side === "top" ? 5 : side === "bottom" ? -5 : 0 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
        className={cn(
          "relative px-3 py-1.5 text-xs font-medium rounded-md bg-foreground text-background shadow-xl whitespace-nowrap",
          className
        )}
        {...props}
      >
        {children}
        {/* Tooltip Arrow */}
        <div
          className={cn(
            "absolute w-2 h-2 bg-foreground rotate-45",
            side === "top" && "bottom-[-4px] left-1/2 -translate-x-1/2",
            side === "bottom" && "top-[-4px] left-1/2 -translate-x-1/2",
            side === "left" && "right-[-4px] top-1/2 -translate-y-1/2",
            side === "right" && "left-[-4px] top-1/2 -translate-y-1/2",
          )}
        />
      </motion.div>
    </div>,
    document.body
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
