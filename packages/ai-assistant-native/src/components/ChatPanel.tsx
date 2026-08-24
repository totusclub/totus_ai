import { useEffect, useMemo, useRef, useState } from 'react'
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type FlatListRef,
} from 'react-native'
import { useAssistant } from '@/hooks/useAssistant'
import { useAssistantStore } from '@/stores/assistantStore'
import { ChatMessage } from '@/components/ChatMessage'
import { QuickActions } from '@/components/QuickActions'
import { getApiBase } from '@/config'
import { onAssistantSendRequest } from '@/lib/openUrl'
import { useAiTheme } from '@/theme/AiThemeContext'
import type { AiColors } from '@/theme/colors'
import type { ChatMessage as ChatMessageType } from '@/types'

export type ChatPanelProps = {
  showCloseButton?: boolean
  onClose?: () => void
  /** Show ← back in header (e.g. leave AI tab). */
  showBackButton?: boolean
  onBack?: () => void
  /** Top safe-area inset from host (avoid double SafeAreaView). */
  topInset?: number
  /** Bottom padding under composer — pass home indicator once only. */
  bottomInset?: number
}

export function ChatPanel({
  showCloseButton = false,
  onClose,
  showBackButton = false,
  onBack,
  topInset = 0,
  bottomInset = 8,
}: ChatPanelProps) {
  const { colors } = useAiTheme()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const { isConnected, isTyping, messages, send, newChat, openChat } = useAssistant()
  const chats = useAssistantStore((s) => s.chats)
  const activeChatId = useAssistantStore((s) => s.activeChatId)
  const showChatList = useAssistantStore((s) => s.showChatList)
  const setShowChatList = useAssistantStore((s) => s.setShowChatList)
  const deleteChat = useAssistantStore((s) => s.deleteChat)
  const typingStatus = useAssistantStore((s) => s.typingStatus)
  const [draft, setDraft] = useState('')
  const [llmOn, setLlmOn] = useState(false)
  const listRef = useRef<FlatListRef>(null)

  useEffect(() => {
    return onAssistantSendRequest((prompt) => send(prompt))
  }, [send])

  useEffect(() => {
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80)
    return () => clearTimeout(t)
  }, [messages, isTyping])

  useEffect(() => {
    fetch(`${getApiBase()}/health`)
      .then((r) => r.json())
      .then((data: { llm?: { enabled?: boolean }; kimi?: { enabled?: boolean } }) =>
        setLlmOn(Boolean(data.llm?.enabled ?? data.kimi?.enabled)),
      )
      .catch(() => setLlmOn(false))
  }, [isConnected])

  const submit = () => {
    if (!draft.trim() || isTyping) return
    send(draft)
    setDraft('')
  }

  return (
    <View style={[styles.safe, { paddingTop: topInset }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {showBackButton ? (
              <Pressable
                onPress={onBack}
                style={styles.backBtn}
                hitSlop={8}
                accessibilityLabel="Назад"
              >
                <Text style={styles.backBtnText}>←</Text>
              </Pressable>
            ) : null}
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>☀️</Text>
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>Мила · Тотус клуб</Text>
              <Text style={styles.subtitle}>
                {isConnected
                  ? llmOn
                    ? 'Онлайн · подбор туров'
                    : 'Локальный режим'
                  : 'Переподключение…'}
              </Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <HeaderBtn label="чаты" onPress={() => setShowChatList(!showChatList)} styles={styles} />
            <HeaderBtn label="+" onPress={newChat} styles={styles} />
            {showCloseButton ? (
              <HeaderBtn label="✕" onPress={() => onClose?.()} styles={styles} />
            ) : null}
          </View>
        </View>

        {showChatList ? (
          <View style={styles.chatList}>
            <Text style={styles.chatListTitle}>Мои чаты</Text>
            {[...chats].reverse().map((chat) => (
              <View
                key={chat.id}
                style={[styles.chatRow, chat.id === activeChatId && styles.chatRowActive]}
              >
                <Pressable style={styles.chatRowMain} onPress={() => openChat(chat.id)}>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.chatTitle,
                      chat.id === activeChatId && styles.chatTitleActive,
                    ]}
                  >
                    {chat.title}
                  </Text>
                  <Text style={styles.chatDate}>
                    {new Date(chat.updatedAt).toLocaleDateString('ru-RU', {
                      day: '2-digit',
                      month: '2-digit',
                    })}
                  </Text>
                </Pressable>
                <Pressable onPress={() => deleteChat(chat.id)} hitSlop={8}>
                  <Text style={styles.delete}>🗑</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <FlatList
          ref={listRef}
          style={styles.flex}
          contentContainerStyle={styles.messages}
          data={messages}
          keyExtractor={(item: ChatMessageType) => item.id}
          renderItem={({ item }) => <ChatMessage message={item} />}
          ListFooterComponent={
            isTyping ? (
              <View style={styles.typingWrap}>
                <View style={styles.typingBubble}>
                  <Text style={styles.typingText}>{typingStatus ?? 'Думаю'}…</Text>
                </View>
              </View>
            ) : null
          }
        />

        <View style={[styles.composer, { paddingBottom: Math.max(bottomInset, 8) }]}>
          <QuickActions onSelect={(prompt) => send(prompt)} />
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Спросите совет или опишите тур…"
              placeholderTextColor={colors.faint}
              multiline
              editable={!isTyping}
            />
            <Pressable
              onPress={submit}
              disabled={!draft.trim() || isTyping}
              style={[styles.send, (!draft.trim() || isTyping) && styles.sendDisabled]}
            >
              <Text style={styles.sendText}>➤</Text>
            </Pressable>
          </View>
          <Text style={styles.disclaimer}>
            Агент может ошибаться — пожалуйста, перепроверяйте результат вручную.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </View>
  )
}

function HeaderBtn({
  label,
  onPress,
  styles,
}: {
  label: string
  onPress: () => void
  styles: ReturnType<typeof makeStyles>
}) {
  return (
    <Pressable onPress={onPress} style={styles.headerBtn} hitSlop={6}>
      <Text style={styles.headerBtnText}>{label}</Text>
    </Pressable>
  )
}

function makeStyles(c: AiColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    safe: { flex: 1, backgroundColor: c.paper },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: 1,
      borderBottomColor: c.line,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: c.paper,
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
    backBtn: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 2,
    },
    backBtnText: { fontSize: 24, color: c.ink, fontWeight: '400', lineHeight: 28 },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: c.coral,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { fontSize: 16 },
    headerText: { flex: 1, minWidth: 0 },
    title: { fontSize: 13, fontWeight: '600', color: c.ink },
    subtitle: { marginTop: 2, fontSize: 12, color: c.subtle },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    headerBtn: {
      minWidth: 32,
      height: 32,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
    },
    headerBtnText: { fontSize: 13, color: c.ink },
    chatList: {
      maxHeight: 220,
      borderBottomWidth: 1,
      borderBottomColor: c.line,
      backgroundColor: c.paper,
    },
    chatListTitle: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 10,
      fontWeight: '600',
      color: c.faint,
      textTransform: 'uppercase',
    },
    chatRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    chatRowActive: { backgroundColor: c.sand },
    chatRowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
    chatTitle: { flex: 1, fontSize: 14, color: c.ink },
    chatTitleActive: { color: c.coral },
    chatDate: { fontSize: 10, color: c.faint },
    delete: { fontSize: 14, opacity: 0.6 },
    messages: { paddingHorizontal: 12, paddingVertical: 16, gap: 12 },
    typingWrap: { alignItems: 'flex-start', marginTop: 4 },
    typingBubble: {
      borderRadius: 16,
      borderBottomLeftRadius: 6,
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.sand,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    typingText: { fontSize: 12, color: c.subtle },
    composer: {
      borderTopWidth: 1,
      borderTopColor: c.line,
      paddingHorizontal: 12,
      paddingTop: 10,
      gap: 8,
      backgroundColor: c.paper,
    },
    inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
    input: {
      flex: 1,
      minHeight: 42,
      maxHeight: 110,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: c.ink,
      backgroundColor: c.page,
    },
    send: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: c.coral,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendDisabled: { opacity: 0.45 },
    sendText: { color: c.white, fontSize: 16 },
    disclaimer: {
      textAlign: 'center',
      fontSize: 10,
      lineHeight: 13,
      color: c.faint,
    },
  })
}
