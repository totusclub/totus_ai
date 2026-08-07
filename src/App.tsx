import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HomePage } from '@/pages/HomePage'
import { TourDetailPage } from '@/pages/TourDetailPage'
import { ChatWidget } from '@/components/ChatWidget'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="min-h-screen">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/tours/:id" element={<TourDetailPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <ChatWidget />
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
