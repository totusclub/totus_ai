import { Linking } from 'react-native'
import { getAiNativeConfig } from '@/config'

/** Turn relative site path into absolute URL and open it. */
export async function openBookingHref(href: string) {
  const { siteOrigin, openUrl } = getAiNativeConfig()
  let url = href
  if (!/^https?:\/\//i.test(href)) {
    const origin = (siteOrigin || 'https://totus.club').replace(/\/$/, '')
    url = `${origin}${href.startsWith('/') ? href : `/${href}`}`
  }
  if (openUrl) {
    await openUrl(url)
    return
  }
  const can = await Linking.canOpenURL(url)
  if (can) await Linking.openURL(url)
}

type SendListener = (prompt: string) => void
const sendListeners = new Set<SendListener>()

export function onAssistantSendRequest(listener: SendListener) {
  sendListeners.add(listener)
  return () => {
    sendListeners.delete(listener)
  }
}

export function requestAssistantSend(prompt: string) {
  for (const listener of sendListeners) listener(prompt)
}
