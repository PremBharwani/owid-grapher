import { SortOrder } from "../../coreTable/CoreTableConstants.js"
import { NounKey, NounGenerator } from "./CovidTypes.js"
import { createNoun } from "./CovidUtils.js"

export const JHU_DATA_URL =
    "https://covid.ourworldindata.org/data/jhu/full_data.csv"

export const TESTS_DATA_URL = "http://localhost:8080/data/tests/latest/data.csv"

export const DEFAULT_SORT_ORDER = SortOrder.asc

export const nouns: Record<NounKey, NounGenerator> = {
    cases: createNoun("case", "cases"),
    deaths: createNoun("death", "deaths"),
    tests: createNoun("test", "tests"),
    days: createNoun("day", "days"),
}
