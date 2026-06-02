import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_STATE } from '../../state/app-state'
import {
  buildVisualizerGraph,
  DEFAULT_VISUALIZER_FILTER,
} from '../../visualizer/visualizer-graph'
import { VisualizerTopbarControls, VisualizerView } from './VisualizerView'

vi.mock('@xyflow/react', () => ({
  Background: () => <div className="react-flow__background" />,
  Controls: () => <div className="react-flow__controls" />,
  Handle: ({ id, position, type }: { id?: string; position: string; type: string }) => (
    <span className="mock-flow-handle" data-handle-id={id} data-position={position} data-type={type} />
  ),
  MiniMap: ({
    bgColor,
    className,
    maskColor,
    maskStrokeColor,
    maskStrokeWidth,
    nodeBorderRadius,
    nodeColor,
    nodeStrokeColor,
    nodeStrokeWidth,
  }: {
    bgColor?: string
    className?: string
    maskColor?: string
    maskStrokeColor?: string
    maskStrokeWidth?: number
    nodeBorderRadius?: number
    nodeColor?: unknown
    nodeStrokeColor?: unknown
    nodeStrokeWidth?: number
  }) => (
    <div
      className={className ?? 'react-flow__minimap'}
      data-bg-color={bgColor}
      data-has-node-color={typeof nodeColor === 'function'}
      data-has-node-stroke-color={typeof nodeStrokeColor === 'function'}
      data-mask-color={maskColor}
      data-mask-stroke-color={maskStrokeColor}
      data-mask-stroke-width={maskStrokeWidth}
      data-node-border-radius={nodeBorderRadius}
      data-node-stroke-width={nodeStrokeWidth}
    />
  ),
  Position: { Bottom: 'bottom', Top: 'top' },
  ReactFlow: ({
    children,
    edges,
    nodes,
    nodeTypes,
    onNodeMouseEnter,
    onNodeMouseLeave,
  }: {
    children: ReactNode
    edges: Array<{ id: string; sourceHandle?: string; targetHandle?: string }>
    nodes: Array<{ id: string; type?: string; data: unknown }>
    nodeTypes: Record<string, (props: { data: unknown }) => ReactNode>
    onNodeMouseEnter?: unknown
    onNodeMouseLeave?: unknown
  }) => (
    <div
      className="react-flow"
      data-edge-count={edges.length}
      data-has-node-mouse-enter={Boolean(onNodeMouseEnter)}
      data-has-node-mouse-leave={Boolean(onNodeMouseLeave)}
      data-node-count={nodes.length}
    >
      {nodes.map((node) => {
        const NodeComponent = nodeTypes[node.type ?? '']
        return NodeComponent ? <div key={node.id} className="react-flow__node">{NodeComponent({ data: node.data })}</div> : null
      })}
      {edges.map((edge) => (
        <span
          key={edge.id}
          className="mock-flow-edge"
          data-source-handle={edge.sourceHandle}
          data-target-handle={edge.targetHandle}
        />
      ))}
      {children}
    </div>
  ),
  ReactFlowProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

const noop = () => undefined

describe('VisualizerView', () => {
  it('renders a full-screen graph shell without a utility card and opens the preview as a drawer', () => {
    const graph = buildVisualizerGraph(DEFAULT_STATE)
    const nodeId = graph.nodes[0]?.id ?? ''
    const emptyHtml = renderToStaticMarkup(
      <VisualizerView
        graph={graph}
        selectedNodeId=""
        onSelectedNodeChange={noop}
        onClosePreview={noop}
        onOpenLocation={noop}
      />,
    )
    const selectedHtml = renderToStaticMarkup(
      <VisualizerView
        graph={graph}
        selectedNodeId={nodeId}
        onSelectedNodeChange={noop}
        onClosePreview={noop}
        onOpenLocation={noop}
      />,
    )

    expect(emptyHtml).toContain('class="visualizer-view"')
    expect(emptyHtml).toContain('class="visualizer-graph-panel"')
    expect(emptyHtml).not.toContain('utility-page-card')
    expect(emptyHtml).not.toContain('visualizer-preview-panel')
    expect(selectedHtml).toContain('class="visualizer-preview-panel"')
    expect(selectedHtml).toContain('aria-label="Close preview"')
  })

  it('renders top and bottom handles, compact nodes, and selected hierarchy chips', () => {
    const graph = buildVisualizerGraph(DEFAULT_STATE)
    const nodeId = graph.nodes.find((node) => node.kind === 'parent')?.id ?? graph.nodes[0]?.id ?? ''
    const selectedNode = graph.nodes.find((node) => node.id === nodeId)
    const selectedHtml = renderToStaticMarkup(
      <VisualizerView
        graph={graph}
        selectedNodeId={nodeId}
        onSelectedNodeChange={noop}
        onClosePreview={noop}
        onOpenLocation={noop}
      />,
    )

    expect(selectedHtml).toContain('data-handle-id="visualizer-target-top"')
    expect(selectedHtml).toContain('data-handle-id="visualizer-source-top"')
    expect(selectedHtml).toContain('data-handle-id="visualizer-target-bottom"')
    expect(selectedHtml).toContain('data-handle-id="visualizer-source-bottom"')
    expect(selectedHtml).toContain('class="visualizer-node-label"')
    expect(selectedHtml).toContain('class="visualizer-node-hierarchy"')
    expect(selectedHtml).toContain('visualizer-hierarchy-chip rail-control context-preview-title-btn')
    expect(selectedHtml).toContain('visualizer-node visualizer-node-parent is-selected')
    selectedNode?.hierarchyChips?.forEach((chip) => {
      expect(selectedHtml).toContain(`>${chip.label}</span>`)
    })
    expect(selectedHtml).not.toContain('visualizer-node-kind')
    expect(selectedHtml).not.toContain('visualizer-node-detail')
    expect(selectedHtml).not.toContain('is-dimmed')
  })

  it('does not pass hover handlers to React Flow and configures the minimap palette', () => {
    const graph = buildVisualizerGraph(DEFAULT_STATE)
    const html = renderToStaticMarkup(
      <VisualizerView
        graph={graph}
        selectedNodeId=""
        onSelectedNodeChange={noop}
        onClosePreview={noop}
        onOpenLocation={noop}
      />,
    )

    expect(html).toContain('data-has-node-mouse-enter="false"')
    expect(html).toContain('data-has-node-mouse-leave="false"')
    expect(html).toContain('data-bg-color="var(--settings-page-bg)"')
    expect(html).toContain('data-mask-color="color-mix(in srgb, var(--settings-page-bg) 56%, transparent)"')
    expect(html).toContain('data-mask-stroke-color="var(--app-primary-border)"')
    expect(html).toContain('data-mask-stroke-width="1.5"')
    expect(html).toContain('data-node-border-radius="4"')
    expect(html).toContain('data-node-stroke-width="1"')
    expect(html).toContain('data-has-node-color="true"')
    expect(html).toContain('data-has-node-stroke-color="true"')
  })

  it('renders preview drawer hierarchy chips instead of a plain breadcrumb path', () => {
    const graph = buildVisualizerGraph(DEFAULT_STATE)
    const nodeId = graph.nodes.find((node) => node.preview?.hierarchyChips.length)?.id ?? graph.nodes[0]?.id ?? ''
    const selectedHtml = renderToStaticMarkup(
      <VisualizerView
        graph={graph}
        selectedNodeId={nodeId}
        onSelectedNodeChange={noop}
        onClosePreview={noop}
        onOpenLocation={noop}
      />,
    )

    expect(selectedHtml).toContain('class="visualizer-preview-hierarchy"')
    expect(selectedHtml).toContain('visualizer-hierarchy-chip rail-control context-preview-title-btn')
    expect(selectedHtml).not.toContain('visualizer-preview-path')
  })

  it('renders visualizer filter buttons for the top bar', () => {
    const graph = buildVisualizerGraph(DEFAULT_STATE)
    const html = renderToStaticMarkup(
      <VisualizerTopbarControls
        graph={graph}
        filter={DEFAULT_VISUALIZER_FILTER}
        onFilterChange={(updater) => {
          updater(DEFAULT_VISUALIZER_FILTER)
        }}
      />,
    )

    expect(html).toContain('class="visualizer-filter-shell"')
    expect(html).toContain('>duplicates</button>')
    expect(html).toContain('>tags</button>')
    expect(html).toContain('>front matter</button>')
    expect(html).toContain('>clear filter</button>')
  })
})
