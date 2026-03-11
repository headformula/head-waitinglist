'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { SpiralAnimation } from '@/components/ui/spiral-animation'
import { WaitingList } from '@/components/WaitingList'
import { BlockBlastGame } from '@/components/BlockBlastGame'
import { ThemeToggle } from '@/components/ThemeToggle'

export default function Home() {
  const [entered, setEntered] = useState(false)
  const [enterVisible, setEnterVisible] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [isOnWaitingList, setIsOnWaitingList] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setEnterVisible(true), 2000)
    return () => clearTimeout(timer)
  }, [])

  const handleWaitingListComplete = (email: string) => {
    setUserEmail(email)
    setIsOnWaitingList(true)
  }

  return (
    <AnimatePresence mode="wait">
      {!entered ? (
        <motion.div
          key="splash"
          className="fixed inset-0 z-50 bg-black"
          exit={{ opacity: 0 }}
          transition={{ duration: 1, ease: 'easeInOut' }}
        >
          <SpiralAnimation />
          <div
            className={`
              absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10
              transition-all duration-[1500ms] ease-out
              ${enterVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
            `}
          >
            <button
              onClick={() => setEntered(true)}
              className="
                text-white text-2xl tracking-[0.2em] uppercase font-extralight
                transition-all duration-700 cursor-pointer
                hover:tracking-[0.3em] animate-pulse
              "
            >
              Entra
            </button>
          </div>
        </motion.div>
      ) : (
        <motion.main
          key="content"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        >
          {/* Theme Toggle */}
          <div className="absolute top-5 right-5 z-50">
            <ThemeToggle />
          </div>
          <WaitingList onComplete={handleWaitingListComplete} />
          <BlockBlastGame userEmail={userEmail} isOnWaitingList={isOnWaitingList} />
        </motion.main>
      )}
    </AnimatePresence>
  )
}
