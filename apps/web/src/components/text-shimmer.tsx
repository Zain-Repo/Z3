"use client";

import React, { useMemo, type Ref } from "react";
import { motion, type MotionStyle, useReducedMotion } from "motion/react";
import { cn } from "~/lib/utils";

type TextShimmerElementProps = React.HTMLAttributes<HTMLElement> & {
  as: React.ElementType;
  ref?: Ref<HTMLElement>;
};

function TextShimmerElement({ as: Component, ref, ...props }: TextShimmerElementProps) {
  return <Component ref={ref} {...props} />;
}

const MotionTextShimmerElement = motion.create(TextShimmerElement);

export type TextShimmerProps = {
  children: string;
  as?: React.ElementType;
  className?: string;
  duration?: number;
  spread?: number;
  baseColor?: string;
  shimmerColor?: string;
  style?: React.CSSProperties;
  elementRef?: Ref<HTMLElement>;
};

function TextShimmerComponent({
  children,
  as: Component = "p",
  className,
  duration = 2,
  spread = 2,
  baseColor,
  shimmerColor,
  style,
  elementRef,
}: TextShimmerProps) {
  const shouldReduceMotion = useReducedMotion();

  const dynamicSpread = useMemo(() => {
    return children.length * spread;
  }, [children, spread]);

  const animationProps = shouldReduceMotion
    ? {}
    : {
        initial: { backgroundPosition: "100% center" },
        animate: { backgroundPosition: "0% center" },
        transition: {
          repeat: Infinity,
          duration,
          ease: "linear" as const,
        },
      };

  return (
    <MotionTextShimmerElement
      as={Component}
      {...(elementRef ? { ref: elementRef } : {})}
      className={cn(
        "relative inline-block bg-size-[250%_100%,auto] bg-clip-text",
        "[-webkit-text-fill-color:transparent]",
        "[background-repeat:no-repeat,padding-box] [--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--base-gradient-color),#0000_calc(50%+var(--spread)))]",
        className,
      )}
      {...animationProps}
      style={
        {
          ...style,
          "--spread": `${dynamicSpread}px`,
          "--base-color":
            baseColor ?? "color-mix(in oklab, currentColor 55%, transparent)",
          "--base-gradient-color": shimmerColor ?? "currentColor",
          backgroundImage: `var(--bg), linear-gradient(var(--base-color), var(--base-color))`,
        } as MotionStyle
      }
    >
      {children}
    </MotionTextShimmerElement>
  );
}

export const TextShimmer = React.memo(TextShimmerComponent);
