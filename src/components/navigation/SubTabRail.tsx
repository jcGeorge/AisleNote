import type { MouseEvent, PointerEvent as ReactPointerEvent, ReactNode, RefObject } from 'react'
import type {
  ArrangeDragItem,
  ArrangeModeState,
  ArrangeTapCandidateSeed,
  SelectionClickModifiers,
  SubTab,
  Tab,
  TabRenameEnterBehavior,
  TabArrangeDragItem,
  TabArrangeDragPreview,
  TrashParentBucket,
  ViewMode,
} from '../../types/app'
import { getPlacementNeighborId } from '../../arrange/arrange-utils'
import { getRenameInputKeyAction, shouldCreateAnotherTabAfterRenameEnter } from '../../navigation/rename-draft'
import {
  getArrangeRailContextMenuPolicy,
  getArrangeRailPointerDownAction,
  getSelectionClickModifiers,
} from './arrange-rail-events'
import { SortIcon } from './SortIcon'
import { AppIcon } from '../icons/AppIcon'

type EditableEntityType = 'tab' | 'subtab' | 'space' | 'domain'
type NavigationContextMenuOptions = {
  force?: boolean
}

type SubTabRailProps = {
  viewMode: ViewMode
  activeTab: Tab
  activeSubTabId: string | null
  editing: { type: EditableEntityType; id: string } | null
  arrangeMode: ArrangeModeState
  tooltipsDisabled?: boolean
  tagFilterActive?: boolean
  getHomeLabel?: () => ReactNode
  getSubTabLabel?: (subTab: SubTab) => ReactNode
  scratchpadTagCountLabel?: string
  showNoteWorkspaceTabs?: boolean
  showHomeTab?: boolean
  isNoteWorkspaceView: boolean
  selectedTrashTab: TrashParentBucket | null
  trashSubTabs: TrashParentBucket['subTabs']
  selectedTrashSubTabId: string | null
  subTabRailRef: RefObject<HTMLDivElement | null>
  arrangeableSubTabClassName: string
  arrangeControlsDisabled?: boolean
  draggingSubTabId: string | null
  onAutoSizeRenameInput: (input: HTMLInputElement) => void
  onShouldSkipRenameBlur: (type: EditableEntityType, id: string) => boolean
  onIsPendingCreatedRename?: (type: 'tab' | 'subtab', id: string) => boolean
  onCommitRename: (type: EditableEntityType, id: string, name: string) => void
  onCancelRename: (type: EditableEntityType, id: string) => void
  onRenameDraftChange: (type: EditableEntityType, id: string, value: string) => void
  onClearRenameDraft: (type: EditableEntityType, id: string) => void
  arrangeSelectedSubTabIds: ReadonlySet<string>
  trashSelectedSubTabIds?: ReadonlySet<string>
  onHandleArrangeSubTabSelectionClick: (
    parentTabId: string,
    subTabId: string,
    modifiers: SelectionClickModifiers,
  ) => boolean
  onHandleTrashSubTabSelectionClick?: (
    event: MouseEvent<HTMLButtonElement>,
    trashParent: TrashParentBucket,
    subTabId: string,
    orderedIds: readonly string[],
  ) => boolean
  onClearArrangeSelection: () => void
  onConsumeArrangeClickSuppression: (key: string) => boolean
  onSelectParentHomeTab: () => void
  onSelectSubTab: (subTabId: string) => void
  onBeginEdit: (editing: { type: EditableEntityType; id: string }) => void
  onOpenContextMenuForHomeTab: (
    event: MouseEvent<HTMLButtonElement>,
    tabId: string,
    options?: NavigationContextMenuOptions,
  ) => void
  onOpenContextMenuForSubTab: (
    event: MouseEvent<HTMLButtonElement>,
    tabId: string,
    subTabId: string,
    options?: NavigationContextMenuOptions,
  ) => void
  onExitArrangeMode: () => void
  onStartArrangeDragSeed: (key: string, event: ReactPointerEvent<HTMLButtonElement>) => void
  onStartArrangeTapCandidate: (candidate: ArrangeTapCandidateSeed, event: ReactPointerEvent<HTMLButtonElement>) => void
  onStartArrangePress: (
    event: ReactPointerEvent<HTMLButtonElement>,
    dragItem: ArrangeDragItem | null,
    suppressClickKey: string,
  ) => void
  onFinalizeArrangeTapCandidate: (
    key: string,
    event: ReactPointerEvent<HTMLButtonElement>,
    onActivate: () => void,
  ) => void
  onHandleArrangeTabPointerMove: (
    event: ReactPointerEvent<HTMLButtonElement>,
    item: TabArrangeDragItem,
    label: string,
    variant: TabArrangeDragPreview['variant'],
  ) => void
  onHandleArrangeTabPointerUp: (
    event: ReactPointerEvent<HTMLButtonElement>,
    key: string,
    onTapWhileArranging: () => void,
  ) => void
  onClearArrangePressTimer: () => void
  onClearArrangeTapCandidate: () => void
  onCancelArrangeTabPointerDrag: () => void
  onSetTrashSubTabId: (subTabId: string | null) => void
  onOpenContextMenuForTrashTab?: (event: MouseEvent<HTMLButtonElement>, trashParent: TrashParentBucket) => void
  onOpenContextMenuForTrashSubTab: (
    event: MouseEvent<HTMLButtonElement>,
    trashParent: TrashParentBucket,
    currentSubTabId: string,
  ) => void
  onTrashSubTabPointerDown?: (
    event: ReactPointerEvent<HTMLButtonElement>,
    trashParent: TrashParentBucket,
    currentSubTabId: string,
  ) => void
  onTrashSubTabPointerMove?: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onTrashSubTabPointerUp?: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onTrashSubTabPointerCancel?: () => void
  onAddSubTab: () => void
  tabRenameEnterBehavior?: TabRenameEnterBehavior
  onOpenSubTabSortModal: () => void
  scratchpadActive?: boolean
  onOpenScratchpad?: () => void
  onOpenContextMenuForScratchpad?: (event: MouseEvent<HTMLButtonElement>) => void
}

