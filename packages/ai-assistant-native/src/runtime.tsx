import { createContext, useContext, type ReactNode } from 'react'

export type OpenHotelInfo = {
  hotelId: string
  roomType?: string
  href?: string
  /** Original tour id from API, e.g. lt_9223758 */
  tourId?: string
}

export type AiNativeRuntime = {
  openUrl?: (url: string) => void | Promise<void>
  /**
   * Prefer this for hotel cards — host opens in-app hotel screen.
   * Return true if handled (browser must not open).
   */
  onOpenHotel?: (info: OpenHotelInfo) => boolean | void
}

const AiNativeRuntimeContext = createContext<AiNativeRuntime>({})

export function AiNativeRuntimeProvider({
  value,
  children,
}: {
  value: AiNativeRuntime
  children: ReactNode
}) {
  return (
    <AiNativeRuntimeContext.Provider value={value}>{children}</AiNativeRuntimeContext.Provider>
  )
}

export function useAiNativeRuntime(): AiNativeRuntime {
  return useContext(AiNativeRuntimeContext)
}

/** Extract numeric hotel id from tour id / link. */
export function extractHotelIdFromTourId(tourId?: string): string | null {
  if (!tourId) return null
  const lt = /^lt_(\d+)$/i.exec(tourId.trim())
  if (lt) return lt[1]
  if (/^\d+$/.test(tourId.trim())) return tourId.trim()
  return null
}
