import { useMemo } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import type { ChatMessage as ChatMessageType, RoomCard, Tour } from '@/types'
import { mealLabel } from '@/lib/meals'
import { formatDurationLabel, formatPrice } from '@/lib/utils'
import { hotelDetailsHrefFromTour, roomBookingHref } from '@/lib/bookingHref'
import { openBookingHref, requestAssistantSend } from '@/lib/openUrl'
import { useAiTheme } from '@/theme/AiThemeContext'
import type { AiColors } from '@/theme/colors'
import {
  extractHotelIdFromTourId,
  useAiNativeRuntime,
} from '@/runtime'
import { getAiNativeConfig } from '@/config'

function useOpenHotelAction() {
  const { onOpenHotel, openUrl } = useAiNativeRuntime()

  return (opts: {
    hotelId?: string | number | null
    tourId?: string
    roomType?: string
    href: string
  }) => {
    const fromTour = extractHotelIdFromTourId(opts.tourId)
    const fromNum =
      opts.hotelId != null && Number.isFinite(Number(opts.hotelId))
        ? String(Math.trunc(Number(opts.hotelId)))
        : null
    let hotelId = fromTour || fromNum

    // Last resort: pull hotel_id / lt_ from href (no URLSearchParams — RN incomplete)
    if (!hotelId && opts.href) {
      const idMatch =
        /[?&]hotel_id=(\d+)/i.exec(opts.href) ||
        /[?&]hotelId=(\d+)/i.exec(opts.href)
      if (idMatch) hotelId = idMatch[1]
      if (!hotelId) {
        const m = /lt_(\d+)/i.exec(opts.href)
        if (m) hotelId = m[1]
      }
      if (!hotelId) {
        const pathId = opts.href.match(/\/(?:hotel-details|tours)\/([^/?#]+)/i)
        if (pathId) {
          const raw = decodeURIComponent(pathId[1])
          const lt = /^lt_(\d+)$/i.exec(raw)
          hotelId = lt ? lt[1] : /^\d+$/.test(raw) ? raw : null
        }
      }
    }

    if (hotelId && onOpenHotel) {
      const handled = onOpenHotel({
        hotelId: String(hotelId),
        tourId: opts.tourId,
        roomType: opts.roomType,
        href: opts.href,
      })
      if (handled !== false) return
    }

    const { siteOrigin } = getAiNativeConfig()
    let url = opts.href
    if (!/^https?:\/\//i.test(url)) {
      const origin = (siteOrigin || 'https://totus.club').replace(/\/$/, '')
      url = `${origin}${url.startsWith('/') ? url : `/${url}`}`
    }
    if (openUrl) {
      void openUrl(url)
      return
    }
    void openBookingHref(opts.href)
  }
}

export function ChatMessage({ message }: { message: ChatMessageType }) {
  const { colors } = useAiTheme()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const isUser = message.role === 'user'
  const hasContent = message.content.trim().length > 0
  const hasCards =
    Boolean(message.metadata?.tour_results?.length) ||
    Boolean(message.metadata?.room_cards?.rooms?.length) ||
    Boolean(message.metadata?.destination_cards?.length) ||
    Boolean(message.metadata?.booking)
  if (!hasContent && !hasCards) return null

  return (
    <View style={[styles.row, isUser ? styles.rowEnd : styles.rowStart]}>
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        {hasContent ? (
          <Text style={[styles.body, isUser && styles.bodyUser]}>
            {renderAssistantText(message.content, styles)}
          </Text>
        ) : null}

        {message.metadata?.tour_results && message.metadata.tour_results.length > 0 ? (
          <View style={[styles.cards, hasContent && styles.cardsSpaced]}>
            {message.metadata.tour_results.map((tour) => (
              <HotelCard key={tour.id} tour={tour} />
            ))}
          </View>
        ) : null}

        {message.metadata?.room_cards && message.metadata.room_cards.rooms.length > 0 ? (
          <View style={[hasContent && styles.cardsSpaced]}>
            {message.metadata.room_cards.hotel.name ? (
              <Text style={styles.roomsTitle}>
                Номера · {message.metadata.room_cards.hotel.name}
              </Text>
            ) : null}
            <View style={styles.cards}>
              {message.metadata.room_cards.rooms.map((room) => (
                <RoomCardView
                  key={room.room_type}
                  room={room}
                  hotelId={message.metadata!.room_cards!.hotel.id}
                  hotelImage={message.metadata!.room_cards!.hotel.image}
                />
              ))}
            </View>
            <Text style={styles.roomsHint}>
              Показаны номера, доступные по этому запросу. Чтобы увидеть больше вариантов,
              воспользуйтесь поиском вручную.
            </Text>
          </View>
        ) : null}

        {message.metadata?.destination_cards && message.metadata.destination_cards.length > 0 ? (
          <View style={[styles.destGrid, hasContent && styles.cardsSpaced]}>
            {message.metadata.destination_cards.map((dest) => (
              <Pressable
                key={dest.name}
                style={styles.destCard}
                onPress={() => requestAssistantSend(`Найди туры: ${dest.name}`)}
              >
                {dest.image ? (
                  <Image source={{ uri: dest.image }} style={styles.destImage} />
                ) : (
                  <View style={[styles.destImage, styles.destFallback]} />
                )}
                <View style={styles.destOverlay}>
                  <Text style={styles.destName}>
                    {dest.emoji ? `${dest.emoji} ` : ''}
                    {dest.name}
                  </Text>
                  {dest.country && dest.country !== dest.name ? (
                    <Text style={styles.destCountry}>{dest.country}</Text>
                  ) : null}
                </View>
                {dest.tagline ? (
                  <Text style={styles.destTagline} numberOfLines={2}>
                    {dest.tagline}
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  )
}

function HotelCard({ tour }: { tour: Tour }) {
  const { colors } = useAiTheme()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const openHotel = useOpenHotelAction()
  const image = tour.images?.[0]
  const pickMap: Record<string, { bg: string; fg: string }> = {
    'оптимум цена/качество': { bg: colors.coral, fg: colors.white },
    'самая низкая цена': { bg: colors.ok, fg: colors.white },
    'лучший рейтинг': { bg: colors.gold, fg: colors.white },
  }
  const labelColors = tour.pick_label
    ? (pickMap[tour.pick_label] ?? { bg: colors.paper, fg: colors.ink })
    : null

  const open = () =>
    openHotel({
      tourId: tour.id,
      // Prefer full AI booking link (has dates / destination) so hotel page finds rooms.
      href: tour.link || hotelDetailsHrefFromTour(tour),
    })

  return (
    <Pressable style={styles.hotelCard} onPress={open}>
      <View style={styles.hotelHero}>
        {image ? (
          <Image source={{ uri: image }} style={styles.hotelImage} />
        ) : (
          <View style={[styles.hotelImage, styles.hotelFallback]}>
            <Text style={styles.hotelEmoji}>{tour.emoji || '🏨'}</Text>
          </View>
        )}
        <View style={styles.hotelGradient} />
        {tour.pick_label && labelColors ? (
          <View style={[styles.pickLabel, { backgroundColor: labelColors.bg }]}>
            <Text style={[styles.pickLabelText, { color: labelColors.fg }]}>
              {tour.pick_label}
            </Text>
          </View>
        ) : null}
        <View style={styles.hotelMeta}>
          <Text style={styles.hotelName}>
            {tour.name}
            {tour.stars ? (
              <Text style={styles.hotelStars}>{'★'.repeat(Math.min(tour.stars, 5))}</Text>
            ) : null}
          </Text>
          <Text style={styles.hotelSub}>
            {tour.destination} · {formatDurationLabel(tour.duration, tour.duration_hours)}
            {tour.rating > 0 ? ` · ★ ${tour.rating}` : ''}
          </Text>
        </View>
      </View>
      <View style={styles.hotelFooter}>
        <View>
          <Text style={styles.priceLabel}>цена за тур</Text>
          <Text style={styles.price}>от {formatPrice(tour.price, tour.currency)}</Text>
        </View>
        <View style={styles.cta}>
          <Text style={styles.ctaText}>К бронированию</Text>
        </View>
      </View>
      {tour.comment ? (
        <View style={styles.commentBox}>
          <Text style={styles.comment}>💬 {tour.comment}</Text>
        </View>
      ) : null}
    </Pressable>
  )
}

function RoomCardView({
  room,
  hotelId,
  hotelImage,
}: {
  room: RoomCard
  hotelId: number
  hotelImage?: string
}) {
  const { colors } = useAiTheme()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const openHotel = useOpenHotelAction()
  const meals = Object.entries(room.meals).sort((a, b) => a[1] - b[1])

  return (
    <View style={styles.roomCard}>
      {hotelImage ? <Image source={{ uri: hotelImage }} style={styles.roomThumb} /> : null}
      <View style={styles.roomBody}>
        <Text style={styles.roomType}>{room.room_type}</Text>
        <View style={styles.mealRow}>
          {meals.slice(0, 3).map(([meal, price]) => (
            <View key={meal} style={styles.mealChip}>
              <Text style={styles.mealText}>
                {mealLabel(meal)} · от {formatPrice(price, room.currency)}
              </Text>
            </View>
          ))}
        </View>
        <View style={styles.roomFooter}>
          <Text style={styles.price}>от {formatPrice(room.min_price, room.currency)}</Text>
          <Pressable
            style={styles.ctaSmall}
            onPress={() =>
              openHotel({
                hotelId,
                roomType: room.room_type,
                href: roomBookingHref(room, hotelId),
              })
            }
          >
            <Text style={styles.ctaText}>К бронированию</Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}

function renderAssistantText(raw: string, styles: ReturnType<typeof makeStyles>) {
  const cleaned = raw.replace(/^#{1,6}\s*/gm, '').replace(/^\s*[-*]\s+/gm, '• ')
  const parts = cleaned.split(/\*\*(.+?)\*\*/g)
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <Text key={i} style={styles.bold}>
        {part}
      </Text>
    ) : (
      <Text key={i}>{part.replaceAll('**', '')}</Text>
    ),
  )
}

function makeStyles(c: AiColors) {
  return StyleSheet.create({
    row: { width: '100%', marginBottom: 4 },
    rowStart: { alignItems: 'flex-start' },
    rowEnd: { alignItems: 'flex-end' },
    bubble: {
      maxWidth: '92%',
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    bubbleUser: {
      backgroundColor: c.userBubble,
      borderBottomRightRadius: 6,
    },
    bubbleAssistant: {
      backgroundColor: c.sand,
      borderWidth: 1,
      borderColor: c.line,
      borderBottomLeftRadius: 6,
    },
    body: {
      fontSize: 14,
      lineHeight: 20,
      color: c.ink,
    },
    bodyUser: {
      color: c.userBubbleText,
    },
    bold: { fontWeight: '600' },
    cards: { gap: 10 },
    cardsSpaced: { marginTop: 12 },
    hotelCard: {
      overflow: 'hidden',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.paper,
    },
    hotelHero: { height: 128, position: 'relative' },
    hotelImage: { width: '100%', height: '100%' },
    hotelFallback: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.sand,
    },
    hotelEmoji: { fontSize: 28 },
    hotelGradient: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: c.overlay,
    },
    pickLabel: {
      position: 'absolute',
      left: 8,
      top: 8,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    pickLabelText: { fontSize: 10, fontWeight: '600' },
    hotelMeta: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      padding: 10,
    },
    hotelName: { color: c.white, fontWeight: '600', fontSize: 14 },
    hotelStars: { color: c.coral },
    hotelSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },
    hotelFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    priceLabel: { fontSize: 11, color: c.faint },
    price: { fontSize: 14, fontWeight: '600', color: c.coral },
    cta: {
      backgroundColor: c.coral,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    ctaSmall: {
      backgroundColor: c.coral,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    ctaText: { color: c.white, fontSize: 11, fontWeight: '600' },
    commentBox: {
      borderTopWidth: 1,
      borderTopColor: c.line,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    comment: { fontSize: 12, color: c.ink, opacity: 0.8 },
    roomsTitle: {
      fontSize: 11,
      fontWeight: '600',
      color: c.sea,
      textTransform: 'uppercase',
      marginBottom: 8,
    },
    roomsHint: {
      marginTop: 8,
      fontSize: 11,
      lineHeight: 15,
      color: c.subtle,
      backgroundColor: c.sand,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.line,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    roomCard: {
      flexDirection: 'row',
      gap: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.paper,
      padding: 10,
    },
    roomThumb: { width: 64, height: 64, borderRadius: 8 },
    roomBody: { flex: 1, minWidth: 0 },
    roomType: { fontWeight: '500', color: c.ink },
    mealRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
    mealChip: {
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.sand,
      paddingHorizontal: 6,
      paddingVertical: 3,
    },
    mealText: { fontSize: 10, color: c.ink, opacity: 0.8 },
    roomFooter: {
      marginTop: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    destGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    destCard: {
      width: '48%',
      borderRadius: 12,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.paper,
    },
    destImage: { width: '100%', height: 96 },
    destFallback: { backgroundColor: c.sand },
    destOverlay: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 36,
      padding: 8,
    },
    destName: { color: c.white, fontWeight: '600', fontSize: 13 },
    destCountry: { color: 'rgba(255,255,255,0.85)', fontSize: 11 },
    destTagline: {
      fontSize: 11,
      lineHeight: 14,
      color: c.ink,
      opacity: 0.8,
      paddingHorizontal: 8,
      paddingVertical: 6,
    },
  })
}
