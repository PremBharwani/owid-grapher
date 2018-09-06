import * as React from 'react'
import {observer} from 'mobx-react'
import {observable, computed, action, runInAction} from 'mobx'
const fuzzysort = require("fuzzysort")

import Admin from './Admin'
import { TextField} from './Forms'
import AdminLayout from './AdminLayout'
import { uniq } from '../charts/Util'
import ChartList, { ChartListItem } from './ChartList'

interface Searchable {
    chart: ChartListItem
    term: string
}

@observer
export default class ChartIndexPage extends React.Component {
    context!: { admin: Admin }

    @observable searchInput?: string
    @observable maxVisibleCharts = 50
    @observable charts: ChartListItem[] = []

    @computed get numTotalCharts() {
        return this.charts.length
    }

    @computed get searchIndex(): Searchable[] {
        const searchIndex: Searchable[] = []
        for (const chart of this.charts) {
            searchIndex.push({
                chart: chart,
                term: fuzzysort.prepare(`${chart.title} ${chart.internalNotes} ${chart.publishedBy} ${chart.lastEditedBy}`)
            })
        }

        return searchIndex
    }

    @computed get chartsToShow(): ChartListItem[] {
        const {searchInput, searchIndex, maxVisibleCharts} = this
        if (searchInput) {
            const results = fuzzysort.go(searchInput, searchIndex, {
                limit: 50,
                key: 'term'
            })
            return uniq(results.map((result: any) => result.obj.chart))
        } else {
            return this.charts.slice(0, maxVisibleCharts)
        }
    }

    @action.bound onSearchInput(input: string) {
        this.searchInput = input
    }

    @action.bound onShowMore() {
        this.maxVisibleCharts += 100
    }

    render() {
        const {chartsToShow, searchInput, numTotalCharts} = this

        const highlight = (text: string) => {
            if (this.searchInput) {
                const html = fuzzysort.highlight(fuzzysort.single(this.searchInput, text)) || text
                return <span dangerouslySetInnerHTML={{__html: html}}/>
            } else
                return text
        }

        return <AdminLayout title="Charts">
            <main className="ChartIndexPage">
                <div className="topRow">
                    <span>Showing {chartsToShow.length} of {numTotalCharts} charts</span>
                    <TextField placeholder="Search all charts..." value={searchInput} onValue={this.onSearchInput} autofocus/>
                </div>
                <ChartList charts={chartsToShow} searchHighlight={highlight} onDelete={action((c: any) => this.charts.splice(this.charts.indexOf(c), 1))}/>
                {!searchInput && <button className="btn btn-secondary" onClick={this.onShowMore}>Show more charts...</button>}
            </main>
        </AdminLayout>
    }

    async getData() {
        const {admin} = this.context
        if (admin.currentRequests.length > 0)
            return

        const json = await admin.getJSON("/api/charts.json")
        runInAction(() => {
            this.charts = json.charts
        })
    }

    componentDidMount() {
        this.getData()
     }
}
