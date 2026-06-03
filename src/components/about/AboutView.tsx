import { useEffect, useState } from 'react'

export type RuntimeInfo = {
  version: string
  platform: string
}

export function AboutViewContent({
  runtimeInfo,
  runtimeUnavailable = false,
}: {
  runtimeInfo: RuntimeInfo | null
  runtimeUnavailable?: boolean
}) {
  return (
    <section className="utility-page-wrap about-view" aria-label="About Tabs">
      <div className="utility-page-card about-view-card">
        <h2>Tabs</h2>
        <p>
          Tabs is a local-first notebook for organizing notes across domains, spaces, parents, subtabs, and aisles.
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

export function AboutView() {
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

  return <AboutViewContent runtimeInfo={runtimeInfo} runtimeUnavailable={runtimeUnavailable} />
}
