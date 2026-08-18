import { createRoot } from 'react-dom/client'
import { RuntimeProvider } from './app/runtime.tsx'
import { AppFrame } from './ui/AppFrame.tsx'
import { PluginProvider } from './plugin/hub.tsx'
import './styles.css'

// M1 replica renderer entry (bare Vite + ?fixture). The React tree hangs off
// the RuntimeProvider which owns the B-direct-assembly data layer.
function Root(): JSX.Element {
  return (
    <PluginProvider>
      <RuntimeProvider>
        <AppFrame />
      </RuntimeProvider>
    </PluginProvider>
  )
}

const el = document.getElementById('root')
if (el === null) throw new Error('replica: #root missing')
createRoot(el).render(<Root />)
