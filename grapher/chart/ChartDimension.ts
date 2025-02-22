// Todo: remove this.
// Any display changes really can be computed columns. And then charts just need xColumnSlug, sizeColumnSlug, yColumnSlug (or yColumnSlugs) et cetera

import { observable, computed } from "mobx"
import { trimObject } from "../../clientUtils/Util.js"
import { OwidTable } from "../../coreTable/OwidTable.js"
import { OwidVariableDisplayConfig } from "../../clientUtils/OwidVariable.js"
import {
    ColumnSlug,
    DimensionProperty,
    OwidVariableId,
} from "../../clientUtils/owidTypes.js"
import { Time } from "../../coreTable/CoreTableConstants.js"
import {
    Persistable,
    deleteRuntimeAndUnchangedProps,
    updatePersistables,
} from "../../clientUtils/persistable/Persistable.js"
import { CoreColumn } from "../../coreTable/CoreTableColumns.js"
import { OwidChartDimensionInterface } from "../../clientUtils/OwidVariableDisplayConfigInterface.js"

// A chart "dimension" represents a binding between a chart
// and a particular variable that it requests as data
class ChartDimensionDefaults implements OwidChartDimensionInterface {
    @observable property!: DimensionProperty
    @observable variableId!: OwidVariableId

    // check on: malaria-deaths-comparisons and computing-efficiency

    @observable display = new OwidVariableDisplayConfig() // todo: make persistable

    // XXX move this somewhere else, it's only used for scatter x override and Marimekko override
    @observable targetYear?: Time = undefined
}

// todo: remove when we remove dimensions
export interface LegacyDimensionsManager {
    table: OwidTable
}

export class ChartDimension
    extends ChartDimensionDefaults
    implements Persistable
{
    private manager: LegacyDimensionsManager

    constructor(
        obj: OwidChartDimensionInterface,
        manager: LegacyDimensionsManager
    ) {
        super()
        this.manager = manager
        if (obj) this.updateFromObject(obj)
    }

    @computed private get table(): OwidTable {
        return this.manager.table
    }

    updateFromObject(obj: OwidChartDimensionInterface): void {
        if (obj.display) updatePersistables(this, { display: obj.display })

        this.targetYear = obj.targetYear
        this.variableId = obj.variableId
        this.property = obj.property
        this.slug = obj.slug
    }

    toObject(): OwidChartDimensionInterface {
        return trimObject(
            deleteRuntimeAndUnchangedProps(
                {
                    property: this.property,
                    variableId: this.variableId,
                    display: this.display,
                    targetYear: this.targetYear,
                },
                new ChartDimensionDefaults()
            )
        )
    }

    // Do not persist yet, until we migrate off VariableIds
    @observable slug?: ColumnSlug

    @computed get column(): CoreColumn {
        return this.table.get(this.columnSlug)
    }

    @computed get columnSlug(): string {
        return this.slug ?? this.variableId.toString()
    }
}
