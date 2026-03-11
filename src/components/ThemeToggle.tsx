'use client'

import { motion } from 'framer-motion'
import { useTheme } from './ThemeProvider'

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      onClick={toggleTheme}
      className="relative cursor-pointer border-none bg-transparent p-0"
      aria-label={isDark ? 'Attiva modalità chiara' : 'Attiva modalità scura'}
      style={{ width: 52, height: 26 }}
    >
      {/* Track */}
      <motion.div
        className="absolute inset-0 rounded-full border pointer-events-none"
        animate={{
          background: isDark ? '#0a0a0a' : '#ffffff',
          borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)',
        }}
        transition={{ duration: 0.4 }}
        style={{
          boxShadow: isDark
            ? 'inset 0 1px 3px rgba(0,0,0,0.5)'
            : 'inset 0 1px 3px rgba(0,0,0,0.08)',
        }}
      />

      {/* Knob container */}
      <motion.div
        className="absolute top-[-5px] pointer-events-none"
        style={{ width: 36, height: 36 }}
        animate={{ left: isDark ? 20 : -4 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      >
        {/* Sun image */}
        <motion.div
          className="absolute inset-0"
          animate={{ opacity: isDark ? 0 : 1, rotate: 360 }}
          transition={{
            opacity: { duration: 0.35 },
            rotate: { duration: 30, ease: 'linear', repeat: Infinity },
          }}
        >
          <img
            src="/switcher2.png"
            alt="Sole"
            className="w-full h-full object-contain pointer-events-none"
            draggable={false}
          />
        </motion.div>

        {/* Moon image */}
        <motion.div
          className="absolute inset-0"
          animate={{ opacity: isDark ? 1 : 0, rotate: 360 }}
          transition={{
            opacity: { duration: 0.35 },
            rotate: { duration: 20, ease: 'linear', repeat: Infinity },
          }}
        >
          <img
            src="/switcher1.png"
            alt="Luna"
            className="w-full h-full object-contain pointer-events-none"
            draggable={false}
          />
        </motion.div>
      </motion.div>
    </button>
  )
}
