"use client";

import * as React from "react";
import { motion, useScroll, useMotionValueEvent, type Variants } from "framer-motion";
import { Navigation, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { HoverBorderGradient } from "@/components/ui/hover-border-gradient";

const navItems = [
  { name: "Overview", href: "#overview" },
  { name: "Nodes", href: "#nodes" },
  { name: "About", href: "#about" },
  { name: "Rounds", href: "#rounds" },
];

const EXPAND_SCROLL_THRESHOLD = 80;

// Explicit `Variants` typing (rather than plain `const` object literals) so
// TS narrows string fields like `type: "spring"` to framer-motion's literal
// union instead of widening them to `string` -- same animation, just typed.
const containerVariants: Variants = {
  expanded: { y: 0, opacity: 1, width: "auto", transition: { y: { type: "spring", damping: 18, stiffness: 250 }, opacity: { duration: 0.3 }, type: "spring", damping: 20, stiffness: 300, staggerChildren: 0.07, delayChildren: 0.2 } },
  collapsed: { y: 0, opacity: 1, width: "3rem", transition: { type: "spring", damping: 20, stiffness: 300, when: "afterChildren", staggerChildren: 0.05, staggerDirection: -1 } },
};

const logoVariants: Variants = {
  expanded: { opacity: 1, x: 0, rotate: 0, transition: { type: "spring", damping: 15 } },
  collapsed: { opacity: 0, x: -25, rotate: -180, transition: { duration: 0.3 } },
};

const itemVariants: Variants = {
  expanded: { opacity: 1, x: 0, scale: 1, transition: { type: "spring", damping: 15 } },
  collapsed: { opacity: 0, x: -20, scale: 0.95, transition: { duration: 0.2 } },
};

const collapsedIconVariants: Variants = {
    expanded: { opacity: 0, scale: 0.8, transition: { duration: 0.2 } },
    collapsed: { opacity: 1, scale: 1, transition: { type: "spring", damping: 15, stiffness: 300, delay: 0.15 } },
}

export function AnimatedNavFramer() {
  const [isExpanded, setExpanded] = React.useState(true);
  const { scrollY } = useScroll();
  const lastScrollY = React.useRef(0);
  const scrollPositionOnCollapse = React.useRef(0);

  useMotionValueEvent(scrollY, "change", (latest) => {
    const previous = lastScrollY.current;
    if (isExpanded && latest > previous && latest > 150) {
      setExpanded(false);
      scrollPositionOnCollapse.current = latest;
    }
    else if (!isExpanded && latest < previous && (scrollPositionOnCollapse.current - latest > EXPAND_SCROLL_THRESHOLD)) {
      setExpanded(true);
    }
    lastScrollY.current = latest;
  });

  const handleNavClick = (e: React.MouseEvent) => {
    if (!isExpanded) {
      e.preventDefault();
      setExpanded(true);
    }
  };

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50">
      <HoverBorderGradient
        as={motion.nav}
        initial={{ y: -80, opacity: 0 }}
        animate={isExpanded ? "expanded" : "collapsed"}
        variants={containerVariants}
        whileHover={!isExpanded ? { scale: 1.1 } : {}}
        whileTap={!isExpanded ? { scale: 0.95 } : {}}
        onClick={handleNavClick}
        containerClassName={cn("shadow-lg rounded-full border-none", !isExpanded && "cursor-pointer justify-center")}
        className={cn("flex items-center overflow-hidden bg-background/80 backdrop-blur-sm h-12 p-0 pr-4", !isExpanded && "justify-center pr-0")}
        maskClassName="bg-background/80"
      >
        <motion.div variants={logoVariants} className="flex-shrink-0 flex items-center font-semibold pl-4 pr-2">
          <Navigation className="h-6 w-6" />
        </motion.div>

        <motion.div className={cn("flex items-center gap-1 sm:gap-4", !isExpanded && "pointer-events-none")}>
          {navItems.map((item) => (
            <motion.a key={item.name} href={item.href} variants={itemVariants} onClick={(e) => e.stopPropagation()} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-1">
              {item.name}
            </motion.a>
          ))}
        </motion.div>

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <motion.div variants={collapsedIconVariants} animate={isExpanded ? "expanded" : "collapsed"}>
            <Menu className="h-6 w-6" />
          </motion.div>
        </div>
      </HoverBorderGradient>
    </div>
  );
}
