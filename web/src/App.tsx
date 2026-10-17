import { Navigate, Route, Routes } from 'react-router-dom'
import Gateway from './pages/Gateway'
import Console from './pages/Console'
import { ConsentBanner } from './components/ConsentBanner'

/**
 * Exactly two pages, as required:
 *   /         the Gateway  (marketing + access)
 *   /console  the Console  (the product; panels switch via ?panel=)
 * Anything else redirects to the Gateway rather than 404-ing.
 */
export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Gateway />} />
        <Route path="/console" element={<Console />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ConsentBanner />
    </>
  )
}
