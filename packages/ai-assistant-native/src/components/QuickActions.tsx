import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { QUICK_ACTIONS } from '@/lib/constants'
import { useAiTheme } from '@/theme/AiThemeContext'
import type { AiColors } from '@/theme/colors'

export function QuickActions({ onSelect }: { onSelect: (prompt: string) => void }) {
  const { colors } = useAiTheme()
  const styles = useMemo(() => makeStyles(colors), [colors])

  return (
    <View style={styles.wrap}>
      {QUICK_ACTIONS.map((action) => (
        <Pressable
          key={action.id}
          onPress={() => onSelect(action.prompt)}
          style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
        >
          <Text style={styles.chipText}>{action.labelRu}</Text>
        </Pressable>
      ))}
    </View>
  )
}

function makeStyles(c: AiColors) {
  return StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.sand,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    chipPressed: {
      borderColor: c.coral,
    },
    chipText: {
      fontSize: 11,
      color: c.ink,
      opacity: 0.85,
    },
  })
}