function ScratchpadIcon() {
  return (
    <svg className="scratchpad-rail-icon" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <path
        d="M33.97008,2.16821c0.80817,-0.06703 5.23741,-0.43441 10.07313,1.13474c6.70047,2.17425 6.55251,3.15109 7.28349,2.76246c1.5157,-0.80584 12.80585,-6.80837 21.34917,-2.1544c9.49646,5.1732 8.1923,13.66788 8.58788,14.14187c0.0674,0.08076 6.28135,1.60556 10.08688,6.58967c8.54189,11.18733 2.41429,23.41788 1.51991,25.42235c-0.27726,0.62139 1.37963,2.13698 2.45396,7.54431c1.28917,6.48865 -1.03669,13.93333 -5.97766,18.45039c-5.28699,4.83339 -8.64215,4.30301 -8.48582,5.25023c1.75496,10.63352 -10.88395,16.11573 -20.70615,15.70347c-5.84073,-0.24514 -8.87395,-1.59143 -11.42758,-2.63009c-0.54561,-0.22192 -3.95617,0.79239 -8.41421,0.58454c-16.53707,-0.77102 -22.34696,-13.452 -23.03921,-14.73894c-0.2658,-0.49415 -0.40117,-0.29812 -1.21728,-0.54345c-4.96685,-1.49302 -8.29501,-5.48025 -9.29701,-8.86319c-2.32522,-7.85036 2.61125,-13.3943 5.24726,-16.69313c0.60671,-0.75927 -9.72481,-8.7189 -7.53489,-20.07781c2.54591,-13.20544 13.33056,-15.52511 13.37506,-15.57206c0.18765,-0.19799 0.68548,-14.62228 16.1231,-16.31098Zm-11.5682,41.25639c-0.01834,0.02837 -0.95466,1.58089 0.12798,0.40237c0.37375,-0.40685 0.27632,-0.50132 0.26975,-0.53428c-0.07956,-0.39916 -0.38051,0.10315 -0.39774,0.13191Zm50.98061,34.72402c0.29022,-0.09865 0.29037,-0.30151 -0.01454,-0.35647c-0.16795,-0.03027 -0.63141,0.36132 0.01454,0.35647Zm-61.49311,-6.72716c0.37216,0.54457 0.72822,1.30892 2.68599,2.81763c1.03313,0.79615 -0.95506,-1.85274 -1.31794,-10.14518c-0.17301,-3.95371 0.24359,-4.21934 -0.09147,-4.19676c-0.13454,0.00907 -1.80031,2.89516 -2.17164,4.34034c-0.42411,1.65061 -0.99798,4.0458 0.89505,7.18397Zm47.82814,-47.21316c-0.59104,0.19933 -1.934,0.47231 -0.96298,0.80553c1.02544,0.35189 6.91954,2.97606 8.41274,3.83531c0.03447,0.01984 0.93206,0.53635 0.4947,-0.04928c-0.85901,-1.15022 -3.70797,-5.8544 -4.32433,-5.703c-1.84188,0.45241 -1.81467,0.50517 -3.62013,1.11145Zm7.61182,52.22705c-2.34297,-0.43973 -2.33959,-0.3621 -4.6939,-0.62524c-1.6984,-0.18983 1.65714,0.84228 1.81146,0.88974c3.43897,1.05777 3.60241,0.86533 4.04944,0.30084c0.32538,-0.41087 -0.75069,-0.48718 -1.167,-0.56534Zm7.78911,-29.14167c-0.17465,-0.70229 -1.44251,-5.80039 -2.63092,-8.65502c-0.10833,-0.26021 -0.35468,0.05243 -0.37356,0.07639c-4.552,5.77675 -4.58161,5.7516 -6.23041,8.25305c-4.32164,6.55651 -3.77851,10.71892 -1.7245,12.70602c3.31482,3.20685 11.53126,0.95286 11.63705,0.2712c0.73926,-4.76328 -0.49847,-11.65402 -0.67766,-12.65163Zm-35.91187,43.16599c0.23002,0.0209 3.6709,0.38683 3.08394,-0.07767c-8.0996,-6.40971 -9.40563,-10.85032 -10.6485,-10.66027c-4.32779,0.66179 -4.3196,0.67536 -8.69609,0.87333c-0.76044,0.0344 2.26698,3.36244 2.94554,3.97826c5.03014,4.56509 9.40815,5.3142 13.31512,5.88635Zm-30.35274,-55.44712c-0.78504,6.04342 0.80766,8.73496 5.67891,14.90035c0.68094,0.86185 0.53948,-0.18956 0.89323,-1.23509c2.08422,-6.15999 5.25867,-10.75162 5.13502,-11.16552c-3.69546,-12.3704 -1.99155,-14.34294 -2.98855,-14.09957c-0.07981,0.01948 -3.33203,1.15765 -5.57244,4.25384c-1.91266,2.64324 -2.68097,4.87911 -3.14617,7.346Zm74.18795,-11.45771c-0.16275,-0.07358 -1.86255,-0.8421 -2.08314,-0.80336c-0.34208,0.06007 -0.54346,4.28559 -4.77456,10.37335c-0.5174,0.74444 -0.08462,0.79401 0.6815,1.27968c9.57508,6.06996 12.70258,11.33787 13.06751,11.25857c0.06126,-0.01331 0.45539,-1.18429 0.49059,-1.28885c0.88558,-2.63108 2.1598,-9.34844 -1.39381,-15.2435c-2.30115,-3.81735 -5.17501,-5.12982 -5.98809,-5.57589Zm-43.56562,50.40337c5.33492,-1.14074 8.75757,-1.43225 8.7848,-1.50508c0.0675,-0.18057 -0.77909,-0.68977 -0.82393,-0.72056c-10.05002,-6.90192 -16.08706,-14.76933 -17.24174,-16.27409c-4.16985,-5.4341 -5.01115,-8.14841 -5.41805,-7.84649c-0.57353,0.42555 -3.28235,3.03918 -3.56227,3.30926c-2.44753,2.36152 -2.62881,2.3469 -2.80282,3.80231c-0.04971,0.41578 2.68204,3.47953 6.69184,8.58248c2.55198,3.24771 8.48133,11.29613 8.51917,11.35173c0.38109,0.56002 0.56498,0.31069 5.853,-0.69956Zm31.97989,-52.25106c-1.52991,0.14451 -3.14678,0.17138 -2.84879,0.6109c0.4668,0.68853 1.71304,2.31479 4.03615,6.25575c0.35351,0.59969 0.31346,0.65517 0.46194,0.66491c0.54378,0.03567 3.95411,-7.34757 3.04463,-7.49143c-1.24398,-0.19678 -4.31879,-0.05715 -4.69393,-0.04012Zm7.82949,55.26927c1.45848,-0.49991 11.48138,-3.93534 11.98841,-15.08962c0.13638,-3.00036 -1.18146,-6.7466 -1.27556,-6.83003c-0.337,-0.2988 -2.92712,4.47953 -9.60866,7.89659c-1.06774,0.54606 -0.78951,0.7865 -0.93955,1.41574c-0.19541,0.81948 -1.42702,5.98451 -3.79541,9.82294c-0.62527,1.01337 0.47479,0.66868 2.53592,2.59064c0.55404,0.51663 0.63714,0.29956 1.09486,0.19375Zm-36.8933,-52.75313c-0.77915,-0.19778 -0.77349,-0.1994 -0.84148,-0.2136c-4.11407,-0.85927 -4.24865,-1.00778 -4.73981,-0.47984c-4.89999,5.26688 -8.32771,10.01369 -10.73506,13.66321c-0.78177,1.18515 -0.40544,1.29142 0.10735,2.62354c0.23739,0.61669 0.86446,-0.25533 2.74595,-1.84059c10.94002,-9.21762 17.48057,-12.26841 17.65753,-12.50261c0.21108,-0.27936 -0.11598,-0.26764 -4.19449,-1.25009Zm13.42115,-15.18309c-0.00586,0.24781 0.09817,0.20305 1.47356,1.2825c6.49072,5.09411 7.45039,7.72923 8.24592,7.64969c3.64824,-0.3648 3.60827,-0.98956 10.74418,-0.68213c0.35728,0.01539 0.31944,-0.11085 0.28619,-0.45908c-0.65841,-6.89564 -8.0175,-13.40802 -20.74985,-7.79097Zm-32.93873,18.66871c0.78239,4.67977 0.86067,5.06044 1.1307,4.77546c0.58931,-0.62193 0.19779,-0.91277 6.46743,-8.53654c0.84652,-1.02935 1.5205,-1.64216 1.14241,-1.68169c-2.07354,-0.21675 -9.09741,-0.41229 -9.17155,0.22156c-0.11593,0.99111 0.37726,4.80555 0.43101,5.22121Zm0.00202,-10.72555c-0.0851,0.48721 -0.27235,0.73408 0.21447,0.70729c11.47461,-0.63143 11.76537,1.20189 12.8795,0.17362c1.88791,-1.74241 4.34865,-4.55392 9.81451,-8.38942c0.38165,-0.26781 0.71736,-0.37733 0.29116,-0.59004c-0.52106,-0.26006 -4.75651,-1.90304 -8.79597,-2.07284c-12.1485,-0.51065 -14.04192,8.8156 -14.40367,10.17139Zm55.82466,26.3182c1.13595,4.53827 1.93933,7.97785 1.67687,14.17854c-0.0245,0.57887 0.57852,0.00481 0.89583,-0.22567c2.50956,-1.82275 4.09834,-3.44321 6.14735,-6.53661c0.26603,-0.40162 0.04741,-0.68857 -1.02288,-2.10617c-0.54986,-0.72828 -3.21517,-4.25846 -8.20588,-7.92332c-0.20173,-0.14814 -0.35278,-0.12961 -0.28063,0.11892c0.3664,1.26211 0.42701,1.23323 0.78933,2.4943Zm-53.82309,33.13533c0.33138,-0.0297 4.04053,-0.3621 4.12854,-0.50129c0.19204,-0.30371 -6.38991,-8.66473 -6.96897,-9.4003c-4.0607,-5.15828 -4.37637,-5.72731 -4.40581,-5.18385c-0.3964,7.31948 2.12613,13.61503 2.57091,14.72506c0.19322,0.48223 2.78149,0.4158 4.67533,0.36037Zm30.75767,15.72726c15.30933,2.67835 22.11936,-5.76046 20.91424,-9.8843c-0.20698,-0.70826 -0.91474,0.1707 -6.33963,-0.23661c-0.72891,-0.05473 -2.611,3.15249 -8.64428,6.90546c-3.75366,2.33495 -5.9177,2.99427 -5.93116,3.00622c-0.05213,0.04633 0.05296,0.16289 0.00083,0.20922Zm8.23369,-20.16301c3.65117,0.4136 3.63297,0.43111 7.0405,1.13691c0.33458,0.0693 0.73468,-0.44655 2.2626,-3.77865c1.75362,-3.82433 1.51496,-4.19599 1.18166,-4.11657c-12.42074,2.95959 -20.00851,-5.28776 -14.52894,-16.88304c3.1517,-6.66928 9.77646,-13.04128 9.22771,-13.41477c-1.75549,-1.19481 -15.84833,-7.86629 -16.72772,-7.44759c-3.80919,1.81368 -12.55348,7.48719 -17.22718,11.26933c-5.53892,4.48229 -6.75112,5.48544 -6.67387,5.77009c0.08008,0.29507 2.19938,4.02239 4.22649,6.8401c7.37019,10.24464 16.6109,16.5003 22.55829,20.26831c0.70949,0.4495 1.34575,-0.20852 8.66046,0.35587Zm-14.33177,4.43891c-0.9995,0.13414 -4.56832,0.61311 -12.40916,2.21761c-0.48166,0.09856 0.4331,0.93906 0.64614,1.19191c0.03067,0.03641 5.04288,6.44326 10.81788,9.57227c0.3675,0.19912 0.77165,0.4181 5.07278,-1.25111c5.64497,-2.19074 11.29851,-6.90156 11.01917,-7.25211c-0.09379,-0.11769 -3.62865,-0.66035 -10.14417,-4.48433c-0.67539,-0.39639 -0.71598,-0.59364 -5.00264,0.00576Zm3.03655,-54.10107c3.71564,-1.64138 3.69084,-1.69006 7.56014,-2.94038c0.41859,-0.13526 0.30429,-0.547 -3.75753,-4.01465c-2.03245,-1.73514 -4.82521,-3.67418 -5.17546,-3.79517c-0.4608,-0.15918 -4.67043,2.79274 -8.55028,6.2026c-0.71617,0.62942 -1.79758,1.42479 -1.38651,1.54681c1.49762,0.44455 1.53587,0.26159 5.65219,1.38994c3.40444,0.93321 5.05354,1.72053 5.65747,1.61086Z"
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
      />
    </svg>
  )
}

