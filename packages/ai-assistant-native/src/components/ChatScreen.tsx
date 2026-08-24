import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { ChatPanel } from '@/components/ChatPanel'
import { useAiTheme } from '@/theme/AiThemeContext'

export type ChatScreenProps = {
  /** Top safe-area from host app. */
  topInset?: number
  /** Small bottom padding only (default 8). Do not pass full home-indicator inset. */
  bottomInset?: number
  showBackButton?: boolean
  onBack?: () => void
}

export function ChatScreen({
  topInset = 0,
  bottomInset = 8,
  showBackButton = false,
  onBack,
}: ChatScreenProps) {
  const { colors } = useAiTheme()
  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: colors.paper },
      }),
    [colors],
  )

  return (
    <View style={styles.root}>
      <ChatPanel
        topInset={topInset}
        bottomInset={bottomInset}
        showBackButton={showBackButton}
        onBack={onBack}
      />
    </View>
  )
}
