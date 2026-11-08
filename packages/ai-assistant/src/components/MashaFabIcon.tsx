import type { ReactNode } from 'react'

/**
 * Значок кнопки Маши: внутри оранжевого круга по очереди сменяются сценарии путешествий
 * (владелец, 09.11.2026: «смена образов» — искра ИИ, направления, отдых с детьми и т. д.).
 * Только SVG и CSS (стили — `.masha-fab*` в styles.css), без картинок и библиотек.
 * Кладётся внутрь круглой кнопки и занимает её целиком; кнопке нужен `position: relative`.
 * Сайт: кнопка ChatWidget (компьютер) и MobileMilaChat (телефон, totus_WEB).
 */

type Frame = { key: string; title: string; icon: ReactNode }

const STROKE = {
  fill: 'none',
  stroke: '#fff',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export const MASHA_FAB_FRAMES: Frame[] = [
  {
    key: 'spark',
    title: 'Маша — ИИ-ассистент',
    icon: <path fill="#fff" d="M12 1.5C12.7 7.3 16.7 11.3 22.5 12C16.7 12.7 12.7 16.7 12 22.5C11.3 16.7 7.3 12.7 1.5 12C7.3 11.3 11.3 7.3 12 1.5Z" />,
  },
  {
    key: 'plane',
    title: 'Перелёт',
    icon: <path fill="#fff" d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />,
  },
  {
    key: 'egypt',
    title: 'Египет',
    icon: (
      <g {...STROKE}>
        <path d="M2.5 20 9 8.5 15.5 20Z" />
        <path d="M9 8.5 10.6 20" />
        <path d="M13.2 15.9 16.8 10l4.7 10" />
        <circle cx="18.5" cy="4.8" r="1.9" />
        <path d="M2 20h20" />
      </g>
    ),
  },
  {
    key: 'turkey',
    title: 'Турция',
    icon: (
      <g {...STROKE}>
        <path d="M12 2.5c-4 0-6.6 2.9-6.6 6.5 0 3.3 2.6 5.8 4.7 7.5h3.8c2.1-1.7 4.7-4.2 4.7-7.5 0-3.6-2.6-6.5-6.6-6.5Z" />
        <path d="M12 2.5c-1.9 2.1-2.6 4.4-2.6 6.6 0 2.7 1 5.2 2.6 7.4 1.6-2.2 2.6-4.7 2.6-7.4 0-2.2-.7-4.5-2.6-6.6" />
        <path d="m10.1 16.5.5 2.6M13.9 16.5l-.5 2.6" />
        <rect x="10.2" y="19.1" width="3.6" height="2.6" rx=".6" />
      </g>
    ),
  },
  {
    key: 'palm',
    title: 'Таиланд, Мальдивы',
    icon: (
      <g {...STROKE}>
        <path d="M12.5 21c-.2-4.2.4-7.4 1.8-10" />
        <path d="M14.3 11c-1.5-2.6-4.4-3.6-7.8-2.6 2.6.2 4.6 1 5.6 2.3" />
        <path d="M14.3 11c.4-3 2.6-5 6.2-5.2-2.6 1-4 2.6-4.4 4.6" />
        <path d="M14.3 11c-2.3-1.8-2.9-4.6-1.6-7.8.2 2.8 1.1 4.9 2.5 6.3" />
        <path d="M14.3 11c2.6-.4 5 .9 6.6 3.8-2-1.6-4-2.2-5.8-2" />
        <path d="M3 21c3-1.4 6-1.4 9 0s6 1.4 9 0" />
      </g>
    ),
  },
  {
    key: 'family',
    title: 'Отдых с детьми',
    icon: (
      <g {...STROKE}>
        <circle cx="8" cy="5.2" r="2.2" />
        <path d="M4.6 21v-7.2a3.4 3.4 0 0 1 6.8 0V21" />
        <circle cx="16.8" cy="10.2" r="1.7" />
        <path d="M14.3 21v-4.6a2.5 2.5 0 0 1 5 0V21" />
        <path d="m11.4 15.6 2.9 1.6" />
      </g>
    ),
  },
  {
    key: 'uae',
    title: 'ОАЭ',
    icon: (
      <g {...STROKE}>
        <path d="M12 2v2.5M12 4.5l1.3 5.5.9 11H9.8l.9-11Z" />
        <path d="M4 21v-7.5h3.8V21M16.2 21v-9.5H20V21" />
        <path d="M2.5 21h19" />
      </g>
    ),
  },
  {
    key: 'beach',
    title: 'Пляжный отдых',
    icon: (
      <g {...STROKE}>
        <path d="M3.5 11a8.5 8.5 0 0 1 17 0Z" />
        <path d="M8.6 11c0-3.7 1.3-6.6 3.4-8.5 2.1 1.9 3.4 4.8 3.4 8.5" />
        <path d="M12 11v8" />
        <path d="M3 21c3-1.4 6-1.4 9 0s6 1.4 9 0" />
      </g>
    ),
  },
  {
    key: 'mountains',
    title: 'Горы, Сочи',
    icon: (
      <g {...STROKE}>
        <path d="M2 20.5 8.8 8.5l6.2 11" />
        <path d="m5.9 13.6 1.4 1 1.5-1.2 1.4 1" />
        <path d="M18 6.5 14.6 12h2.1l-2.9 5h8.4l-2.9-5h2.1Z" />
        <path d="M18 17v3.5M2 20.5h20" />
      </g>
    ),
  },
  {
    key: 'tours',
    title: 'Экскурсии',
    icon: (
      <g {...STROKE}>
        <path d="M3.5 8.5a2 2 0 0 1 2-2h2.3l1.4-2h5.6l1.4 2h2.3a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" />
        <circle cx="12" cy="13" r="3.6" />
      </g>
    ),
  },
  {
    key: 'suitcase',
    title: 'Собираемся в отпуск',
    icon: (
      <g {...STROKE}>
        <rect x="4" y="7.5" width="16" height="12.5" rx="2.2" />
        <path d="M9 7.5V5.3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2.2M8.3 7.5V20M15.7 7.5V20" />
      </g>
    ),
  },
  {
    key: 'chat',
    title: 'Чат с Машей',
    icon: (
      <g {...STROKE}>
        <path d="M5 4.5h14a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-7l-4.6 3.6V17H5a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2Z" />
        <path d="M8 10.8h.01M12 10.8h.01M16 10.8h.01" strokeWidth={2.6} />
      </g>
    ),
  },
]

/** Сколько секунд показан один сценарий. Должно совпадать с `--masha-fab-step` в styles.css. */
export const MASHA_FAB_STEP_S = 2

export function MashaFabIcon() {
  return (
    <span className="masha-fab" aria-hidden="true">
      <span className="masha-fab__ring" />
      <span className="masha-fab__core" />
      {MASHA_FAB_FRAMES.map((f, i) => (
        <span key={f.key} className={i === 0 ? 'masha-fab__frame masha-fab__frame--first' : 'masha-fab__frame'} style={{ animationDelay: `${i * MASHA_FAB_STEP_S}s` }}>
          <svg viewBox="0 0 24 24" focusable="false">
            {f.icon}
          </svg>
        </span>
      ))}
    </span>
  )
}
