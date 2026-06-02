import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  Controls,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  Handle,
  useReactFlow,
  type Edge as FlowEdge,
  type Node as FlowNode,
  type NodeMouseHandler,
  type NodeProps,
} from '@xyflow/react'
import type { FrontmatterFieldType, NoteLocation, VisualizerLayoutMode } from '../../types/app'
import {
  DEFAULT_VISUALIZER_FILTER,
  normalizeVisualizerFilter,
  type VisualizerEdgeKind,
  type VisualizerFilterState,
  type VisualizerGraph,
  type VisualizerGraphNode,
  type VisualizerHierarchyChip,
  type VisualizerHierarchyChipKind,
  type VisualizerMode,
  type VisualizerNodeKind,
} from '../../visualizer/visualizer-graph'

type VisualizerViewProps = {
  graph: VisualizerGraph
  selectedNodeId: string
  onSelectedNodeChange: (nodeId: string) => void
  onClosePreview: () => void
  onOpenLocation: (location: NoteLocation, aisleId?: string) => void
}

type VisualizerTopbarControlsProps = {
  graph: VisualizerGraph
  filter: VisualizerFilterState
  onFilterChange: (updater: (filter: VisualizerFilterState) => VisualizerFilterState) => void
}

type VisualizerSettingsPopoverProps = {
  homeNodesResideInParent: boolean
  layoutMode: VisualizerLayoutMode
  onHomeNodesResideInParentChange: (enabled: boolean) => void
  onLayoutModeChange: (mode: VisualizerLayoutMode) => void
  onClose: () => void
}

type VisualizerFlowNodeData = Record<string, unknown> & {
  graphNode: VisualizerGraphNode
  selected: boolean
  highlighted: boolean
  dimmed: boolean
}

type VisualizerFlowNode = FlowNode<VisualizerFlowNodeData, 'visualizer'>

const NODE_KIND_LABELS: Record<VisualizerNodeKind, string> = {
  domain: 'domain',
  space: 'space',
  parent: 'parent',
  note: 'note',
  subtab: 'subtab',
  aisle: 'aisle',
  tag: 'tag',
  'duplicate-group': 'duplicate',
  'frontmatter-template': 'template',
  'frontmatter-field': 'field',
  'frontmatter-type': 'type',
}

const EDGE_KIND_LABELS: Record<VisualizerEdgeKind, string> = {
  hierarchy: 'hierarchy',
  'duplicate-note': 'duplicate note',
  'duplicate-aisle': 'duplicate aisle',
  tag: 'tag',
  'frontmatter-template': 'template',
  'frontmatter-field': 'field',
  'frontmatter-type': 'field type',
  'aisle-slot': 'aisle',
}

const FRONTMATTER_FIELD_TYPES: Array<FrontmatterFieldType | ''> = ['', 'text', 'number', 'boolean', 'date', 'datetime', 'list']
const VISUALIZER_FILTER_MODES = ['duplicates', 'tags', 'frontmatter'] as const
type VisualizerFilterPopover = (typeof VISUALIZER_FILTER_MODES)[number]
const VISUALIZER_LAYOUT_CHOICES: Array<{ mode: VisualizerLayoutMode; label: string }> = [
  { mode: 'wedge-fan', label: 'wedge fan' },
  { mode: 'strict-rings', label: 'strict rings' },
  { mode: 'compact-cluster', label: 'compact cluster' },
  { mode: 'link-tree', label: 'link tree' },
]

function getHierarchyChipClassName(kind: VisualizerHierarchyChipKind) {
  if (kind === 'domain') {
    return 'visualizer-hierarchy-chip rail-control context-preview-title-btn compact-scope-btn compact-domain-btn is-domain'
  }
  if (kind === 'space') {
    return 'visualizer-hierarchy-chip rail-control context-preview-title-btn compact-scope-btn compact-space-btn is-space'
  }
  if (kind === 'parent') {
    return 'visualizer-hierarchy-chip rail-control context-preview-title-btn btn btn-sm tab-btn parent-tab-btn is-parent'
  }
  return 'visualizer-hierarchy-chip rail-control context-preview-title-btn btn btn-sm tab-btn subtab-btn is-subtab'
}

