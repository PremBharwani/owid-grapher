#!/usr/bin/env  bash
set -o errexit
set -o pipefail
set -o nounset

DB_NAME=wordpress
DB_USER=wordpress
DB_PASS=wordpress
: "${DB_HOST:?Need to set DB_HOST non-empty}"
: "${DB_ROOT_PASS:?Need to set DB_ROOT_PASS non-empty}"
: "${DATA_FOLDER:?Need to set DATA_FOLDER non-empty}"

createAndFillWordpressDb() {
    echo "Waiting for DB to be online"
    mysqladmin ping -h "${DB_HOST}" -u root --password="${DB_ROOT_PASS}" --wait=30

    DB_EXISTS=$(mysql -uroot -p"${DB_ROOT_PASS}" -h"${DB_HOST}" --batch --skip-column-names -e "SHOW DATABASES LIKE '"${DB_NAME}"';" | grep "${DB_NAME}" > /dev/null; echo "$?")
    if [ $DB_EXISTS -eq 0 ];then
        echo "A database with the name '$DB_NAME' already exists. exiting"
        return 0;
    fi

    echo "Checking if data dump has been downloaded"
    if [ -f "${DATA_FOLDER}/live_wordpress.sql.gz" ]; then
        echo "found live_wordpress.sql.gz"
    else
        echo "could not find live_wordpress.sql.gz - please download it before running this script"
        return 1;
    fi


    source "$( dirname -- "${BASH_SOURCE[0]}" )/create-user.sh"

    WITH_UPLOADS=true

    source "$( dirname -- "${BASH_SOURCE[0]}" )/refresh-wordpress-data.sh"
    return 0
}
