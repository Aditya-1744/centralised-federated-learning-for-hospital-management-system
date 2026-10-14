"use client";
import { motion } from "framer-motion";
import { LayoutDashboard, Server, Activity, ShieldCheck, Building2 } from "lucide-react";
import { useState, useEffect } from "react";
import { HoverBorderGradient } from "@/components/ui/hover-border-gradient";

const icons = [
  { id: 1, icon: <LayoutDashboard size={28} />, label: "Overview", href: "#overview" },
  { id: 2, icon: <Building2 size={28} />, label: "Nodes", href: "#nodes" },
  { id: 3, icon: <Activity size={28} />, label: "About", href: "#about" },
  { id: 4, icon: <Server size={28} />, label: "Rounds", href: "#rounds" },
  { id: 5, icon: <ShieldCheck size={28} />, label: "Privacy", href: "#privacy" },
];

export default function TiltedDock() {
  const [hovered, setHovered] = useState<number | null>(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMouse({ x: e.clientX / window.innerWidth - 0.5, y: e.clientY / window.innerHeight - 0.5 });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50">
      <HoverBorderGradient
        as={motion.div}
        containerClassName="rounded-3xl shadow-[0_15px_40px_rgba(0,0,0,0.35)] border-none"
        className="flex gap-10 px-12 py-6 rounded-[inherit] bg-white/30 dark:bg-black/30 backdrop-blur-2xl p-0 border border-white/20 dark:border-white/10"
        style={{ transformStyle: "preserve-3d" }}
        animate={{ rotateX: 18, rotateY: mouse.x * 10 }}
        transition={{ type: "spring", stiffness: 80, damping: 20 }}
        maskClassName="bg-white/30 dark:bg-black/30 backdrop-blur-2xl"
      >
        {icons.map((item) => (
          <motion.a
            href={item.href}
            key={item.id}
            className="relative flex flex-col items-center justify-center"
            onHoverStart={() => setHovered(item.id)}
            onHoverEnd={() => setHovered(null)}
            animate={{ scale: hovered === item.id ? 1.4 : 1, z: hovered === item.id ? 120 : hovered ? -20 : 0, opacity: hovered && hovered !== item.id ? 0.5 : 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 18 }}
            style={{ transformStyle: "preserve-3d" }}
          >
            <motion.div animate={{ rotateX: hovered === item.id ? -10 : 0, rotateY: hovered === item.id ? 10 : 0 }} transition={{ type: "spring", stiffness: 150, damping: 15 }} className="text-gray-900 dark:text-gray-100">
              {item.icon}
            </motion.div>
            <motion.span className="absolute -bottom-8 text-xs font-medium text-gray-800 dark:text-gray-200" animate={{ opacity: hovered === item.id ? 1 : 0, y: hovered === item.id ? 0 : 5 }} transition={{ duration: 0.3 }}>
              {item.label}
            </motion.span>
          </motion.a>
        ))}
      </HoverBorderGradient>
    </div>
  );
}