function VisualizerHierarchyChips({
  chips,
  className,
}: {
  chips: VisualizerHierarchyChip[]
  className: string
}) {
  if (chips.length === 0) return null
  return (
    <div className={className} aria-label="hierarchy">
      {chips.map((chip, index) => (
        <span key={`${chip.kind}:${chip.label}:${index}`} className={getHierarchyChipClassName(chip.kind)}>
          {chip.label}
        </span>
      ))}
    </div>
  )
}

function VisualizerNode({ data }: NodeProps<VisualizerFlowNode>) {
  const graphNode = data.graphNode
  const hierarchyChips = graphNode.hierarchyChips ?? []
  return (
    <button
      type="button"
      className={`visualizer-node visualizer-node-${graphNode.kind} ${data.selected ? 'is-selected' : ''} ${
        data.highlighted ? 'is-highlighted' : ''
      } ${data.dimmed ? 'is-dimmed' : ''}`}
      title={graphNode.detailLabel}
    >
      <Handle id="visualizer-target-top" type="target" position={Position.Top} className="visualizer-node-handle" />
      <Handle id="visualizer-source-top" type="source" position={Position.Top} className="visualizer-node-handle" />
      <VisualizerHierarchyChips chips={hierarchyChips} className="visualizer-node-hierarchy" />
      <span className="visualizer-node-label">{graphNode.label}</span>
      {graphNode.count > 0 ? <span className="visualizer-node-count">{graphNode.count > 99 ? '>99' : graphNode.count}</span> : null}
      <Handle id="visualizer-target-bottom" type="target" position={Position.Bottom} className="visualizer-node-handle" />
      <Handle id="visualizer-source-bottom" type="source" position={Position.Bottom} className="visualizer-node-handle" />
    </button>
  )
}

const nodeTypes = { visualizer: VisualizerNode }

function getNodeColor(kind: VisualizerNodeKind): string {
  if (kind === 'domain') return 'var(--domain-rail-accent)'
  if (kind === 'space') return 'var(--space-rail-accent)'
  if (kind === 'parent') return 'var(--parent-rail-accent)'
  if (kind === 'note' || kind === 'subtab') return 'var(--subtab-rail-accent)'
  if (kind === 'tag') return 'var(--editor-tag-bg)'
  if (kind === 'duplicate-group') return 'var(--app-primary)'
  if (kind.startsWith('frontmatter')) return 'var(--app-warning)'
  return 'var(--app-border)'
}

function buildFlowNodes(
  graph: VisualizerGraph,
  selectedNodeId: string,
): VisualizerFlowNode[] {
  const focused = graph.highlightedNodeIds.size > 0
  const highlighted = focused ? graph.highlightedNodeIds : new Set<string>()
  const hasHighlight = highlighted.size > 0
  return graph.nodes.map((node) => ({
    id: node.id,
    type: 'visualizer',
    position: node.position,
    data: {
      graphNode: node,
      selected: node.id === selectedNodeId || graph.selectedNodeIds.has(node.id),
      highlighted: highlighted.has(node.id),
      dimmed: hasHighlight && !highlighted.has(node.id),
    },
    draggable: false,
    selectable: true,
    className: `visualizer-flow-node visualizer-flow-node-${node.kind}`,
  }))
}

function buildFlowEdges(graph: VisualizerGraph): FlowEdge[] {
  const focused = graph.highlightedNodeIds.size > 0
  const highlighted = focused ? graph.highlightedNodeIds : new Set<string>()
  const hasHighlight = highlighted.size > 0
  return graph.edges.map((edge) => {
    const edgeHighlighted = highlighted.has(edge.source) && highlighted.has(edge.target)
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      label: edge.kind === 'hierarchy' || edge.kind === 'aisle-slot' ? undefined : edge.label || EDGE_KIND_LABELS[edge.kind],
      className: `visualizer-edge visualizer-edge-${edge.kind} ${
        edgeHighlighted ? 'is-highlighted' : ''
      } ${hasHighlight && !edgeHighlighted ? 'is-dimmed' : ''}`,
      animated: edge.kind === 'tag' || edge.kind === 'duplicate-note' || edge.kind === 'duplicate-aisle',
    }
  })
}

