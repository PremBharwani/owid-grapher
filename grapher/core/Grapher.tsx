import * as React from "react"
import * as ReactDOMServer from "react-dom/server"
import {
    observable,
    computed,
    action,
    autorun,
    runInAction,
    reaction,
    IReactionDisposer,
    observe,
} from "mobx"
import { bind } from "decko"
import {
    uniqWith,
    isEqual,
    uniq,
    fetchJSON,
    getErrorMessageRelatedQuestionUrl,
    slugify,
    identity,
    lowerCaseFirstLetterUnlessAbbreviation,
    isMobile,
    isVisible,
    VNode,
    throttle,
    isTouchDevice,
    next,
    sampleFrom,
    range,
} from "grapher/utils/Util"
import {
    ChartTypeName,
    GrapherTabOption,
    ScaleType,
    StackMode,
    DimensionProperty,
    EntitySelectionMode,
    HighlightToggleConfig,
    ScatterPointLabelStrategy,
    RelatedQuestionsConfig,
    Time,
    BASE_FONT_SIZE,
    CookieKey,
    FacetStrategy,
} from "grapher/core/GrapherConstants"
import {
    LegacyChartDimensionInterface,
    LegacyVariablesAndEntityKey,
} from "coreTable/LegacyVariableCode"
import * as Cookies from "js-cookie"
import { OwidColumnSpec, OwidTable } from "coreTable/OwidTable"
import {
    ChartDimension,
    LegacyDimensionsManager,
} from "grapher/chart/ChartDimension"
import { Bounds, DEFAULT_BOUNDS } from "grapher/utils/Bounds"
import { TooltipProps, TooltipManager } from "grapher/tooltip/TooltipProps"
import { BAKED_GRAPHER_URL, ENV, ADMIN_BASE_URL } from "settings"
import {
    minTimeFromJSON,
    maxTimeFromJSON,
    TimeBounds,
    TimeBoundValue,
    getTimeDomainFromQueryString,
    TimeBound,
    minTimeToJSON,
    maxTimeToJSON,
    formatTimeURIComponent,
} from "grapher/utils/TimeBounds"
import {
    GlobalEntitySelection,
    subscribeGrapherToGlobalEntitySelection,
} from "site/globalEntityControl/GlobalEntitySelection"
import {
    strToQueryParams,
    queryParamsToStr,
    QueryParams,
} from "utils/client/url"
import { populationMap } from "coreTable/PopulationMap"
import {
    GrapherInterface,
    grapherKeysToSerialize,
    GrapherQueryParams,
    LegacyGrapherInterface,
    legacyQueryParamsToCurrentQueryParams,
} from "grapher/core/GrapherInterface"
import { DimensionSlot } from "grapher/chart/DimensionSlot"
import { canBeExplorable } from "explorer/indicatorExplorer/IndicatorUtils"
import { Analytics } from "./Analytics"
import { EntityUrlBuilder } from "./EntityUrlBuilder"
import { MapProjection } from "grapher/mapCharts/MapProjections"
import { LogoOption } from "grapher/chart/Logos"
import { AxisConfig, FontSizeManager } from "grapher/axis/AxisConfig"
import { ColorScaleConfig } from "grapher/color/ColorScaleConfig"
import { MapConfig } from "grapher/mapCharts/MapConfig"
import { ComparisonLineConfig } from "grapher/scatterCharts/ComparisonLine"
import {
    objectWithPersistablesToObject,
    deleteRuntimeAndUnchangedProps,
    updatePersistables,
} from "grapher/persistable/Persistable"
import { EntityId, EntityName } from "coreTable/CoreTableConstants"
import { isOnTheMap } from "grapher/mapCharts/EntitiesOnTheMap"
import { ChartManager } from "grapher/chart/ChartManager"
import { FooterManager } from "grapher/footer/FooterManager"
import { HeaderManager } from "grapher/header/HeaderManager"
import { UrlBinder, ObservableUrl } from "grapher/utils/UrlBinder"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faExclamationTriangle } from "@fortawesome/free-solid-svg-icons/faExclamationTriangle"
import {
    AbsRelToggleManager,
    FooterControls,
    HighlightToggleManager,
    SmallCountriesFilterManager,
} from "grapher/controls/Controls"
import { TooltipView } from "grapher/tooltip/Tooltip"
import { EntitySelectorModal } from "grapher/controls/EntitySelectorModal"
import {
    DownloadTab,
    DownloadTabManager,
} from "grapher/downloadTab/DownloadTab"
import * as ReactDOM from "react-dom"
import { observer } from "mobx-react"
import "d3-transition"
import { ChartTab, ChartTabManager } from "grapher/chart/ChartTab"
import { SourcesTab, SourcesTabManager } from "grapher/sourcesTab/SourcesTab"
import { DataTable } from "grapher/dataTable/DataTable"
import { MapChartManager } from "grapher/mapCharts/MapChartConstants"
import { DiscreteBarChartManager } from "grapher/barCharts/DiscreteBarChartConstants"
import { Command, CommandPalette } from "grapher/controls/CommandPalette"
import { ShareMenuManager } from "grapher/controls/ShareMenu"
import { TimelineComponentManager } from "grapher/timeline/TimelineComponent"

declare const window: any

const legacyConfigToConfig = (
    config: LegacyGrapherInterface | GrapherInterface
): GrapherInterface => {
    const legacyConfig = config as LegacyGrapherInterface
    if (!legacyConfig.selectedData) return legacyConfig

    const newConfig = { ...legacyConfig } as GrapherInterface
    newConfig.selectedEntityIds = legacyConfig.selectedData.map(
        (row) => row.entityId
    )
    return newConfig
}

// Exactly the same as GrapherInterface, but contains options that developers want but authors won't be touching.
export interface GrapherProgrammaticInterface extends GrapherInterface {
    externalDataUrl?: string // This is temporarily used for testing legacy prod charts locally. Will be removed
    owidDataset?: LegacyVariablesAndEntityKey // This is temporarily used for testing. Will be removed
    manuallyProvideData?: boolean // This will be removed.
    hideEntityControls?: boolean
    dropUnchangedUrlParams?: boolean
    queryStr?: string
    isEmbed?: boolean
    enableKeyboardShortcuts?: boolean
    isMediaCard?: boolean
    globalEntitySelection?: GlobalEntitySelection
    isExport?: boolean
    bounds?: Bounds
    table?: OwidTable
    bakedGrapherURL?: string
}

