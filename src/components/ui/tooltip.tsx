"use client"

import * as React from "react"
import { motion, AnimatePresence, HTMLMotionProps } from "framer-motion"
import { cn } from "@/lib/utils"

interface TooltipProps {
  children: React.ReactNode;
  content: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
  delay?: number;
}

interface TooltipTriggerProps extends React.HTMLAttributes<HTMLDivElement> {
  isOpen?: boolean;
}

interface TooltipContentProps extends HTMLMotionProps<"div"> {
  side?: "top" | "bottom" | "left" | "right";
  children?: React.ReactNode;
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
  
  // Find Trigger and Content in children
  const trigger = React.Children.toArray(children).find(
    (child: any) => child.type === TooltipTrigger
  ) as React.ReactElement<TooltipTriggerProps>;

  const content = React.Children.toArray(children).find(
    (child: any) => child.type === TooltipContent
  ) as React.ReactElement<TooltipContentProps>;

  return (
    <div 
      className="relative inline-block"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onFocus={() => setIsOpen(true)}
      onBlur={() => setIsOpen(false)}
    >
      {trigger && React.cloneElement(trigger, { isOpen })}
      <AnimatePresence>
        {isOpen && content && React.cloneElement(content)}
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

function TooltipContent({
  className,
  side = "top",
  children,
  ...props
}: TooltipContentProps) {
  const positions = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: side === "top" ? 5 : -5 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: side === "top" ? 5 : -5 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className={cn(
        "absolute z-50 px-3 py-1.5 text-xs font-medium rounded-md bg-foreground text-background shadow-xl whitespace-nowrap pointer-events-none",
        positions[side as keyof typeof positions],
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
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