function getGraphLayoutSignature(graph: VisualizerGraph): string {
  return graph.nodes
    .map((node) => `${node.id}:${node.position.x.toFixed(2)}:${node.position.y.toFixed(2)}`)
    .sort()
    .join('|')
}

function VisualizerGraphCanvas({
  graph,
  selectedNodeId,
  onSelectedNodeChange,
}: {
  graph: VisualizerGraph
  selectedNodeId: string
  onSelectedNodeChange: (nodeId: string) => void
}) {
  const flowNodes = useMemo(() => buildFlowNodes(graph, selectedNodeId), [graph, selectedNodeId])
  const flowEdges = useMemo(() => buildFlowEdges(graph), [graph])
  const layoutSignature = useMemo(() => getGraphLayoutSignature(graph), [graph])
  const { fitView } = useReactFlow()

  const handleNodeClick = useCallback<NodeMouseHandler<VisualizerFlowNode>>(
    (_event, node) => {
      onSelectedNodeChange(node.id)
    },
    [onSelectedNodeChange],
  )

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      fitView({ padding: 0.18, duration: 120 })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [fitView, layoutSignature])

  return (
    <ReactFlow
      nodes={flowNodes}
      edges={flowEdges}
      nodeTypes={nodeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      minZoom={0.2}
      maxZoom={2.4}
      onlyRenderVisibleElements
      onNodeClick={handleNodeClick}
    >
      <Background gap={28} size={1} className="visualizer-background" />
      <MiniMap
        pannable
        zoomable
        nodeColor={(node) => getNodeColor((node.data?.graphNode as VisualizerGraphNode | undefined)?.kind ?? 'note')}
        nodeStrokeColor={(node) => {
          const kind = (node.data?.graphNode as VisualizerGraphNode | undefined)?.kind ?? 'note'
          if (kind === 'domain') return 'var(--domain-rail-border)'
          if (kind === 'space') return 'var(--space-rail-border)'
          if (kind === 'parent') return 'var(--parent-rail-border)'
          if (kind === 'note' || kind === 'subtab' || kind === 'aisle') return 'var(--subtab-rail-border)'
          if (kind === 'tag') return 'var(--editor-tag-bg)'
          if (kind === 'duplicate-group') return 'var(--app-primary-border)'
          if (kind.startsWith('frontmatter')) return 'var(--toast-warning)'
          return 'var(--app-border)'
        }}
        nodeStrokeWidth={1}
        nodeBorderRadius={4}
        bgColor="var(--settings-page-bg)"
        maskColor="color-mix(in srgb, var(--settings-page-bg) 56%, transparent)"
        maskStrokeColor="var(--app-primary-border)"
        maskStrokeWidth={1.5}
        className="visualizer-minimap"
      />
      <Controls showInteractive={false} className="visualizer-controls" />
    </ReactFlow>
  )
}

function getModeLabel(mode: VisualizerMode) {
  if (mode === 'frontmatter') return 'front matter'
  return mode
}

