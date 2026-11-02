import type { Metadata } from 'next'
import { AppShell } from './AppShell'
import './globals.css'

export const metadata: Metadata = {
  title: 'Маша — подбор туров · Тотус клуб',
  description:
    'Маша — виртуальный турагент Тотус клуба: подбор туров, отелей и номеров в диалоге',
  icons: {
    icon: '/favicon.svg',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
