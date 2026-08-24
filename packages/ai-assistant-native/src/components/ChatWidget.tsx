import { useMemo } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useAssistantStore } from '@/stores/assistantStore'
import { ChatPanel } from '@/components/ChatPanel'
import { useAiTheme } from '@/theme/AiThemeContext'
import type { AiColors } from '@/theme/colors'

export type ChatWidgetProps = {
  fabBottom?: number
  fabRight?: number
}

/** Floating FAB + modal chat. Prefer `ChatScreen` inside an AI navigation tab. */
export function ChatWidget({ fabBottom = 24, fabRight = 20 }: ChatWidgetProps) {
  const { colors } = useAiTheme()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const isOpen = useAssistantStore((s) => s.isOpen)
  const toggleOpen = useAssistantStore((s) => s.toggleOpen)

  return (
    <>
      <Pressable
        accessibilityLabel={isOpen ? 'Закрыть чат' : 'Открыть чат'}
        onPress={toggleOpen}
        style={[styles.fab, { bottom: fabBottom, right: fabRight }]}
      >
        <Text style={styles.fabIcon}>{isOpen ? '✕' : '💬'}</Text>
      </Pressable>

      <Modal
        visible={isOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={toggleOpen}
      >
        <View style={styles.modalRoot}>
          {isOpen ? <ChatPanel showCloseButton onClose={toggleOpen} /> : null}
        </View>
      </Modal>
    </>
  )
}

function makeStyles(c: AiColors) {
  return StyleSheet.create({
    modalRoot: { flex: 1, backgroundColor: c.paper },
    fab: {
      position: 'absolute',
      zIndex: 50,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: c.coral,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: c.coral,
      shadowOpacity: 0.4,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    fabIcon: { color: c.white, fontSize: 22 },
  })
}
