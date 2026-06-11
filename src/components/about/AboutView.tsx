import { useEffect, useState } from 'react'
import type { AboutSection } from '../../types/app'

export type RuntimeInfo = {
  version: string
  platform: string
}

export function AboutViewContent({
  section = 'home',
  runtimeInfo,
  runtimeUnavailable = false,
}: {
  section?: AboutSection
  runtimeInfo: RuntimeInfo | null
  runtimeUnavailable?: boolean
}) {
  if (section === 'donation') {
    return (
      <section className="utility-page-wrap about-view" aria-label="About Tabs">
        <div className="utility-page-card about-view-card">
          <h2>donation</h2>
          <p>
            Tabs is free to use and intended to be open source. Donation and support options can be added here later.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="utility-page-wrap about-view" aria-label="About Tabs">
      <div className="utility-page-card about-view-card">
        <h2>Tabs</h2>
        <p>
          Tabs is a local-first notebook for organizing notes across domains, spaces, parents, subtabs, and aisles.
        </p>
        <p>
          Toolbar and app icons include icons from Lucide.dev.
        </p>
        <dl className="about-runtime-list">
          <div>
            <dt>version</dt>
            <dd>{runtimeInfo?.version ?? (runtimeUnavailable ? 'unavailable' : 'loading...')}</dd>
          </div>
          <div>
            <dt>platform</dt>
            <dd>{runtimeInfo?.platform ?? (runtimeUnavailable ? 'browser' : 'loading...')}</dd>
          </div>
        </dl>
      </div>
    </section>
  )
}

export function AboutView({ section = 'home' }: { section?: AboutSection }) {
  const [runtimeInfo, setRuntimeInfo] = useState<RuntimeInfo | null>(null)
  const [runtimeUnavailable, setRuntimeUnavailable] = useState(false)

  useEffect(() => {
    let canceled = false
    const getRuntimeInfo = window.electronAPI?.getRuntimeInfo
    if (!getRuntimeInfo) {
      setRuntimeUnavailable(true)
      return () => {
        canceled = true
      }
    }

    void getRuntimeInfo()
      .then((info) => {
        if (canceled) return
        setRuntimeInfo(info)
        setRuntimeUnavailable(false)
      })
      .catch(() => {
        if (!canceled) setRuntimeUnavailable(true)
      })

    return () => {
      canceled = true
    }
  }, [])

  return <AboutViewContent section={section} runtimeInfo={runtimeInfo} runtimeUnavailable={runtimeUnavailable} />
}
