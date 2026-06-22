"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { motion } from "framer-motion";
import { Sun, Moon } from "lucide-react";

export default function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Return a placeholder to avoid layout shift
    return (
      <div className="flex items-center gap-0.5 glass rounded-lg p-0.5">
        <div className="px-2.5 py-1.5 rounded-md">
          <Sun className="w-3.5 h-3.5" />
        </div>
        <div className="px-2.5 py-1.5 rounded-md">
          <Moon className="w-3.5 h-3.5" />
        </div>
      </div>
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <div className="flex items-center gap-0.5 glass rounded-lg p-0.5">
      <motion.button
        onClick={() => setTheme("light")}
        className={`relative px-2.5 py-1.5 rounded-md text-[10px] sm:text-xs font-semibold transition-colors ${
          !isDark ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
        whileTap={{ scale: 0.95 }}
        title="Mode Terang"
      >
        {!isDark && (
          <motion.div
            layoutId="theme-indicator"
            className="absolute inset-0 bg-gold-gradient rounded-md"
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
          />
        )}
        <span className="relative z-10 flex items-center gap-1">
          <Sun className="w-3.5 h-3.5" />
        </span>
      </motion.button>
      <motion.button
        onClick={() => setTheme("dark")}
        className={`relative px-2.5 py-1.5 rounded-md text-[10px] sm:text-xs font-semibold transition-colors ${
          isDark ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
        whileTap={{ scale: 0.95 }}
        title="Mode Gelap"
      >
        {isDark && (
          <motion.div
            layoutId="theme-indicator"
            className="absolute inset-0 bg-gold-gradient rounded-md"
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
          />
        )}
        <span className="relative z-10 flex items-center gap-1">
          <Moon className="w-3.5 h-3.5" />
        </span>
      </motion.button>
    </div>
  );
}