export function SubTabRail({
  viewMode,
  activeTab,
  activeSubTabId,
  editing,
  arrangeMode,
  tooltipsDisabled = false,
  tagFilterActive = false,
  getHomeLabel = () => 'home',
  getSubTabLabel = (subTab) => subTab.title,
  scratchpadTagCountLabel = '',
  showNoteWorkspaceTabs = true,
  showHomeTab = true,
  isNoteWorkspaceView,
  selectedTrashTab,
  trashSubTabs,
  selectedTrashSubTabId,
  subTabRailRef,
  arrangeableSubTabClassName,
  arrangeControlsDisabled = false,
  draggingSubTabId,
  onAutoSizeRenameInput,
  onShouldSkipRenameBlur,
  onIsPendingCreatedRename = () => false,
  onCommitRename,
  onCancelRename,
  onRenameDraftChange,
  onClearRenameDraft,
  arrangeSelectedSubTabIds,
  trashSelectedSubTabIds,
  onHandleArrangeSubTabSelectionClick,
  onHandleTrashSubTabSelectionClick,
  onClearArrangeSelection,
  onConsumeArrangeClickSuppression,
  onSelectParentHomeTab,
  onSelectSubTab,
  onBeginEdit,
  onOpenContextMenuForHomeTab,
  onOpenContextMenuForSubTab,
  onExitArrangeMode,
  onStartArrangeDragSeed,
  onStartArrangeTapCandidate,
  onStartArrangePress,
  onFinalizeArrangeTapCandidate,
  onHandleArrangeTabPointerMove,
  onHandleArrangeTabPointerUp,
  onClearArrangePressTimer,
  onClearArrangeTapCandidate,
  onCancelArrangeTabPointerDrag,
  onSetTrashSubTabId,
  onOpenContextMenuForTrashTab = () => undefined,
  onOpenContextMenuForTrashSubTab,
  onTrashSubTabPointerDown = () => undefined,
  onTrashSubTabPointerMove = () => undefined,
  onTrashSubTabPointerUp = () => undefined,
  onTrashSubTabPointerCancel = () => undefined,
  onAddSubTab,
  tabRenameEnterBehavior = 'goes-to-note',
  onOpenSubTabSortModal,
  scratchpadActive = false,
  onOpenScratchpad = () => undefined,
  onOpenContextMenuForScratchpad = () => undefined,
}: SubTabRailProps) {
  if (!isNoteWorkspaceView && !(viewMode === 'trash' && selectedTrashTab)) return null
  const showTrashParentHomeTab = viewMode === 'trash' && selectedTrashTab && selectedTrashTab.source !== 'subtabs-only'
  const subTabPlacementPosition =
    arrangeMode.active &&
    arrangeMode.dragItem?.type === 'subtab' &&
    arrangeMode.dragItem.parentTabId === activeTab.id
      ? arrangeMode.overSubTabInsert
      : null
  const subTabPlacementNeighborId = getPlacementNeighborId(
    activeTab.subTabs.map((subTab) => subTab.id),
    subTabPlacementPosition ? arrangeMode.overSubTabId : null,
    subTabPlacementPosition,
    arrangeMode.dragItem?.type === 'subtab' ? arrangeMode.dragItem.subTabId : draggingSubTabId,
  )

  return (
    <header
      className={`subtabbar ${arrangeMode.active && viewMode === 'main' ? 'is-arranging' : ''}`}
      role="tablist"
      aria-label="Nested note tabs"
    >
      <div ref={subTabRailRef} className="tabbar-scroll">
        {isNoteWorkspaceView && showNoteWorkspaceTabs && showHomeTab && (
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'main' && !scratchpadActive && !activeSubTabId}
            className={`btn btn-sm ${viewMode === 'main' && !scratchpadActive && !activeSubTabId ? 'btn-info' : 'btn-outline-info'} tab-btn subtab-btn home-subtab-btn ${arrangeableSubTabClassName} ${arrangeMode.active ? 'is-arrange-fixed' : ''} ${
              arrangeMode.active &&
              arrangeMode.dragItem?.type === 'subtab' &&
              arrangeMode.dragItem.parentTabId === activeTab.id &&
              activeTab.subTabs[0] &&
              arrangeMode.overSubTabId === activeTab.subTabs[0].id &&
              arrangeMode.overSubTabInsert === 'before'
                ? 'is-arrange-home-target'
                : ''
            }`}
            onClick={() => {
              if (onConsumeArrangeClickSuppression(`home:${activeTab.id}`)) return
              onClearArrangeSelection()
              onSelectParentHomeTab()
            }}
            onContextMenu={(event) => {
              if (tagFilterActive) {
                event.preventDefault()
                return
              }
              const contextPolicy = getArrangeRailContextMenuPolicy({
                disabled: viewMode !== 'main',
                arrangeActive: arrangeMode.active,
              })
              if (contextPolicy.action === 'ignore') return
              if (contextPolicy.cancelArrange) onExitArrangeMode()
              onOpenContextMenuForHomeTab(event, activeTab.id, contextPolicy.forceMenu ? { force: true } : undefined)
            }}
            onPointerDown={(event) => {
              const pointerAction = getArrangeRailPointerDownAction({
                button: event.button,
                shiftKey: event.shiftKey,
                ctrlKey: event.ctrlKey,
                metaKey: event.metaKey,
                disabled: viewMode !== 'main' || tagFilterActive,
              })
              if (pointerAction === 'ignore') return
              if (pointerAction === 'clear-press-timer') {
                onClearArrangePressTimer()
                return
              }
              if (arrangeMode.active) {
                onStartArrangeTapCandidate({ key: `home:${activeTab.id}`, type: 'home' }, event)
                return
              }
              onStartArrangePress(event, null, `home:${activeTab.id}`)
            }}
            onPointerUp={(event) => {
              if (viewMode !== 'main') return
              if (tagFilterActive) return
              if (arrangeMode.active) {
                onFinalizeArrangeTapCandidate(`home:${activeTab.id}`, event, () => {
                  onClearArrangeSelection()
                  onSelectParentHomeTab()
                })
                return
              }
              onClearArrangePressTimer()
            }}
            onPointerLeave={() => {
              if (viewMode !== 'main') return
              if (tagFilterActive) return
              if (!arrangeMode.active) {
                onClearArrangePressTimer()
              }
            }}
            onPointerCancel={() => {
              if (viewMode !== 'main') return
              if (tagFilterActive) return
              onClearArrangePressTimer()
              onClearArrangeTapCandidate()
            }}
          >
            {getHomeLabel()}
          </button>
        )}

        {isNoteWorkspaceView &&
          showNoteWorkspaceTabs &&
          activeTab.subTabs.map((subTab) =>
            editing?.type === 'subtab' && editing.id === subTab.id ? (
              <input
                key={subTab.id}
                className="tab-rename-input"
                defaultValue={subTab.title}
                autoFocus
                onFocus={(event) => {
                  onRenameDraftChange('subtab', subTab.id, event.currentTarget.value)
                  onAutoSizeRenameInput(event.currentTarget)
                  event.currentTarget.select()
                }}
                onInput={(event) => {
                  onRenameDraftChange('subtab', subTab.id, event.currentTarget.value)
                  onAutoSizeRenameInput(event.currentTarget)
                }}
                onBlur={(event) => {
                  if (onShouldSkipRenameBlur('subtab', subTab.id)) {
                    onClearRenameDraft('subtab', subTab.id)
                    return
                  }
                  onCommitRename('subtab', subTab.id, event.target.value)
                }}
                onKeyDown={(event) => {
                  const action = getRenameInputKeyAction(event)
                  if (action === 'commit') {
                    event.preventDefault()
                    if (
                      shouldCreateAnotherTabAfterRenameEnter({
                        type: 'subtab',
                        isPendingCreated: onIsPendingCreatedRename('subtab', subTab.id),
                        tabRenameEnterBehavior,
                        tagFilterActive,
                      })
                    ) {
                      onRenameDraftChange('subtab', subTab.id, event.currentTarget.value)
                      onAddSubTab()
                      return
                    }
                    onCommitRename('subtab', subTab.id, event.currentTarget.value)
                  }
                  if (action === 'commit-and-create') {
                    event.preventDefault()
                    if (!tagFilterActive) onAddSubTab()
                  }
                  if (action === 'cancel') {
                    event.preventDefault()
                    onCancelRename('subtab', subTab.id)
                  }
                }}
              />
            ) : (
              (() => {
                const isArrangeBeforeNeighbor =
                  subTabPlacementNeighborId === subTab.id && subTabPlacementPosition === 'after'
                const isArrangeAfterNeighbor =
                  subTabPlacementNeighborId === subTab.id && subTabPlacementPosition === 'before'
                return (
                  <button
                    key={subTab.id}
                    data-arrange-subtab-id={subTab.id}
                    type="button"
                    role="tab"
                    aria-selected={viewMode === 'main' && !scratchpadActive && subTab.id === activeSubTabId}
                    draggable={false}
                    className={`btn btn-sm ${viewMode === 'main' && !scratchpadActive && subTab.id === activeSubTabId ? 'btn-info' : 'btn-outline-info'} tab-btn subtab-btn ${arrangeableSubTabClassName} ${arrangeSelectedSubTabIds.has(subTab.id) ? 'is-arrange-selected' : ''} ${
                      arrangeMode.active &&
                      arrangeMode.dragItem?.type === 'subtab' &&
                      arrangeMode.dragItem.parentTabId === activeTab.id &&
                      arrangeMode.overSubTabId === subTab.id &&
                      arrangeMode.overSubTabInsert === 'before'
                        ? 'is-arrange-target-before'
                        : ''
                    } ${
                      arrangeMode.active &&
                      arrangeMode.dragItem?.type === 'subtab' &&
                      arrangeMode.dragItem.parentTabId === activeTab.id &&
                      arrangeMode.overSubTabId === subTab.id &&
                      arrangeMode.overSubTabInsert === 'after'
                        ? 'is-arrange-target-after'
                        : ''
                    } ${isArrangeBeforeNeighbor ? 'is-arrange-neighbor-before' : ''} ${
                      isArrangeAfterNeighbor ? 'is-arrange-neighbor-after' : ''
                    } ${draggingSubTabId === subTab.id ? 'is-dragging' : ''}`}
                    onClick={(event) => {
                      const modifiers = getSelectionClickModifiers(event)
                      if (onConsumeArrangeClickSuppression(`subtab:${subTab.id}`)) return
                      if (onHandleArrangeSubTabSelectionClick(activeTab.id, subTab.id, modifiers)) {
                        event.preventDefault()
                        return
                      }
                      onClearArrangeSelection()
                      onSelectSubTab(subTab.id)
                    }}
                    onDoubleClick={() => {
                      if (viewMode !== 'main' || arrangeMode.active || tagFilterActive) return
                      onBeginEdit({ type: 'subtab', id: subTab.id })
                    }}
                    onContextMenu={(event) => {
                      const contextPolicy = getArrangeRailContextMenuPolicy({
                        disabled: viewMode !== 'main',
                        arrangeActive: arrangeMode.active,
                      })
                      if (contextPolicy.action === 'ignore') return
                      if (contextPolicy.cancelArrange) onExitArrangeMode()
                      onOpenContextMenuForSubTab(
                        event,
                        activeTab.id,
                        subTab.id,
                        contextPolicy.forceMenu ? { force: true } : undefined,
                      )
                    }}
                    onPointerDown={(event) => {
                      const pointerAction = getArrangeRailPointerDownAction({
                        button: event.button,
                        shiftKey: event.shiftKey,
                        ctrlKey: event.ctrlKey,
                        metaKey: event.metaKey,
                        disabled: viewMode !== 'main' || tagFilterActive,
                      })
                      if (pointerAction === 'ignore') return
                      if (pointerAction === 'clear-press-timer') {
                        onClearArrangePressTimer()
                        return
                      }
                      event.currentTarget.setPointerCapture(event.pointerId)
                      onStartArrangeDragSeed(`subtab:${subTab.id}`, event)
                      if (arrangeMode.active) {
                        onStartArrangeTapCandidate({ key: `subtab:${subTab.id}`, type: 'subtab', subTabId: subTab.id }, event)
                        return
                      }
                      onStartArrangePress(
                        event,
                        { type: 'subtab', parentTabId: activeTab.id, subTabId: subTab.id },
                        `subtab:${subTab.id}`,
                      )
                    }}
                    onPointerMove={(event) => {
                      if (tagFilterActive) return
                      onHandleArrangeTabPointerMove(
                        event,
                        { type: 'subtab', parentTabId: activeTab.id, subTabId: subTab.id },
                        subTab.title,
                        'subtab',
                      )
                    }}
                    onPointerUp={(event) => {
                      if (viewMode !== 'main') return
                      if (tagFilterActive) return
                      onHandleArrangeTabPointerUp(event, `subtab:${subTab.id}`, () => {
                        onClearArrangeSelection()
                        onSelectSubTab(subTab.id)
                      })
                    }}
                    onPointerLeave={() => {
                      if (viewMode !== 'main') return
                      if (tagFilterActive) return
                      if (!arrangeMode.active) {
                        onClearArrangePressTimer()
                      }
                    }}
                    onPointerCancel={() => {
                      if (viewMode !== 'main') return
                      if (tagFilterActive) return
                      onCancelArrangeTabPointerDrag()
                    }}
                  >
                    {getSubTabLabel(subTab)}
                  </button>
                )
              })()
            ),
          )}

        {viewMode === 'trash' && selectedTrashTab && (
          <>
            {showTrashParentHomeTab && (
              <button
                type="button"
                role="tab"
                aria-selected={selectedTrashSubTabId === null}
                className={`btn btn-sm tab-btn trash-subtab-btn trash-parent-home-subtab-btn ${
                  selectedTrashSubTabId === null ? 'is-selected' : ''
                }`}
                onClick={() => onSetTrashSubTabId(null)}
                onContextMenu={(event) => onOpenContextMenuForTrashTab(event, selectedTrashTab)}
              >
                home
              </button>
            )}
            {trashSubTabs.map((subTab) => (
              <button
                key={subTab.id}
                type="button"
                role="tab"
                data-trash-subtab-id={subTab.id}
                aria-selected={subTab.id === selectedTrashSubTabId}
                className={`btn btn-sm tab-btn trash-subtab-btn is-trash-selectable ${
                  subTab.id === selectedTrashSubTabId ? 'is-selected' : ''
                } ${trashSelectedSubTabIds?.has(subTab.id) ? 'is-trash-selected' : ''}`}
                onClick={(event) => {
                  if (
                    onHandleTrashSubTabSelectionClick?.(
                      event,
                      selectedTrashTab,
                      subTab.id,
                      trashSubTabs.map((candidate) => candidate.id),
                    )
                  ) {
                    return
                  }
                  onSetTrashSubTabId(subTab.id)
                }}
                onContextMenu={(event) => {
                  onOpenContextMenuForTrashSubTab(event, selectedTrashTab, subTab.id)
                }}
                onPointerDown={(event) => onTrashSubTabPointerDown(event, selectedTrashTab, subTab.id)}
                onPointerMove={onTrashSubTabPointerMove}
                onPointerUp={onTrashSubTabPointerUp}
                onPointerCancel={onTrashSubTabPointerCancel}
              >
                {subTab.title}
              </button>
            ))}
          </>
        )}

        {showNoteWorkspaceTabs && !tagFilterActive && viewMode === 'main' && arrangeMode.active ? (
          <button
            type="button"
            className="tab-sort-btn"
            onClick={() => {
              if (arrangeControlsDisabled) return
              onOpenSubTabSortModal()
            }}
            aria-label="sort sub-tabs"
            data-app-tooltip={tooltipsDisabled ? undefined : 'sort sub-tabs'}
            aria-disabled={arrangeControlsDisabled}
            disabled={arrangeControlsDisabled}
          >
            <SortIcon />
          </button>
        ) : showNoteWorkspaceTabs && !tagFilterActive && viewMode === 'main' && !arrangeMode.active ? (
          <button
            type="button"
            className="btn btn-sm btn-outline-light add-tab-btn"
            onClick={onAddSubTab}
            aria-label="Add note tab"
            data-app-tooltip={tooltipsDisabled ? undefined : 'Add note tab'}
          >
            <AppIcon iconId="plus" className="add-tab-icon" />
          </button>
        ) : null}

        {isNoteWorkspaceView && (
          <button
            type="button"
            role="tab"
            aria-selected={scratchpadActive}
            className={`btn btn-sm ${scratchpadActive ? 'btn-info' : 'btn-outline-info'} tab-btn subtab-btn scratchpad-rail-btn ${
              scratchpadActive ? 'is-selected' : ''
            } ${scratchpadTagCountLabel ? 'has-tag-count' : ''}`}
            aria-label="scratchpad"
            data-app-tooltip={tooltipsDisabled ? undefined : 'scratchpad'}
            onClick={onOpenScratchpad}
            onContextMenu={(event) => {
              if (viewMode !== 'main') return
              onOpenContextMenuForScratchpad(event)
            }}
          >
            <ScratchpadIcon />
            {scratchpadTagCountLabel ? (
              <span className="scratchpad-rail-tag-count" aria-hidden="true">
                ({scratchpadTagCountLabel})
              </span>
            ) : null}
          </button>
        )}
      </div>
    </header>
  )
}
