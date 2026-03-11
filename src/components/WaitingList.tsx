'use client'

import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Waves } from '@/components/ui/wave-background'
import { useTheme } from './ThemeProvider'
import { supabase } from '@/lib/supabase'

type Step = 'email' | 'code' | 'success'

type WaitingListProps = {
  onComplete?: (email: string) => void
}

export function WaitingList({ onComplete }: WaitingListProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState(['', '', '', '', '', ''])
  const codeInputRefs = useRef<(HTMLInputElement | null)[]>([])


  // Focus first code input when entering code step
  useEffect(() => {
    if (step === 'code') {
      setTimeout(() => codeInputRefs.current[0]?.focus(), 500)
    }
  }, [step])

  const [submitting, setSubmitting] = useState(false)

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || submitting) return
    setSubmitting(true)
    try {
      await supabase.from('waiting_list').upsert(
        { email: email.trim() },
        { onConflict: 'email' }
      )
      setStep('success')
      onComplete?.(email)
    } catch {
      // still show success to not block UX
      setStep('success')
      onComplete?.(email)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCodeChange = (index: number, value: string) => {
    if (value.length > 1) return
    const newCode = [...code]
    newCode[index] = value
    setCode(newCode)

    if (value && index < 5) {
      codeInputRefs.current[index + 1]?.focus()
    }

    if (index === 5 && value) {
      const isComplete = newCode.every(d => d.length === 1)
      if (isComplete) {
        setTimeout(() => {
          setStep('success')
          onComplete?.(email)
        }, 800)
      }
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus()
    }
  }

  const handleBack = () => {
    if (step === 'code') {
      setStep('email')
      setCode(['', '', '', '', '', ''])
    }
  }

  return (
    <div className={`relative w-full h-svh overflow-hidden transition-colors duration-500 ${isDark ? 'bg-black' : 'bg-white'}`}>
      {/* Waves background */}
      <div className="absolute inset-0 z-0">
        <Waves
          className="h-full w-full"
          strokeColor={isDark ? '#ffffff' : '#000000'}
          backgroundColor={isDark ? '#000000' : '#ffffff'}
        />
      </div>

      {/* Gradient overlays for readability */}
      <div
        className="absolute inset-0 z-[1] transition-colors duration-500"
        style={{
          background: isDark
            ? 'radial-gradient(circle at center, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.7) 100%)'
            : 'radial-gradient(circle at center, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.7) 100%)',
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex h-full items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <AnimatePresence mode="wait">
            {/* ---- EMAIL STEP ---- */}
            {step === 'email' && (
              <motion.div
                key="email-step"
                initial={{ opacity: 0, x: -80 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -80 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                className="space-y-8 text-center"
              >
                <div className="space-y-2">
                  <p className={`text-3xl font-light transition-colors duration-500 ${isDark ? 'text-white/60' : 'text-black/60'}`}>
                    Iscriviti alla waiting list
                  </p>
                </div>

                <form onSubmit={handleEmailSubmit} className="space-y-4">
                  <div className="relative">
                    <input
                      type="email"
                      placeholder="la-tua@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={`w-full backdrop-blur-sm rounded-full py-3 px-5 pr-14 focus:outline-none text-center text-[16px] transition-colors duration-500 ${
                        isDark
                          ? 'text-white bg-white/5 border border-white/10 focus:border-white/30 placeholder:text-white/30'
                          : 'text-black bg-black/5 border border-black/10 focus:border-black/30 placeholder:text-black/30'
                      }`}
                      required
                    />
                    <button
                      type="submit"
                      className={`absolute right-1.5 top-1.5 w-9 h-9 flex items-center justify-center rounded-full transition-colors cursor-pointer group overflow-hidden ${
                        isDark
                          ? 'text-white bg-white/10 hover:bg-white/20'
                          : 'text-black bg-black/10 hover:bg-black/20'
                      }`}
                    >
                      <span className="relative w-full h-full block overflow-hidden">
                        <span className="absolute inset-0 flex items-center justify-center transition-transform duration-300 group-hover:translate-x-full">
                          &rarr;
                        </span>
                        <span className="absolute inset-0 flex items-center justify-center transition-transform duration-300 -translate-x-full group-hover:translate-x-0">
                          &rarr;
                        </span>
                      </span>
                    </button>
                  </div>
                </form>

                <p className={`text-xs -mt-2 transition-colors duration-500 ${isDark ? 'text-white/30' : 'text-black/30'}`}>
                  Inserisci la tua email per riservare il tuo posto.
                </p>
              </motion.div>
            )}

            {/* ---- CODE STEP ---- */}
            {step === 'code' && (
              <motion.div
                key="code-step"
                initial={{ opacity: 0, x: 80 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 80 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                className="space-y-8 text-center"
              >
                <div className="space-y-2">
                  <h1 className={`text-3xl font-bold leading-[1.1] tracking-tight transition-colors duration-500 ${isDark ? 'text-white' : 'text-black'}`}>
                    Verifica la tua email
                  </h1>
                  <p className={`text-lg font-light transition-colors duration-500 ${isDark ? 'text-white/50' : 'text-black/50'}`}>
                    Ti abbiamo inviato un codice
                  </p>
                </div>

                <div className="w-full">
                  <div className={`relative rounded-full py-4 px-5 border backdrop-blur-sm transition-colors duration-500 ${
                    isDark ? 'border-white/10 bg-white/5' : 'border-black/10 bg-black/5'
                  }`}>
                    <div className="flex items-center justify-center">
                      {code.map((digit, i) => (
                        <div key={i} className="flex items-center">
                          <div className="relative">
                            <input
                              ref={(el) => { codeInputRefs.current[i] = el }}
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              maxLength={1}
                              value={digit}
                              onChange={e => handleCodeChange(i, e.target.value)}
                              onKeyDown={e => handleKeyDown(i, e)}
                              className={`w-8 text-center text-xl bg-transparent border-none focus:outline-none focus:ring-0 appearance-none transition-colors duration-500 ${isDark ? 'text-white' : 'text-black'}`}
                              style={{ caretColor: 'transparent' }}
                            />
                            {!digit && (
                              <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center pointer-events-none">
                                <span className={`text-xl transition-colors duration-500 ${isDark ? 'text-white/20' : 'text-black/20'}`}>0</span>
                              </div>
                            )}
                          </div>
                          {i < 5 && <span className={`text-xl transition-colors duration-500 ${isDark ? 'text-white/20' : 'text-black/20'}`}>|</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <p className={`transition-colors cursor-pointer text-sm ${isDark ? 'text-white/40 hover:text-white/60' : 'text-black/40 hover:text-black/60'}`}>
                  Invia di nuovo il codice
                </p>

                <div className="flex flex-col w-full gap-3">
                  <motion.button
                    onClick={handleBack}
                    className={`rounded-full font-medium px-8 py-3 transition-colors cursor-pointer ${
                      isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/90'
                    }`}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Indietro
                  </motion.button>
                  <motion.button
                    className={`flex-1 rounded-full font-medium py-3 border transition-all duration-300 ${
                      code.every(d => d !== '')
                        ? isDark
                          ? 'bg-white text-black border-transparent hover:bg-white/90 cursor-pointer'
                          : 'bg-black text-white border-transparent hover:bg-black/90 cursor-pointer'
                        : isDark
                          ? 'bg-white/5 text-white/50 border-white/10 cursor-not-allowed'
                          : 'bg-black/5 text-black/50 border-black/10 cursor-not-allowed'
                    }`}
                    disabled={!code.every(d => d !== '')}
                  >
                    Conferma
                  </motion.button>
                </div>
              </motion.div>
            )}

            {/* ---- SUCCESS STEP ---- */}
            {step === 'success' && (
              <motion.div
                key="success-step"
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: 'easeOut', delay: 0.2 }}
                className="space-y-8 text-center"
              >
                <div className="space-y-2">
                  <h1 className={`text-[2.5rem] font-bold leading-[1.1] tracking-tight transition-colors duration-500 ${isDark ? 'text-white' : 'text-black'}`}>
                    Ci sei!
                  </h1>
                  <p className={`text-lg font-light transition-colors duration-500 ${isDark ? 'text-white/50' : 'text-black/50'}`}>
                    Sei nella waiting list
                  </p>
                </div>

                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.5 }}
                  className="py-8"
                >
                  <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center ${
                    isDark ? 'bg-gradient-to-br from-white to-white/70' : 'bg-gradient-to-br from-black to-black/70'
                  }`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-8 w-8 ${isDark ? 'text-black' : 'text-white'}`} viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                </motion.div>

                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1 }}
                  className={`text-sm transition-colors duration-500 ${isDark ? 'text-white/40' : 'text-black/40'}`}
                >
                  Ti contatteremo presto a <span className={isDark ? 'text-white/70' : 'text-black/70'}>{email}</span>
                </motion.p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