@observer
export class Grapher
    extends React.Component<GrapherProgrammaticInterface>
    implements
        TimelineComponentManager,
        ChartManager,
        FooterManager,
        HeaderManager,
        FontSizeManager,
        ChartTabManager,
        SourcesTabManager,
        DownloadTabManager,
        DiscreteBarChartManager,
        LegacyDimensionsManager,
        ObservableUrl,
        ShareMenuManager,
        SmallCountriesFilterManager,
        HighlightToggleManager,
        AbsRelToggleManager,
        TooltipManager,
        MapChartManager {
    @observable.ref type: ChartTypeName = ChartTypeName.LineChart
    @observable.ref isExplorable: boolean = false
    @observable.ref id?: number = undefined
    @observable.ref version: number = 1
    @observable.ref slug?: string = undefined
    @observable.ref title?: string = undefined
    @observable.ref subtitle: string = ""
    @observable.ref sourceDesc?: string = undefined
    @observable.ref note: string = ""
    @observable.ref hideTitleAnnotation?: true = undefined
    @observable.ref minTime?: TimeBound = undefined
    @observable.ref maxTime?: TimeBound = undefined
    @observable.ref timelineMinTime?: Time = undefined
    @observable.ref timelineMaxTime?: Time = undefined
    @observable.ref addCountryMode = EntitySelectionMode.MultipleEntities
    @observable.ref highlightToggle?: HighlightToggleConfig = undefined
    @observable.ref stackMode = StackMode.absolute
    @observable.ref hideLegend?: true = undefined
    @observable.ref logo?: LogoOption = undefined
    @observable.ref hideLogo?: boolean = undefined
    @observable.ref hideRelativeToggle?: boolean = true
    @observable.ref entityType: string = "country"
    @observable.ref entityTypePlural: string = "countries"
    @observable.ref hideTimeline?: true = undefined
    @observable.ref zoomToSelection?: true = undefined
    @observable.ref minPopulationFilter?: number = undefined
    @observable.ref showYearLabels?: boolean = undefined // Always show year in labels for bar charts
    @observable.ref hasChartTab: boolean = true
    @observable.ref hasMapTab: boolean = false
    @observable.ref tab = GrapherTabOption.chart
    @observable.ref overlay?: GrapherTabOption = undefined
    @observable.ref internalNotes: string = ""
    @observable.ref variantName?: string = undefined
    @observable.ref originUrl: string = ""
    @observable.ref isPublished?: true = undefined
    @observable.ref baseColorScheme?: string = undefined
    @observable.ref invertColorScheme?: true = undefined
    @observable.ref hideLinesOutsideTolerance?: true = undefined
    @observable hideConnectedScatterLines?: boolean = undefined // Hides lines between points when timeline spans multiple years. Requested by core-econ for certain charts
    @observable
    scatterPointLabelStrategy?: ScatterPointLabelStrategy = undefined
    @observable.ref compareEndPointsOnly?: true = undefined
    @observable.ref matchingEntitiesOnly?: true = undefined

    @observable.ref xAxis = new AxisConfig()
    @observable.ref yAxis = new AxisConfig()
    @observable colorScale = new ColorScaleConfig()
    @observable map = new MapConfig()
    @observable.ref dimensions: ChartDimension[] = []

    @observable selectedEntityNames: EntityName[] = []
    @observable selectedEntityIds: EntityId[] = []
    @observable excludedEntities?: number[] = undefined
    @observable comparisonLines: ComparisonLineConfig[] = [] // todo: Persistables?
    @observable relatedQuestions: RelatedQuestionsConfig[] = [] // todo: Persistables?

    externalDataUrl?: string = undefined // This is temporarily used for testing legacy prod charts locally. Will be removed
    owidDataset?: LegacyVariablesAndEntityKey = undefined // This is temporarily used for testing. Will be removed
    manuallyProvideData?: boolean = false // This will be removed.

    // TODO: Pass these 5 in as options, don't get them as globals.
    isDev = ENV === "development"
    adminBaseUrl = ADMIN_BASE_URL
    analytics = new Analytics(ENV)
    isEditor =
        typeof window !== "undefined" && (window as any).isEditor === true
    @observable bakedGrapherURL = BAKED_GRAPHER_URL

    @observable.ref rootTable: OwidTable

    private legacyConfigAsAuthored: Partial<LegacyGrapherInterface>

    constructor(props: GrapherProgrammaticInterface = {}) {
        super(props!)
        if (typeof window !== "undefined") window.grapher = this

        this.rootTable = props.table ?? new OwidTable()
        const modernConfig = props ? legacyConfigToConfig(props) : props

        this.legacyConfigAsAuthored = props || {}

        this.updateFromObject(modernConfig)

        if (!props.table) this.downloadData()

        this.populateFromQueryParams(
            legacyQueryParamsToCurrentQueryParams(
                strToQueryParams(props.queryStr ?? "")
            )
        )

        if (props.globalEntitySelection) {
            this.disposers.push(
                subscribeGrapherToGlobalEntitySelection(
                    this,
                    props.globalEntitySelection
                )
            )
        }

        if (this.isEditor) this.ensureValidConfigWhenEditing()
    }

    toObject() {
        const obj: GrapherInterface = objectWithPersistablesToObject(
            this,
            grapherKeysToSerialize
        )

        if (this.table.hasSelection)
            obj.selectedEntityNames = this.table.selectedEntityNames

        deleteRuntimeAndUnchangedProps(obj, defaultObject)

        // JSON doesn't support Infinity, so we use strings instead.
        if (obj.minTime) obj.minTime = minTimeToJSON(this.minTime) as any
        if (obj.maxTime) obj.maxTime = maxTimeToJSON(this.maxTime) as any

        // todo: remove dimensions concept
        if (this.legacyConfigAsAuthored?.dimensions)
            obj.dimensions = this.legacyConfigAsAuthored.dimensions

        return obj
    }

    @action.bound downloadData() {
        if (this.owidDataset) this._receiveLegacyData(this.owidDataset)
        else if (this.externalDataUrl)
            this.downloadLegacyDataFromUrl(this.externalDataUrl)
        else if (!this.manuallyProvideData)
            this.downloadLegacyDataFromOwidVariableIds()
    }

    @action.bound updateFromObject(obj?: GrapherProgrammaticInterface) {
        if (!obj) return

        updatePersistables(this, obj)

        // Regression fix: some legacies have this set to Null. Todo: clean DB.
        if (obj.originUrl === null) this.originUrl = ""

        // JSON doesn't support Infinity, so we use strings instead.
        if (obj.minTime) this.minTime = minTimeFromJSON(obj.minTime)
        if (obj.maxTime) this.maxTime = maxTimeFromJSON(obj.maxTime)

        // Todo: remove once we are more RAII.
        if (obj?.dimensions?.length)
            this.setDimensionsFromConfigs(obj.dimensions)
    }

    /**
     * Applies query parameters to the grapher config
     */
    @action.bound populateFromQueryParams(params: GrapherQueryParams) {
        // Set tab if specified
        const tab = params.tab
        if (tab) {
            if (!this.availableTabs.includes(tab as GrapherTabOption))
                console.error("Unexpected tab: " + tab)
            else this.tab = tab as GrapherTabOption
        }

        const overlay = params.overlay
        if (overlay) {
            if (!this.availableTabs.includes(overlay as GrapherTabOption))
                console.error("Unexpected overlay: " + overlay)
            else this.overlay = overlay as GrapherTabOption
        }

        // Stack mode for bar and stacked area charts
        this.stackMode = (params.stackMode ?? this.stackMode) as StackMode

        this.zoomToSelection =
            params.zoomToSelection === "true" ? true : this.zoomToSelection

        this.minPopulationFilter = params.minPopulationFilter
            ? parseInt(params.minPopulationFilter)
            : this.minPopulationFilter

        // Axis scale mode
        const xScaleType = params.xScale
        if (xScaleType) {
            if (xScaleType === ScaleType.linear || xScaleType === ScaleType.log)
                this.xAxis.scaleType = xScaleType
            else console.error("Unexpected xScale: " + xScaleType)
        }

        const yScaleType = params.yScale
        if (yScaleType) {
            if (yScaleType === ScaleType.linear || yScaleType === ScaleType.log)
                this.yAxis.scaleType = yScaleType
            else console.error("Unexpected xScale: " + yScaleType)
        }

        const time = params.time
        if (time !== undefined && time !== "")
            this.setTimeFromTimeQueryParam(time)

        const endpointsOnly = params.endpointsOnly
        if (endpointsOnly !== undefined)
            this.compareEndPointsOnly = endpointsOnly === "1" ? true : undefined

        const region = params.region
        if (region !== undefined) this.map.projection = region as MapProjection

        if (params.country) {
            // Selected countries -- we can't actually look these up until we have the data
            this.selectedEntitiesInQueryParam = EntityUrlBuilder.queryParamToEntities(
                params.country
            )
        }
    }

    @observable private selectedEntitiesInQueryParam: string[] = []

    setTimeFromTimeQueryParam(time: string) {
        this.timelineFilter = getTimeDomainFromQueryString(time)
    }

    @computed get table() {
        let table = this.rootTable
        // todo: could make these separate memoized computeds to speed up
        // todo: add cross filtering. 1 dimension at a time.
        table = this.minPopulationFilter
            ? table.filterByPopulation(this.minPopulationFilter)
            : table
        table = this.filterByTime(table)

        return table
    }

    private filterByTime(table: OwidTable) {
        if (false) return table
        const [startTime, endTime] = this.timelineFilter
        if (this.tab === GrapherTabOption.map) {
            const tolerance = this.map.timeTolerance ?? 0
            return table.filterByTime(
                startTime - tolerance,
                endTime + tolerance
            )
        }

        return table.filterByTime(startTime, endTime)
    }

    @observable.ref isMediaCard = false
    @observable.ref isExporting?: boolean
    @observable.ref tooltip?: TooltipProps
    @observable isPlaying = false
    @observable.ref isSelectingData = false

    @computed get isInteractive() {
        return !this.isExporting
    }

    @computed get editUrl() {
        return Cookies.get(CookieKey.isAdmin) || this.isDev
            ? `${this.adminBaseUrl}/admin/charts/${this.id}/edit`
            : undefined
    }

    private populationFilterToggleOption = 1e6
    // Make the default filter toggle option reflect what is initially loaded.
    @computed get populationFilterOption() {
        if (this.minPopulationFilter)
            this.populationFilterToggleOption = this.minPopulationFilter
        return this.populationFilterToggleOption
    }

    // Checks if the data 1) is about countries and 2) has countries with less than the filter option. Used to partly determine whether to show the filter control.
    @computed private get hasCountriesSmallerThanFilterOption() {
        return this.rootTable.availableEntityNames.some(
            (entityName) =>
                populationMap[entityName] &&
                populationMap[entityName] < this.populationFilterOption
        )
    }

    // at startDrag, we want to show the full axis
    @observable.ref useTimelineDomains = false

    @observable userHasSetTimeline = false

    @action.bound private async downloadLegacyDataFromUrl(url: string) {
        const json = await fetchJSON(url)
        this._receiveLegacyData(json)
    }

    @computed get isAdmin() {
        if (typeof window === "undefined") return false

        if (window.admin) return true

        return !!Cookies.get(CookieKey.isAdmin)
    }

    @action.bound private async downloadLegacyDataFromOwidVariableIds() {
        if (this.variableIds.length === 0)
            // No data to download
            return

        try {
            if (this.isAdmin) {
                const json = await window.admin.getJSON(
                    `/api/data/variables/${this.dataFileName}`
                )
                this._receiveLegacyData(json)
            } else {
                await this.downloadLegacyDataFromUrl(this.dataUrl)
            }
        } catch (err) {
            console.error(err)
        }
    }

    // Provide a way to insert an arbitrary element into the embed popup.
    // The "hideControls" property is a param on the explorer, so to maintain
    // modularity between the explorer and chart I am injecting the checkbox this way.
    // In the future if we merge the two we could shift to a cleaner approach.
    @observable.ref embedExplorerCheckbox?: JSX.Element

    @action.bound receiveLegacyData(json: LegacyVariablesAndEntityKey) {
        this._receiveLegacyData(json)
    }

    @action.bound private _receiveLegacyData(
        json: LegacyVariablesAndEntityKey
    ) {
        this.rootTable = OwidTable.fromLegacy(json, this.legacyConfigAsAuthored)

        if (this.selectedEntitiesInQueryParam.length) {
            const entityNames = this.rootTable.getEntityNamesFromCodes(
                this.selectedEntitiesInQueryParam
            )
            const notFoundEntities = entityNames.filter(
                (name) => !this.rootTable.availableEntityNameSet.has(name)
            )

            this.rootTable.setSelectedEntities(entityNames)
            if (notFoundEntities.length)
                this.analytics.logEntitiesNotFoundError(notFoundEntities)
        } else if (this.selectedEntityNames.length)
            this.rootTable.setSelectedEntities(this.selectedEntityNames)
        else if (this.selectedEntityIds.length)
            this.rootTable.setSelectedEntitiesByEntityId(this.selectedEntityIds)
    }

    @observable.ref private _baseFontSize = BASE_FONT_SIZE

    @computed get baseFontSize() {
        if (this.isMediaCard) return 24
        else if (this.isExporting) return 18
        else return this._baseFontSize
    }

    set baseFontSize(val: number) {
        this._baseFontSize = val
    }

    // Ready to go iff we have retrieved data for every variable associated with the chart
    @computed get isReady() {
        return this.dimensions.length > 0 && this.loadingDimensions.length === 0
    }

    async whenReady() {
        return new Promise((resolve) => {
            if (this.isReady) return resolve()
            observe(this, "isReady", () => {
                if (this.isReady) resolve()
            })
        })
    }

    @computed private get loadingDimensions() {
        return this.dimensions.filter((dim) => !this.table.has(dim.columnSlug))
    }

    @computed get isIframe() {
        return window.self !== window.top
    }

    // todo: have the concept of an active table? active column? activeTimelineColumn? activeTimelineTable?
    // todo: remove ifs
    @computed get times(): Time[] {
        if (this.tab === GrapherTabOption.map)
            return this.rootTable.get(this.mapColumnSlug)!.timelineTimes || []
        // todo: filter out min times and end times?
        return this.rootTable.timelineTimes
    }

    // todo: remove ifs
    @computed get startTime(): Time {
        const activeTab = this.tab
        if (activeTab === GrapherTabOption.table)
            return (
                // todo: readd this behavior. this.dataTableTransform.autoSelectedStartTime ??
                this.timelineFilter[0]
            )
        else if (activeTab === GrapherTabOption.map)
            return this.mapColumn?.endTimelineTime || 1900 // always use end time for maps
        return this.table.minTime || 1900
    }

    // todo: remove ifs
    set startTime(newValue: Time) {
        if (this.tab === GrapherTabOption.map)
            this.timelineFilter = [newValue, newValue]
        else this.timelineFilter = [newValue, this.timelineFilter[1]]
    }

    // todo: remove ifs
    set endTime(value: Time) {
        const activeTab = this.tab
        if (
            activeTab === GrapherTabOption.map ||
            activeTab === GrapherTabOption.table
        )
            this.timelineFilter = [value, value]
        else this.timelineFilter = [this.timelineFilter[0], value]
    }

    // todo: remove ifs
    @computed get endTime(): Time {
        const activeTab = this.tab
        // if (activeTab === "table")
        //     return this.multiMetricTableMode
        //         ? this.timeDomain[1] // todo: readd this.dataTableTransform.startTimelineTime
        //         : this.timeDomain[1]
        if (activeTab === GrapherTabOption.map)
            return this.mapColumn?.endTimelineTime || 2000
        return this.table.maxTime || 2000
    }

    @computed get isNativeEmbed() {
        return this.isEmbed && !this.isIframe && !this.isExporting
    }

    @computed.struct private get variableIds() {
        return uniq(this.dimensions.map((d) => d.variableId))
    }

    @computed private get dataFileName() {
        return `${this.variableIds.join("+")}.json?v=${
            this.isEditor ? undefined : this.cacheTag
        }`
    }

    @computed get dataUrl() {
        return `${this.bakedGrapherURL}/data/variables/${this.dataFileName}`
    }

    externalCsvLink = ""

    @computed get hasOWIDLogo() {
        return (
            !this.hideLogo && (this.logo === undefined || this.logo === "owid")
        )
    }

    // todo: did this name get botched in a merge?
    @computed get hasFatalErrors() {
        return this.relatedQuestions.some(
            (question) => !!getErrorMessageRelatedQuestionUrl(question)
        )
    }

    disposers: IReactionDisposer[] = []

    @bind dispose() {
        this.disposers.forEach((dispose) => dispose())
    }

    @computed get fontSize() {
        return this.baseFontSize
    }

    // todo: can we remove this?
    // I believe these states can only occur during editing.
    @action.bound private ensureValidConfigWhenEditing() {
        this.disposers.push(
            reaction(
                () => this.variableIds,
                this.downloadLegacyDataFromOwidVariableIds
            )
        )
        const disposers = [
            autorun(() => {
                if (!this.availableTabs.includes(this.tab))
                    runInAction(() => (this.tab = this.availableTabs[0]))
            }),
            autorun(() => {
                const validDimensions = this.validDimensions
                if (!isEqual(this.dimensions, validDimensions))
                    this.dimensions = validDimensions
            }),
        ]
        this.disposers.push(...disposers)
    }

    @computed private get validDimensions() {
        const { dimensions } = this
        const validProperties = this.dimensionSlots.map((d) => d.property)
        let validDimensions = dimensions.filter((dim) =>
            validProperties.includes(dim.property)
        )

        this.dimensionSlots.forEach((slot) => {
            if (!slot.allowMultiple)
                validDimensions = uniqWith(
                    validDimensions,
                    (
                        a: LegacyChartDimensionInterface,
                        b: LegacyChartDimensionInterface
                    ) =>
                        a.property === slot.property &&
                        a.property === b.property
                )
        })

        return validDimensions
    }

    // Only true if isExplorable is true and chart meets certain criteria
    @computed get isExplorableConstrained() {
        return this.isExplorable && canBeExplorable(this)
    }

    // todo: do we need this?
    @computed get originUrlWithProtocol() {
        let url = this.originUrl
        if (!url.startsWith("http")) url = `https://${url}`
        return url
    }

    @computed get primaryTab() {
        return this.tab
    }
    @computed get overlayTab() {
        return this.overlay
    }

    /** TEMPORARY: Needs to be replaced with declarative filter columns ASAP */
    private chartMinPopulationFilter?: number = undefined

    @action.bound private revertDataTableSpecificState() {
        /** If the start year was autoselected in the DataTable, revert. */
        if (!this.userHasSetTimeline)
            this.timelineFilter = [
                this.legacyConfigAsAuthored.minTime ??
                    TimeBoundValue.unboundedLeft,
                this.timelineFilter[1],
            ]

        /** Revert the state of minPopulationFilter */
        this.minPopulationFilter = this.chartMinPopulationFilter
    }

    @computed get currentTab() {
        return this.overlay ? this.overlay : this.tab
    }

    /** TEMPORARY: Needs to be replaced with declarative filter columns ASAP */
    set currentTab(value) {
        if (this.tab === GrapherTabOption.chart)
            this.chartMinPopulationFilter = this.minPopulationFilter
        if (
            this.tab === GrapherTabOption.table &&
            value !== GrapherTabOption.table
        )
            this.revertDataTableSpecificState()

        if (
            value === GrapherTabOption.chart ||
            value === GrapherTabOption.map ||
            value === GrapherTabOption.table
        ) {
            this.tab = value
            this.overlay = undefined
        } else {
            // table tab cannot be downloaded, so revert to default tab
            if (
                value === GrapherTabOption.download &&
                this.tab === GrapherTabOption.table
            )
                this.tab =
                    this.legacyConfigAsAuthored.tab || GrapherTabOption.chart
            this.overlay = value
        }
    }

    @computed get timelineFilter(): TimeBounds {
        return [
            // Handle `undefined` values in minTime/maxTime
            minTimeFromJSON(this.minTime),
            maxTimeFromJSON(this.maxTime),
        ]
    }

    set timelineFilter(value: TimeBounds) {
        this.minTime = value[0]
        this.maxTime = value[1]
    }

    // Get the dimension slots appropriate for this type of chart
    @computed get dimensionSlots() {
        const xAxis = new DimensionSlot(this, DimensionProperty.x)
        const yAxis = new DimensionSlot(this, DimensionProperty.y)
        const color = new DimensionSlot(this, DimensionProperty.color)
        const size = new DimensionSlot(this, DimensionProperty.size)

        if (this.isScatter) return [yAxis, xAxis, size, color]
        else if (this.isTimeScatter) return [yAxis, xAxis]
        else if (this.isSlopeChart) return [yAxis, size, color]
        return [yAxis]
    }

    @computed.struct get filledDimensions() {
        return this.isReady ? this.dimensions : []
    }

    @action.bound addDimension(config: LegacyChartDimensionInterface) {
        this.dimensions.push(new ChartDimension(config, this))
    }

    @action.bound setDimensionsForProperty(
        property: DimensionProperty,
        newConfigs: LegacyChartDimensionInterface[]
    ) {
        let newDimensions: ChartDimension[] = []
        this.dimensionSlots.forEach((slot) => {
            if (slot.property === property)
                newDimensions = newDimensions.concat(
                    newConfigs.map((config) => new ChartDimension(config, this))
                )
            else newDimensions = newDimensions.concat(slot.dimensions)
        })
        this.dimensions = newDimensions
    }

    @action.bound setDimensionsFromConfigs(
        configs: LegacyChartDimensionInterface[]
    ) {
        this.dimensions = configs.map(
            (config) => new ChartDimension(config, this)
        )
    }

    @computed get displaySlug() {
        return this.slug ?? slugify(this.displayTitle)
    }

    @computed get availableTabs() {
        return [
            this.hasChartTab && GrapherTabOption.chart,
            this.hasMapTab && GrapherTabOption.map,
            GrapherTabOption.table,
            GrapherTabOption.sources,
            GrapherTabOption.download,
        ].filter(identity) as GrapherTabOption[]
    }

    @computed get currentTitle() {
        let text = this.displayTitle
        const selectedEntityNames = this.table.selectedEntityNames

        if (
            this.primaryTab === GrapherTabOption.chart &&
            this.addCountryMode !== EntitySelectionMode.MultipleEntities &&
            selectedEntityNames.length === 1 &&
            (!this.hideTitleAnnotation || this.canChangeEntity)
        ) {
            const entityStr = selectedEntityNames[0]
            if (entityStr.length) text = `${text}, ${entityStr}`
        }

        if (
            !this.hideTitleAnnotation &&
            this.isLineChart &&
            this.isRelativeMode
        )
            text = "Change in " + lowerCaseFirstLetterUnlessAbbreviation(text)

        if (
            this.isReady &&
            (!this.hideTitleAnnotation ||
                (this.isLineChart && this.isSingleTime && this.hasTimeline) ||
                (this.primaryTab === GrapherTabOption.map &&
                    this.mapHasTimeline))
        )
            text += this.timeTitleSuffix

        return text.trim()
    }

    @computed get hasTimeline() {
        if (this.isStackedBar || this.isStackedArea) return false
        return !this.hideTimeline && this.rootTable.hasMultipleTimelineTimes
    }

    /**
     * Whether the plotted data only contains a single year.
     */
    @computed get isSingleTime() {
        return this.startTime === this.endTime
    }

    @computed get mapHasTimeline() {
        return !this.map.hideTimeline && this.mapColumn?.hasMultipleTimes
    }

    @computed get mapColumn() {
        return this.table.get(this.mapColumnSlug)
    }

    @computed get mapColumnSlug() {
        return (this.map.columnSlug || this.yColumnSlug)!
    }

    getColumnForProperty(property: DimensionProperty) {
        return this.dimensions.find((dim) => dim.property === property)?.column
    }

    getSlugForProperty(property: DimensionProperty) {
        return this.dimensions.find((dim) => dim.property === property)
            ?.columnSlug
    }

    @computed get yColumns() {
        return this.filledDimensions
            .filter((dim) => dim.property === DimensionProperty.y)
            .map((dim) => dim.column)
    }

    @computed get yColumnSlugs() {
        return this.dimensions
            .filter((dim) => dim.property === DimensionProperty.y)
            .map((dim) => dim.columnSlug)
    }

    @computed get yColumnSlug() {
        return this.getSlugForProperty(DimensionProperty.y)
    }

    @computed get xColumnSlug() {
        return this.getSlugForProperty(DimensionProperty.x)
    }

    @computed get sizeColumnSlug() {
        return this.getSlugForProperty(DimensionProperty.size)
    }

    @computed private get timeTitleSuffix() {
        if (!this.table.timeColumn) return "" // Do not show year until data is loaded
        const { startTime, endTime } = this
        const fn = this.table.timeColumn.formatValue
        const timeFrom = fn(startTime)
        const timeTo = fn(endTime)
        const time = timeFrom === timeTo ? timeFrom : timeFrom + " to " + timeTo

        return ", " + time
    }

    @computed get sourcesLine() {
        return this.sourceDesc !== undefined
            ? this.sourceDesc
            : this.defaultSourcesLine
    }

    @computed get columnsWithSources() {
        return this.table.columnsAsArray.filter((column) => {
            if (
                column.name === "Countries Continents" ||
                column.name === "Total population (Gapminder)"
            )
                return false
            return !!(column.spec as OwidColumnSpec).source
        })
    }

    @computed private get defaultSourcesLine() {
        let sourceNames = this.columnsWithSources.map(
            (column) => (column.spec as OwidColumnSpec)?.source?.name || ""
        )

        // Shorten automatic source names for certain major sources
        sourceNames = sourceNames.map((sourceName) => {
            for (const majorSource of [
                "World Bank – WDI",
                "World Bank",
                "ILOSTAT",
            ]) {
                if (sourceName.startsWith(majorSource)) return majorSource
            }
            return sourceName
        })

        return uniq(sourceNames).join(", ")
    }

    @computed private get axisDimensions() {
        return this.filledDimensions.filter(
            (dim) =>
                dim.property === DimensionProperty.y ||
                dim.property === DimensionProperty.x
        )
    }

    @computed private get defaultTitle() {
        const { yColumns } = this
        if (this.isScatter)
            return this.axisDimensions
                .map((d) => d.column.displayName)
                .join(" vs. ")

        if (
            this.hasMultipleYColumns &&
            uniq(
                yColumns.map((col) => (col.spec as OwidColumnSpec).datasetName)
            ).length === 1
        )
            return (yColumns[0].spec as OwidColumnSpec).datasetName!

        if (yColumns.length === 2)
            return yColumns.map((col) => col.displayName).join(" and ")

        return yColumns.map((col) => col.displayName).join(", ")
    }

    @computed get displayTitle() {
        return this.title ?? this.defaultTitle
    }

    // Returns an object ready to be serialized to JSON
    @computed get object() {
        return this.toObject()
    }

    @computed get isLineChart() {
        return this.type === ChartTypeName.LineChart
    }
    @computed get isScatter() {
        return this.type === ChartTypeName.ScatterPlot
    }
    @computed get isTimeScatter() {
        return this.type === ChartTypeName.TimeScatter
    }
    @computed get isStackedArea() {
        return this.type === ChartTypeName.StackedArea
    }
    @computed get isSlopeChart() {
        return this.type === ChartTypeName.SlopeChart
    }
    @computed get isDiscreteBar() {
        return this.type === ChartTypeName.DiscreteBar
    }
    @computed get isStackedBar() {
        return this.type === ChartTypeName.StackedBar
    }

    @computed get activeColorScale() {
        return this.colorScale as any // todo: restore
    }

    @computed get supportsMultipleYColumns() {
        return !(this.isScatter || this.isTimeScatter || this.isSlopeChart)
    }

    @computed private get xDimension() {
        return this.filledDimensions.find(
            (d) => d.property === DimensionProperty.x
        )
    }

    // todo: remove. do this at table filter level
    getEntityNamesToShow(filterBackgroundEntities?: boolean): EntityName[] {
        return []
        // let entityNames = filterBackgroundEntities
        //     ? this.table.selectedEntityNames
        //     : this.possibleEntityNames

        // if (this.matchingEntitiesOnly && this.colorDimension)
        //     entityNames = intersection(
        //         entityNames,
        //         this.colorDimension.column.entityNamesUniqArr
        //     )

        // if (this.excludedEntityNames)
        //     entityNames = entityNames.filter(
        //         (entity) => !this.excludedEntityNames.includes(entity)
        //     )

        // return entityNames
    }

    // todo: remove this. Should be done as a simple column transform at the data level.
    // Possible to override the x axis dimension to target a special year
    // In case you want to graph say, education in the past and democracy today https://ourworldindata.org/grapher/correlation-between-education-and-democracy
    @computed get xOverrideTime() {
        return this.xDimension && this.xDimension.targetTime
    }

    set xOverrideTime(value: number | undefined) {
        this.xDimension!.targetTime = value
    }

    // todo: move to table
    @computed get excludedEntityNames(): EntityName[] {
        const entityIds = this.excludedEntities || []
        const entityNameMap = this.table.entityIdToNameMap
        return entityIds
            .map((entityId) => entityNameMap.get(entityId)!)
            .filter((d) => d)
    }

    @computed get idealBounds() {
        return this.isMediaCard
            ? new Bounds(0, 0, 1200, 630)
            : new Bounds(0, 0, 850, 600)
    }

    @computed get hasYDimension() {
        return this.dimensions.some((d) => d.property === DimensionProperty.y)
    }

    @computed get staticSVG() {
        const props = {
            ...this.toObject(),
            isExport: true,
            bounds: this.idealBounds,
        }
        return ReactDOMServer.renderToStaticMarkup(<Grapher {...props} />)
    }

    @computed get mapConfig() {
        return this.map
    }

    @computed get cacheTag() {
        return this.version.toString()
    }

    @computed get mapIsClickable() {
        return (
            this.hasChartTab &&
            (this.isLineChart || this.isScatter) &&
            !isMobile()
        )
    }

    @computed get relativeToggleLabel() {
        if (this.isScatter || this.isTimeScatter) return "Average annual change"
        else if (this.isLineChart) return "Relative change"
        return "Relative"
    }

    // NB: The timeline scatterplot in relative mode calculates changes relative
    // to the lower bound year rather than creating an arrow chart
    @computed get isRelativeMode() {
        return this.stackMode === StackMode.relative
    }

    @computed get canToggleRelativeMode() {
        if (this.isLineChart)
            return !this.hideRelativeToggle && !this.isSingleTime
        return !this.hideRelativeToggle
    }

    // Filter data to what can be display on the map (across all times)
    @computed get mappableData() {
        return (
            this.mapColumn?.owidRows.filter((row) =>
                isOnTheMap(row.entityName)
            ) ?? []
        )
    }

    @computed private get hasMultipleCountriesOnTheMap() {
        return this.mappableData.length > 1
    }

    static bootstrap({
        jsonConfig,
        containerNode,
        isEmbed,
        queryStr,
        globalEntitySelection,
    }: {
        jsonConfig: GrapherInterface
        containerNode: HTMLElement
        isEmbed?: true
        queryStr?: string
        globalEntitySelection?: GlobalEntitySelection
    }) {
        let view
        function render() {
            const enableKeyboardShortcuts = !isEmbed
            const props: GrapherProgrammaticInterface = {
                ...jsonConfig,
                isEmbed,
                enableKeyboardShortcuts,
                queryStr,
                globalEntitySelection,
                bounds: Bounds.fromRect(containerNode.getBoundingClientRect()),
            }
            view = ReactDOM.render(<Grapher {...props} />, containerNode)
        }

        render()
        window.addEventListener("resize", throttle(render))
        return view
    }

    @computed private get isExport() {
        return this.props.isExport
    }

    @computed get isEmbed() {
        return (
            this.props.isEmbed ||
            (!this.isExport && (window.self !== window.top || this.isEditor))
        )
    }

    @computed get isMobile() {
        return isMobile()
    }

    @computed private get bounds() {
        return this.props.bounds ?? DEFAULT_BOUNDS
    }

    @computed private get isPortrait() {
        return this.bounds.width < this.bounds.height && this.bounds.width < 850
    }

    @computed private get isLandscape() {
        return !this.isPortrait
    }

    @computed private get authorWidth() {
        return this.isPortrait ? 400 : 680
    }
    @computed private get authorHeight() {
        return this.isPortrait ? 640 : 480
    }

    // If the available space is very small, we use all of the space given to us
    @computed private get fitBounds() {
        const {
            isEditor,
            isEmbed,
            isExport,
            bounds,
            authorWidth,
            authorHeight,
        } = this

        if (isEditor) return false

        return (
            isEmbed ||
            isExport ||
            bounds.height < authorHeight ||
            bounds.width < authorWidth
        )
    }

    // If we have a big screen to be in, we can define our own aspect ratio and sit in the center
    @computed private get paddedWidth() {
        return this.isPortrait
            ? this.bounds.width * 0.95
            : this.bounds.width * 0.95
    }
    @computed private get paddedHeight() {
        return this.isPortrait
            ? this.bounds.height * 0.95
            : this.bounds.height * 0.95
    }
    @computed private get scaleToFitIdeal() {
        return Math.min(
            this.paddedWidth / this.authorWidth,
            this.paddedHeight / this.authorHeight
        )
    }
    @computed private get idealWidth() {
        return this.authorWidth * this.scaleToFitIdeal
    }
    @computed private get idealHeight() {
        return this.authorHeight * this.scaleToFitIdeal
    }

    // These are the final render dimensions
    @computed private get renderWidth() {
        return this.fitBounds
            ? this.bounds.width - (this.isExport ? 0 : 5)
            : this.idealWidth
    }
    @computed private get renderHeight() {
        return this.fitBounds
            ? this.bounds.height - (this.isExport ? 0 : 5)
            : this.idealHeight
    }

    @computed get tabBounds() {
        return new Bounds(0, 0, this.renderWidth, this.renderHeight).padBottom(
            this.isExport ? 0 : this.footerHeight
        )
    }

    @observable.ref private popups: VNode[] = []

    base: React.RefObject<HTMLDivElement> = React.createRef()

    @computed get containerElement() {
        return this.base.current || undefined
    }

    @observable private hasBeenVisible = false
    @observable hasError = false

    @computed private get classNames() {
        const classNames = [
            "chart",
            this.isExport && "export",
            this.isEditor && "editor",
            this.isEmbed && "embed",
            this.isPortrait && "portrait",
            this.isLandscape && "landscape",
            isTouchDevice() && "is-touch",
        ]

        return classNames.filter((n) => !!n).join(" ")
    }

    // todo: clean up this popup stuff
    addPopup(vnode: VNode) {
        this.popups = this.popups.concat([vnode])
    }

    removePopup(vnodeType: any) {
        this.popups = this.popups.filter((d) => !(d.type === vnodeType))
    }

    private renderPrimaryTab() {
        const { tabBounds } = this
        if (
            this.primaryTab === GrapherTabOption.chart ||
            this.primaryTab === GrapherTabOption.map
        )
            return <ChartTab manager={this} />

        if (this.primaryTab === GrapherTabOption.table)
            return (
                <div
                    className="tableTab"
                    style={{ ...tabBounds.toCSS(), position: "absolute" }}
                >
                    <DataTable bounds={tabBounds} manager={this} />
                </div>
            )

        return undefined
    }

    private renderOverlayTab() {
        const bounds = this.tabBounds
        if (this.overlayTab === GrapherTabOption.sources)
            return (
                <SourcesTab key="sourcesTab" bounds={bounds} manager={this} />
            )
        if (this.overlayTab === GrapherTabOption.download)
            return (
                <DownloadTab key="downloadTab" bounds={bounds} manager={this} />
            )
        return undefined
    }

    private renderReady() {
        return (
            <>
                {this.hasBeenVisible && this.renderPrimaryTab()}
                <FooterControls manager={this} />
                {this.renderOverlayTab()}
                {this.popups}
                <TooltipView
                    width={this.renderWidth}
                    height={this.renderHeight}
                    tooltipProvider={this}
                />
                {this.renderKeyboardShortcuts()}
                {this.isSelectingData && (
                    <EntitySelectorModal
                        key="entitySelector"
                        grapher={this}
                        isMobile={this.isMobile}
                        onDismiss={action(() => (this.isSelectingData = false))}
                    />
                )}
            </>
        )
    }

    @observable private enableKeyboardShortcuts = false

    private renderKeyboardShortcuts() {
        if (!this.enableKeyboardShortcuts) return null
        return (
            <CommandPalette commands={this.keyboardShortcuts} display="none" />
        )
    }

    @action.bound toggleTabCommand() {
        this.tab = next(this.availableTabs, this.tab)
    }

    @action.bound toggleKeyboardHelpCommand() {
        const element = document.getElementsByClassName(
            "CommandPalette"
        )[0] as HTMLElement
        element.style.display =
            element.style.display === "none" ? "block" : "none"
    }

    @action.bound togglePlayingCommand() {
        this.isPlaying = !this.isPlaying
    }

    get keyboardShortcuts(): Command[] {
        const nums = range(0, 10).map((num) => {
            return { combo: `${num}`, fn: () => this.randomSelection(num) }
        })
        return [
            ...nums,
            {
                combo: "t",
                fn: () => this.toggleTabCommand(),
                title: "Toggle tab",
                category: "Navigation",
            },
            {
                combo: "?",
                fn: () => this.toggleKeyboardHelpCommand(),
                title: `Toggle Help`,
                category: "Navigation",
            },
            {
                combo: "a",
                fn: () =>
                    this.rootTable.hasSelection
                        ? this.rootTable.clearSelection()
                        : this.rootTable.selectAll(),
                title: this.rootTable.hasSelection
                    ? `Select None`
                    : `Select All`,
                category: "Selection",
            },
            {
                combo: "p",
                fn: () => this.togglePlayingCommand(),
                title: this.isPlaying ? `Pause` : `Play`,
                category: "Timeline",
            },
            {
                combo: "f",
                fn: () => this.toggleFacetStrategy(),
                title: `Faceting ${this.facetStrategy ?? "off"}`,
                category: "Chart",
            },
            {
                combo: "l",
                fn: () => this.toggleYScaleTypeCommand(),
                title: "Toggle Y log/linear",
                category: "Chart",
            },
            {
                combo: "esc",
                fn: () => (this.hasError = false),
            },

            // { // todo: add
            //     combo: "o",
            //     fn: () => this.updateFromObject(this.legacyConfigAsAuthored),
            //     title: "Restore original",
            //     category: "Navigation",
            // },
        ]
    }

    @action.bound toggleYScaleTypeCommand() {
        this.yAxis.scaleType = next(
            [ScaleType.linear, ScaleType.log],
            this.yAxis.scaleType
        )
    }

    @action.bound private toggleFacetStrategy() {
        this._facetStrategy = next(
            this.availableFacetStrategies,
            this._facetStrategy
        )
    }

    @observable private _facetStrategy?: FacetStrategy

    @computed private get hasMultipleYColumns() {
        return this.yColumnSlugs.length > 1
    }

    @computed private get availableFacetStrategies() {
        const strategies: (FacetStrategy | undefined)[] = [undefined]

        if (this.hasMultipleYColumns) {
            strategies.push(FacetStrategy.column)
            if (
                this.table.numAvailableEntityNames > 1 &&
                this.hasMultipleCountriesOnTheMap
            )
                strategies.push(FacetStrategy.columnWithMap)
        }

        if (this.table.numSelectedEntities > 1) {
            strategies.push(FacetStrategy.country)
            if (this.hasMultipleCountriesOnTheMap)
                strategies.push(FacetStrategy.countryWithMap)
        }

        return strategies
    }

    @computed get facetStrategy() {
        if (
            this._facetStrategy &&
            this.availableFacetStrategies.includes(this._facetStrategy)
        )
            return this._facetStrategy

        // Auto facet on SingleEntity charts with multiple selected entities
        if (
            this.addCountryMode === EntitySelectionMode.SingleEntity &&
            this.table.numSelectedEntities > 1
        )
            return FacetStrategy.country

        // Auto facet when multiple slugs and multiple entities selected. todo: not sure if this is correct.
        if (
            this.addCountryMode === EntitySelectionMode.MultipleEntities &&
            this.hasMultipleYColumns &&
            this.table.numSelectedEntities > 1
        )
            return FacetStrategy.column

        return undefined
    }

    @action.bound randomSelection(num: number) {
        // Continent, Population, GDP PC, GDP, PopDens, UN, Language, etc.
        this.hasError = false
        const currentSelection = this.rootTable.selectedEntityNames.length
        const newNum = num ? num : currentSelection ? currentSelection * 2 : 10
        this.rootTable.setSelectedEntities(
            sampleFrom(this.rootTable.availableEntityNames, newNum, Date.now())
        )
    }

    private renderError() {
        return (
            <div
                style={{
                    width: "100%",
                    height: "100%",
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    textAlign: "center",
                    lineHeight: 1.5,
                    padding: "3rem",
                }}
            >
                <p style={{ color: "#cc0000", fontWeight: 700 }}>
                    <FontAwesomeIcon icon={faExclamationTriangle} /> There was a
                    problem loading this chart
                </p>
                <p>
                    We have been notified of this error, please check back later
                    whether it's been fixed. If the error persists, get in touch
                    with us at{" "}
                    <a
                        href={`mailto:info@ourworldindata.org?subject=Broken chart on page ${window.location.href}`}
                    >
                        info@ourworldindata.org
                    </a>
                    .
                </p>
            </div>
        )
    }

    render() {
        // TODO how to handle errors in exports?
        // TODO tidy this up
        if (this.isExport) return this.renderPrimaryTab()

        const { renderWidth, renderHeight } = this

        const style = {
            width: renderWidth,
            height: renderHeight,
            fontSize: this.baseFontSize,
        }

        return (
            <div ref={this.base} className={this.classNames} style={style}>
                {this.hasError ? this.renderError() : this.renderReady()}
            </div>
        )
    }

    // Chart should only render SVG when it's on the screen
    @action.bound private checkVisibility() {
        if (!this.hasBeenVisible && isVisible(this.base.current))
            this.hasBeenVisible = true
    }

    @action.bound private setBaseFontSize() {
        if (this.renderWidth <= 400) this.baseFontSize = 14
        else if (this.renderWidth < 1080) this.baseFontSize = 16
        else if (this.renderWidth >= 1080) this.baseFontSize = 18
    }

    // Binds chart properties to global window title and URL. This should only
    // ever be invoked from top-level JavaScript.
    bindToWindow() {
        new UrlBinder().bindToWindow(this)
        autorun(() => (document.title = this.currentTitle))
    }

    componentDidMount() {
        window.addEventListener("scroll", this.checkVisibility)
        this.setBaseFontSize()
        this.checkVisibility()
    }

    private _shortcutsBound = false
    private bindKeyboardShortcuts() {
        if (this._shortcutsBound) return
        this.keyboardShortcuts.forEach((shortcut) => {
            Mousetrap.bind(shortcut.combo, () => {
                shortcut.fn()
                this.analytics.logKeyboardShortcut(
                    shortcut.title || "",
                    shortcut.combo
                )
                return false
            })
        })
        this._shortcutsBound = true
    }

    private unbindKeyboardShortcuts() {
        if (!this._shortcutsBound) return
        this.keyboardShortcuts.forEach((shortcut) => {
            Mousetrap.unbind(shortcut.combo)
        })
        this._shortcutsBound = false
    }

    componentWillUnmount() {
        this.unbindKeyboardShortcuts()
        window.removeEventListener("scroll", this.checkVisibility)
        this.dispose()
    }

    componentDidUpdate() {
        this.setBaseFontSize()
        this.checkVisibility()
        if (this.enableKeyboardShortcuts) this.bindKeyboardShortcuts()
    }

    componentDidCatch(error: any, info: any) {
        this.hasError = true
        this.analytics.logChartError(error, info)
    }

    @observable isShareMenuActive = false

    @computed get hasSpace() {
        return this.renderWidth > 700
    }

    @computed get hasRelatedQuestion() {
        if (!this.relatedQuestions.length) return false
        const question = this.relatedQuestions[0]
        return !!question && !!question.text && !!question.url
    }

    @computed private get footerLines() {
        return this.hasTimeline ? 2 : 1
    }

    @computed get footerHeight() {
        const footerRowHeight = 32 // todo: cleanup. needs to keep in sync with grapher.scss' $footerRowHeight
        return (
            this.footerLines * footerRowHeight +
            (this.hasRelatedQuestion ? 20 : 0)
        )
    }

    debounceMode: boolean = false

    @computed.struct private get allParams() {
        const params: GrapherQueryParams = {}
        params.tab = this.tab
        params.xScale = this.xAxis.scaleType
        params.yScale = this.yAxis.scaleType
        params.stackMode = this.stackMode
        params.zoomToSelection = this.zoomToSelection ? "true" : undefined
        params.minPopulationFilter = this.minPopulationFilter?.toString()
        params.endpointsOnly = this.compareEndPointsOnly ? "1" : "0"
        params.time = this.timeParam
        params.country = this.countryParam
        params.region = this.map.projection
        return params
    }

    // If the user changes a param so that it matches the author's original param, we drop it.
    // However, in the case of explorers, the user might switch graphers, and so we never want to drop
    // params. This flag turns off dropping of params.
    @observable dropUnchangedUrlParams = true

    @computed get params() {
        return (this.dropUnchangedUrlParams
            ? this.changedParams
            : this.allParams) as QueryParams
    }

    // Autocomputed url params to reflect difference between current grapher state
    // and original config state
    @computed.struct private get changedParams() {
        const params = this.allParams
        const originalConfig = this.legacyConfigAsAuthored

        if (params.tab === originalConfig.tab) params.tab = undefined

        if (params.xScale === originalConfig.xAxis?.scaleType)
            params.xScale = undefined

        if (params.yScale === originalConfig.yAxis?.scaleType)
            params.yScale = undefined

        if (params.stackMode === originalConfig.stackMode)
            params.stackMode = undefined

        if (this.zoomToSelection === originalConfig.zoomToSelection)
            params.zoomToSelection = undefined

        if (this.minPopulationFilter === originalConfig.minPopulationFilter)
            params.minPopulationFilter = undefined

        if (this.compareEndPointsOnly === originalConfig.compareEndPointsOnly)
            params.endpointsOnly = undefined

        if (
            originalConfig.map &&
            params.region === originalConfig.map.projection
        )
            params.region = undefined

        return params
    }

    @computed get queryStr() {
        return queryParamsToStr(this.params) + this.baseQueryString
    }

    // If you need to provide external query string params, like from an Explorer
    @observable baseQueryString = ""

    @computed get baseUrl() {
        return this.isPublished
            ? `${this.bakedGrapherURL}/${this.displaySlug}`
            : undefined
    }

    // Get the full url representing the canonical location of this grapher state
    @computed get canonicalUrl() {
        return this.baseUrl ? this.baseUrl + this.queryStr : undefined
    }

    @computed get timeParam() {
        const originalConfig = this.legacyConfigAsAuthored
        const formatAsDay = this.table.hasDayColumn

        if (
            this.minTime !== originalConfig.minTime ||
            this.maxTime !== originalConfig.maxTime
        ) {
            const [minTime, maxTime] = this.timelineFilter

            const start = formatTimeURIComponent(minTime, formatAsDay)

            if (minTime === maxTime) return start

            const end = formatTimeURIComponent(maxTime, formatAsDay)
            return `${start}..${end}`
        }

        if (this.map.time !== undefined)
            return formatTimeURIComponent(this.map.time, formatAsDay)

        return undefined
    }

    @computed private get countryParam() {
        const originalConfig = this.legacyConfigAsAuthored
        if (
            this.isReady &&
            JSON.stringify(this.selectedEntityNames) !==
                JSON.stringify(originalConfig.selectedEntityNames)
        )
            return EntityUrlBuilder.entitiesToQueryParam(
                this.table.selectedEntityCodes
            )

        return undefined
    }

    onPlay() {
        this.analytics.logChartTimelinePlay(this.slug)
    }

    onStartPlayOrDrag() {
        this.debounceMode = true
        this.useTimelineDomains = true
    }

    onStopPlayOrDrag() {
        this.debounceMode = false
        this.useTimelineDomains = false
    }

    @computed get disablePlay() {
        return this.isSlopeChart
    }

    formatTime(value: Time) {
        const timeColumn = this.table.timeColumn
        if (!timeColumn) return this.table.timeColumnFormatFunction(value)
        return isMobile()
            ? timeColumn.formatValueForMobile(value)
            : timeColumn.formatValue(value)
    }

    @computed get showSmallCountriesFilterToggle() {
        return this.isScatter && this.hasCountriesSmallerThanFilterOption
    }

    @computed get showYScaleToggle() {
        return this.yAxis.canChangeScaleType
    }

    @computed get showZoomToggle() {
        return this.isScatter && this.table.hasSelection
    }

    @computed get showAbsRelToggle() {
        if (!this.canToggleRelativeMode) return false
        return this.isStackedArea || this.isScatter || this.isLineChart
    }

    @computed get showHighlightToggle() {
        return this.isScatter && !!this.highlightToggle
    }

    @computed get showChangeEntityButton() {
        return !this.hideEntityControls && this.canChangeEntity
    }

    @computed get showAddEntityButton() {
        return (
            !this.hideEntityControls &&
            this.canSelectMultipleEntities &&
            (this.isLineChart || this.isStackedArea || this.isDiscreteBar)
        )
    }

    @computed get showSelectEntitiesButton() {
        return (
            !this.hideEntityControls &&
            this.addCountryMode !== EntitySelectionMode.Disabled &&
            this.table.numAvailableEntityNames > 1 &&
            !this.showAddEntityButton &&
            !this.showChangeEntityButton
        )
    }

    @computed get canSelectMultipleEntities() {
        if (this.table.numAvailableEntityNames < 2) return false
        if (this.addCountryMode === EntitySelectionMode.MultipleEntities)
            return true
        if (
            this.addCountryMode === EntitySelectionMode.SingleEntity &&
            this.facetStrategy
        )
            return true

        return false
    }

    @computed get canChangeEntity() {
        return (
            !this.isScatter &&
            this.addCountryMode === EntitySelectionMode.SingleEntity &&
            this.table.numAvailableEntityNames > 1
        )
    }

    @computed get startSelectingWhenLineClicked() {
        return this.showAddEntityButton
    }

    // For now I am only exposing this programmatically for the dashboard builder. Setting this to true
    // allows you to still use add country "modes" without showing the buttons in order to prioritize
    // another entity selector over the built in ones.
    @observable hideEntityControls = false
}

const defaultObject = objectWithPersistablesToObject(
    new Grapher(),
    grapherKeysToSerialize
)
