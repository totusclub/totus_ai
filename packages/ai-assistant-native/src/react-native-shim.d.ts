/** Minimal typings so the package builds without installing react-native in the monorepo. */
declare module 'react-native' {
  import type { ComponentType, ReactNode, RefObject } from 'react'

  export type StyleProp<T> = T | Array<T | false | null | undefined> | false | null | undefined
  export type ViewStyle = Record<string, unknown>
  export type TextStyle = Record<string, unknown>
  export type ImageStyle = Record<string, unknown>

  export const StyleSheet: {
    create: <T extends Record<string, ViewStyle | TextStyle | ImageStyle>>(styles: T) => T
    absoluteFillObject: ViewStyle
  }

  export const Platform: { OS: 'ios' | 'android' | 'web' | string }

  export const Linking: {
    canOpenURL: (url: string) => Promise<boolean>
    openURL: (url: string) => Promise<void>
  }

  type ViewProps = {
    style?: StyleProp<ViewStyle>
    children?: ReactNode
    testID?: string
  }

  type TextProps = {
    style?: StyleProp<TextStyle>
    children?: ReactNode
    numberOfLines?: number
  }

  export const View: ComponentType<ViewProps>
  export const Text: ComponentType<TextProps>
  export const Image: ComponentType<{
    style?: StyleProp<ImageStyle>
    source: { uri: string }
  }>
  export const Pressable: ComponentType<{
    children?: ReactNode
    onPress?: () => void
    disabled?: boolean
    hitSlop?: number
    accessibilityLabel?: string
    style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>)
  }>
  export const TextInput: ComponentType<{
    style?: StyleProp<TextStyle>
    value?: string
    onChangeText?: (text: string) => void
    placeholder?: string
    placeholderTextColor?: string
    multiline?: boolean
    editable?: boolean
  }>
  export const SafeAreaView: ComponentType<ViewProps>
  export const KeyboardAvoidingView: ComponentType<
    ViewProps & {
      behavior?: 'height' | 'position' | 'padding'
    }
  >
  export const Modal: ComponentType<
    ViewProps & {
      visible?: boolean
      animationType?: 'none' | 'slide' | 'fade'
      presentationStyle?: string
      onRequestClose?: () => void
    }
  >

  export type FlatListRef = {
    scrollToEnd: (opts?: { animated?: boolean }) => void
  }

  export type FlatListProps<ItemT> = ViewProps & {
    data: ItemT[]
    keyExtractor?: (item: ItemT, index: number) => string
    renderItem: (info: { item: ItemT; index: number }) => ReactNode
    contentContainerStyle?: StyleProp<ViewStyle>
    ListFooterComponent?: ReactNode
    ref?: RefObject<FlatListRef | null>
  }

  export function FlatList<ItemT>(props: FlatListProps<ItemT>): ReactNode
}
