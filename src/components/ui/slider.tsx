"use client"

import * as React from "react"
import { motion, useMotionValue, useTransform } from "framer-motion"
import { cn } from "@/lib/utils"

interface SliderProps {
  className?: string;
  defaultValue?: number[];
  value?: number[];
  onValueChange?: (val: number[]) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}

/**
 * Premium Custom Slider built with Framer Motion to replace script-tag-injecting primitives.
 * High-performance, React 19 compatible, and visually enhanced for premium feel.
 */
function Slider({
  className,
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
}: SliderProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [isMounted, setIsMounted] = React.useState(false);

  // Sync state if controlled
  const currentValue = value?.[0] ?? min;

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled || !containerRef.current) return;
    updateValue(e.clientX);
    
    const handlePointerMove = (moveEvent: PointerEvent) => {
      updateValue(moveEvent.clientX);
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const updateValue = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const percentage = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const rawValue = min + percentage * (max - min);
    const steppedValue = Math.round(rawValue / step) * step;
    const finalValue = Math.max(min, Math.min(max, steppedValue));
    
    if (onValueChange) {
      onValueChange([finalValue]);
    }
  };

  if (!isMounted) return <div className={cn("h-5 w-full", className)} />;

  const percentage = ((currentValue - min) / (max - min)) * 100;

  return (
    <div 
      ref={containerRef}
      className={cn(
        "relative flex w-full touch-none items-center select-none py-2 cursor-pointer group",
        disabled && "opacity-50 pointer-events-none",
        className
      )}
      onPointerDown={handlePointerDown}
    >
      {/* Track Background */}
      <div className="relative h-1 w-full grow overflow-hidden rounded-full bg-muted/40 border border-border/5">
        {/* Active Range Indicator */}
        <motion.div 
          className="absolute h-full bg-primary shadow-[0_0_10px_rgba(var(--primary),0.3)]"
          initial={false}
          animate={{ width: `${percentage}%` }}
          transition={{ type: "spring", stiffness: 400, damping: 40 }}
        />
      </div>

      {/* Thumb */}
      <motion.div
        className={cn(
          "absolute block h-5 w-5 rounded-full border-2 border-primary bg-background shadow-xl ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 z-10",
          "hover:scale-110 active:scale-95 cursor-grab active:cursor-grabbing"
        )}
        initial={false}
        animate={{ left: `calc(${percentage}% - 10px)` }}
        transition={{ type: "spring", stiffness: 400, damping: 40 }}
      >
         {/* Premium micro-highlight inside thumb */}
         <div className="absolute inset-1 rounded-full bg-primary/20 animate-pulse-slow" />
      </motion.div>
    </div>
  )
}

export { Slider }