export function VisualizerTopbarControls({
  graph,
  filter,
  onFilterChange,
}: VisualizerTopbarControlsProps) {
  const [openPopover, setOpenPopover] = useState<VisualizerFilterPopover | null>(null)
  const shellRef = useRef<HTMLDivElement | null>(null)
  const selectedTagKeys = useMemo(() => new Set(filter.selectedTagKeys), [filter.selectedTagKeys])
  const selectedDuplicateGroupId = filter.duplicateGroupId

  useEffect(() => {
    if (!openPopover) return undefined
    const handlePointerDown = (event: PointerEvent) => {
      if (shellRef.current?.contains(event.target as Node)) return
      setOpenPopover(null)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenPopover(null)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [openPopover])

  const setMode = (mode: VisualizerFilterPopover) => {
    onFilterChange((previous) =>
      normalizeVisualizerFilter({
        ...previous,
        mode,
        focusedNodeId: '',
        duplicateGroupId: mode === 'duplicates' ? previous.duplicateGroupId : '',
      }),
    )
    setOpenPopover((previous) => (previous === mode ? null : mode))
  }

  const clearFilter = () => {
    onFilterChange(() => DEFAULT_VISUALIZER_FILTER)
    setOpenPopover(null)
  }

  return (
    <div ref={shellRef} className="visualizer-filter-shell">
      <div className="visualizer-filter-row" aria-label="Visualizer filters">
        {VISUALIZER_FILTER_MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={filter.mode === mode}
            aria-expanded={openPopover === mode}
            className={`btn btn-sm ${filter.mode === mode ? 'btn-primary' : 'btn-outline-secondary'} tab-btn parent-tab-btn visualizer-filter-btn`}
            onClick={() => setMode(mode)}
          >
            {getModeLabel(mode)}
          </button>
        ))}
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary tab-btn parent-tab-btn visualizer-filter-btn"
          onClick={clearFilter}
        >
          clear filter
        </button>
      </div>

      {openPopover === 'tags' && (
        <div className="visualizer-filter-detail visualizer-filter-popover visualizer-tag-filter-detail" aria-label="Tag visualizer filter">
          <button
            type="button"
            className={`visualizer-filter-command ${filter.tagSortMode === 'az' ? 'is-selected' : ''}`}
            onClick={() => onFilterChange((previous) => normalizeVisualizerFilter({ ...previous, tagSortMode: 'az' }))}
          >
            A-Z
          </button>
          <button
            type="button"
            className={`visualizer-filter-command ${filter.tagSortMode === 'occurrences' ? 'is-selected' : ''}`}
            onClick={() => onFilterChange((previous) => normalizeVisualizerFilter({ ...previous, tagSortMode: 'occurrences' }))}
          >
            occurrences
          </button>
          <button
            type="button"
            className="visualizer-filter-command"
            onClick={() =>
              onFilterChange((previous) =>
                normalizeVisualizerFilter({ ...previous, selectedTagKeys: graph.availableTags.map((tag) => tag.key), focusedNodeId: '' }),
              )
            }
          >
            select all
          </button>
          <button
            type="button"
            className="visualizer-filter-command"
            onClick={() => onFilterChange((previous) => normalizeVisualizerFilter({ ...previous, selectedTagKeys: [], focusedNodeId: '' }))}
          >
            deselect all
          </button>
          <div className="visualizer-tag-grid">
            {graph.availableTags.map((tag) => (
              <button
                key={tag.key}
                type="button"
                className={`visualizer-tag-btn tabs-tag-token ${selectedTagKeys.has(tag.key) ? 'is-selected' : ''}`}
                title={`${tag.count} ${tag.count === 1 ? 'occurrence' : 'occurrences'}`}
                onClick={() =>
                  onFilterChange((previous) => {
                    const next = new Set(previous.selectedTagKeys)
                    if (next.has(tag.key)) next.delete(tag.key)
                    else next.add(tag.key)
                    return normalizeVisualizerFilter({ ...previous, selectedTagKeys: [...next], focusedNodeId: '' })
                  })
                }
              >
                #{tag.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {openPopover === 'duplicates' && (
        <div className="visualizer-filter-detail visualizer-filter-popover" aria-label="Duplicate visualizer filter">
          <button
            type="button"
            className={`visualizer-filter-command ${!selectedDuplicateGroupId ? 'is-selected' : ''}`}
            onClick={() => onFilterChange((previous) => normalizeVisualizerFilter({ ...previous, duplicateGroupId: '', focusedNodeId: '' }))}
          >
            all groups
          </button>
          <div className="visualizer-duplicate-group-grid">
            {graph.duplicateGroups.map((group) => (
              <button
                key={group.id}
                type="button"
                className={`visualizer-relationship-btn ${selectedDuplicateGroupId === group.id ? 'is-selected' : ''}`}
                onClick={() =>
                  onFilterChange((previous) =>
                    normalizeVisualizerFilter({ ...previous, duplicateGroupId: group.id, focusedNodeId: group.id }),
                  )
                }
              >
                {group.kind} ({group.count})
              </button>
            ))}
          </div>
        </div>
      )}

      {openPopover === 'frontmatter' && (
        <div className="visualizer-filter-detail visualizer-filter-popover visualizer-frontmatter-filter" aria-label="Front matter visualizer filter">
          <label className="visualizer-field">
            <span>template</span>
            <input
              className="form-control"
              value={filter.frontmatter.templateQuery}
              onChange={(event) =>
                onFilterChange((previous) =>
                  normalizeVisualizerFilter({
                    ...previous,
                    focusedNodeId: '',
                    frontmatter: { ...previous.frontmatter, templateQuery: event.target.value },
                  }),
                )
              }
            />
          </label>
          <label className="visualizer-field">
            <span>template link</span>
            <select
              className="form-select"
              value={filter.frontmatter.selectedTemplateId}
              onChange={(event) =>
                onFilterChange((previous) =>
                  normalizeVisualizerFilter({
                    ...previous,
                    focusedNodeId: '',
                    frontmatter: { ...previous.frontmatter, selectedTemplateId: event.target.value },
                  }),
                )
              }
            >
              <option value="">all matching</option>
              {graph.frontmatterTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
          <label className="visualizer-field">
            <span>field</span>
            <input
              className="form-control"
              value={filter.frontmatter.fieldQuery}
              onChange={(event) =>
                onFilterChange((previous) =>
                  normalizeVisualizerFilter({
                    ...previous,
                    focusedNodeId: '',
                    frontmatter: { ...previous.frontmatter, fieldQuery: event.target.value },
                  }),
                )
              }
            />
          </label>
          <label className="visualizer-field">
            <span>type</span>
            <select
              className="form-select"
              value={filter.frontmatter.selectedFieldType}
              onChange={(event) =>
                onFilterChange((previous) =>
                  normalizeVisualizerFilter({
                    ...previous,
                    focusedNodeId: '',
                    frontmatter: { ...previous.frontmatter, selectedFieldType: event.target.value as FrontmatterFieldType | '' },
                  }),
                )
              }
            >
              {FRONTMATTER_FIELD_TYPES.map((type) => (
                <option key={type || 'all'} value={type}>
                  {type || 'all'}
                </option>
              ))}
            </select>
          </label>
          <label className="visualizer-toggle">
            <input
              type="checkbox"
              checked={filter.frontmatter.includeMatchingFields}
              onChange={(event) =>
                onFilterChange((previous) =>
                  normalizeVisualizerFilter({
                    ...previous,
                    focusedNodeId: '',
                    frontmatter: { ...previous.frontmatter, includeMatchingFields: event.target.checked },
                  }),
                )
              }
            />
            <span>matching fields</span>
          </label>
          <label className="visualizer-toggle">
            <input
              type="checkbox"
              checked={filter.frontmatter.showAllUsage}
              onChange={(event) =>
                onFilterChange((previous) =>
                  normalizeVisualizerFilter({
                    ...previous,
                    focusedNodeId: '',
                    frontmatter: { ...previous.frontmatter, showAllUsage: event.target.checked },
                  }),
                )
              }
            />
            <span>all usage</span>
          </label>
        </div>
      )}
    </div>
  )
}

export function VisualizerSettingsPopover({
  homeNodesResideInParent,
  layoutMode,
  onHomeNodesResideInParentChange,
  onLayoutModeChange,
  onClose,
}: VisualizerSettingsPopoverProps) {
  const popoverRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (popoverRef.current?.contains(target)) return
      if (popoverRef.current?.closest('.topbar-action-wrap-visualizer-settings')?.contains(target)) return
      onClose()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  return (
    <section
      ref={popoverRef}
      className="visualizer-settings-popover"
      role="dialog"
      aria-labelledby="visualizer-settings-title"
    >
      <h2 id="visualizer-settings-title">visualizer settings</h2>
      <div className="visualizer-settings-layout-row">
        <span>layout</span>
        <div className="visualizer-layout-options" role="radiogroup" aria-label="visualizer layout">
          {VISUALIZER_LAYOUT_CHOICES.map((choice) => (
            <button
              key={choice.mode}
              type="button"
              role="radio"
              aria-checked={layoutMode === choice.mode}
              className={`visualizer-layout-option ${layoutMode === choice.mode ? 'is-selected' : ''}`}
              onClick={() => onLayoutModeChange(choice.mode)}
            >
              {choice.label}
            </button>
          ))}
        </div>
      </div>
      <label className="visualizer-settings-switch-row">
        <span>home nodes reside in parent</span>
        <span className="form-check form-switch settings-switch">
          <input
            type="checkbox"
            className="form-check-input"
            role="switch"
            aria-label="home nodes reside in parent"
            checked={homeNodesResideInParent}
            onChange={(event) => onHomeNodesResideInParentChange(event.target.checked)}
          />
        </span>
      </label>
    </section>
  )
}

function VisualizerPreviewDrawer({
  node,
  onClose,
  onOpenLocation,
}: {
  node: VisualizerGraphNode | null
  onClose: () => void
  onOpenLocation: (location: NoteLocation, aisleId?: string) => void
}) {
  if (!node) return null
  const preview = node.preview
  const hierarchyChips = preview?.hierarchyChips ?? node.previewHierarchyChips ?? []
  const showKindChip = hierarchyChips.length === 0
  return (
    <aside className="visualizer-preview-panel" aria-label="Visualizer selection">
      <button type="button" className="visualizer-preview-close-btn" onClick={onClose} aria-label="Close preview">
        ×
      </button>
      <div className="visualizer-preview-header">
        {showKindChip ? <span className={`visualizer-preview-kind visualizer-preview-kind-${node.kind}`}>{NODE_KIND_LABELS[node.kind]}</span> : null}
        <h2>{preview?.title ?? node.label}</h2>
      </div>
      {hierarchyChips.length > 0 ? (
        <VisualizerHierarchyChips chips={hierarchyChips} className="visualizer-preview-hierarchy" />
      ) : (
        <p className="visualizer-preview-path">{preview?.breadcrumb ?? node.hierarchyPath}</p>
      )}

      {preview ? (
        <>
          <dl className="visualizer-preview-list">
            <div>
              <dt>duplicates</dt>
              <dd>{preview.duplicateSummary}</dd>
            </div>
            <div>
              <dt>front matter</dt>
              <dd>{preview.frontmatterTemplateName || 'none'}</dd>
            </div>
            <div>
              <dt>aisles</dt>
              <dd>{preview.aisleCount}</dd>
            </div>
          </dl>
          {preview.tags.length > 0 && (
            <div className="visualizer-preview-tags">
              {preview.tags.map((tag) => (
                <span key={tag} className="tabs-tag-token">
                  #{tag}
                </span>
              ))}
            </div>
          )}
          {preview.frontmatterFields.length > 0 && (
            <div className="visualizer-preview-fields">
              {preview.frontmatterFields.map((field) => (
                <span key={field}>{field}</span>
              ))}
            </div>
          )}
          <p className="visualizer-preview-excerpt">{preview.markdownExcerpt}</p>
          {preview.location && preview.canOpen && (
            <button
              type="button"
              className="btn btn-sm btn-primary visualizer-open-note-btn"
              onClick={() => onOpenLocation(preview.location!, preview.aisleId)}
            >
              open note
            </button>
          )}
        </>
      ) : (
        <dl className="visualizer-preview-list">
          <div>
            <dt>relationships</dt>
            <dd>{node.count}</dd>
          </div>
          <div>
            <dt>kind</dt>
            <dd>{NODE_KIND_LABELS[node.kind]}</dd>
          </div>
        </dl>
      )}
    </aside>
  )
}

export function VisualizerView({
  graph,
  selectedNodeId,
  onSelectedNodeChange,
  onClosePreview,
  onOpenLocation,
}: VisualizerViewProps) {
  const selectedNode = selectedNodeId ? graph.nodes.find((node) => node.id === selectedNodeId) ?? null : null

  return (
    <section className="visualizer-view" aria-label="Visualizer">
      {graph.overflowNotice && <p className="visualizer-overflow-notice">{graph.overflowNotice}</p>}
      <div className="visualizer-workspace">
        <div className="visualizer-graph-panel" aria-label="Relationship graph">
          <ReactFlowProvider>
            <VisualizerGraphCanvas graph={graph} selectedNodeId={selectedNodeId} onSelectedNodeChange={onSelectedNodeChange} />
          </ReactFlowProvider>
        </div>
      </div>
      <VisualizerPreviewDrawer node={selectedNode} onClose={onClosePreview} onOpenLocation={onOpenLocation} />
    </section>
  )
}
