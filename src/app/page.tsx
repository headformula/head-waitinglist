'use client'

import { useState } from 'react'
import { WaitingList } from '@/components/WaitingList'
import { BlockBlastGame } from '@/components/BlockBlastGame'
import { ThemeToggle } from '@/components/ThemeToggle'

export default function Home() {
  const [userEmail, setUserEmail] = useState('')
  const [isOnWaitingList, setIsOnWaitingList] = useState(false)

  const handleWaitingListComplete = (email: string) => {
    setUserEmail(email)
    setIsOnWaitingList(true)
  }

  return (
    <main>
      {/* Theme Toggle */}
      <div className="absolute top-5 right-5 z-50">
        <ThemeToggle />
      </div>
      <WaitingList onComplete={handleWaitingListComplete} />
      <BlockBlastGame userEmail={userEmail} isOnWaitingList={isOnWaitingList} />
    </main>
  )
}
