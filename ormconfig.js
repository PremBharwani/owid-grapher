const {
    GRAPHER_DB_HOST,
    GRAPHER_DB_NAME,
    GRAPHER_DB_USER,
    GRAPHER_DB_PASS,
    GRAPHER_DB_PORT,
} = require("./itsJustJavascript/settings/serverSettings")

module.exports = {
    type: "mysql",
    host: GRAPHER_DB_HOST || "localhost",
    port: GRAPHER_DB_PORT || 3306,
    username: GRAPHER_DB_USER || "root",
    password: GRAPHER_DB_PASS || "",
    database: GRAPHER_DB_NAME,
    entities: ["itsJustJavascript/db/model/**/*.js"],
    migrations: ["itsJustJavascript/db/migration/**/*.js"],
    charset: "utf8mb4",
    cli: {
        entitiesDir: "db/model",
        migrationsDir: "db/migration",
    },
}
