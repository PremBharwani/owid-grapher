import * as db from "../db"
import * as wpdb from "../wpdb"
import * as lodash from "lodash"
import { QueryBuilder } from "knex"
import { decodeHTML } from "entities"
import { PostRow } from "../../clientUtils/owidTypes"

interface TagRow {
    id: number
    name: string
    parentId: number
    specialType: string
    isBulkImport: boolean
}

const tagSelect = <K extends keyof TagRow>(
    ...args: K[]
): { from: (query: QueryBuilder) => Promise<Pick<TagRow, K>[]> } => ({
    from: (query) => query.select(...args) as any,
})

export namespace Post {
    export const table = "posts"

    export const select = <K extends keyof PostRow>(
        ...args: K[]
    ): { from: (query: QueryBuilder) => Promise<Pick<PostRow, K>[]> } => ({
        from: (query) => query.select(...args) as any,
    })

    export const tagsByPostId = async () => {
        const postTags = await db.queryMysql(`
            SELECT pt.post_id AS postId, pt.tag_id AS tagId, t.name as tagName FROM post_tags pt
            JOIN posts p ON p.id=pt.post_id
            JOIN tags t ON t.id=pt.tag_id
        `)

        const tagsByPostId: Map<
            number,
            { id: number; name: string }[]
        > = new Map()

        for (const pt of postTags) {
            const tags = tagsByPostId.get(pt.postId) || []
            tags.push({ id: pt.tagId, name: pt.tagName })
            tagsByPostId.set(pt.postId, tags)
        }

        return tagsByPostId
    }

    export const setTags = async (postId: number, tagIds: number[]) =>
        await db.transaction(async (t) => {
            const tagRows = tagIds.map((tagId) => [tagId, postId])
            await t.execute(`DELETE FROM post_tags WHERE post_id=?`, [postId])
            if (tagRows.length)
                await t.execute(
                    `INSERT INTO post_tags (tag_id, post_id) VALUES ?`,
                    [tagRows]
                )
        })

    export const bySlug = async (slug: string): Promise<PostRow | undefined> =>
        (await db.knexTable("posts").where({ slug: slug }))[0]
}

export const syncPostsToGrapher = async () => {
    const rows = await wpdb.singleton.query(
        "SELECT * FROM wp_posts WHERE (post_type='page' OR post_type='post') AND post_status != 'trash'"
    )

    const doesExistInWordpress = lodash.keyBy(rows, "ID")
    const existsInGrapher = await Post.select("id").from(
        db.knex().from(Post.table)
    )
    const doesExistInGrapher = lodash.keyBy(existsInGrapher, "id")

    const toDelete = existsInGrapher
        .filter((p) => !doesExistInWordpress[p.id])
        .map((p) => p.id)
    const toInsert = rows.map((post: any) => {
        return {
            id: post.ID,
            title: post.post_title,
            slug: post.post_name.replace(/__/g, "/"),
            type: post.post_type,
            status: post.post_status,
            content: post.post_content,
            published_at:
                post.post_date_gmt === "0000-00-00 00:00:00"
                    ? null
                    : post.post_date_gmt,
            updated_at:
                post.post_modified_gmt === "0000-00-00 00:00:00"
                    ? "1970-01-01 00:00:00"
                    : post.post_modified_gmt,
        }
    }) as PostRow[]

    await db.knex().transaction(async (t) => {
        if (toDelete.length)
            await t.whereIn("id", toDelete).delete().from(Post.table)

        for (const row of toInsert) {
            if (doesExistInGrapher[row.id])
                await t.update(row).where("id", "=", row.id).into(Post.table)
            else await t.insert(row).into(Post.table)
        }
    })
}

export const syncPostTagsToGrapher = async () => {
    const tagsByPostId = await wpdb.getTagsByPostId()
    const postRows = await wpdb.singleton.query(
        "select * from wp_posts where (post_type='page' or post_type='post') AND post_status != 'trash'"
    )

    for (const post of postRows) {
        const tags = tagsByPostId.get(post.ID) || []
        const tagNames = tags
            .map((t) => decodeHTML(t))
            .concat([post.post_title])
        const matchingTags = await tagSelect("id", "name", "isBulkImport").from(
            db
                .knex()
                .from("tags")
                .whereIn("name", tagNames)
                .andWhere({ isBulkImport: false })
        )
        const tagIds = matchingTags.map((t) => t.id)
        if (matchingTags.map((t) => t.name).includes(post.post_title))
            tagIds.push(1640)
        await Post.setTags(post.ID, lodash.uniq(tagIds))
    }
}

// Sync post from the wordpress database to OWID database
export const syncPostToGrapher = async (
    postId: number
): Promise<string | undefined> => {
    const rows = await wpdb.singleton.query(
        "SELECT * FROM wp_posts WHERE ID = ? AND post_status != 'trash'",
        [postId]
    )

    const matchingRows = await db.knexTable(Post.table).where({ id: postId })
    const existsInGrapher = !!matchingRows.length

    const wpPost = rows[0]
    const postRow = wpPost
        ? ({
              id: wpPost.ID,
              title: wpPost.post_title,
              slug: wpPost.post_name.replace(/__/g, "/"),
              type: wpPost.post_type,
              status: wpPost.post_status,
              content: wpPost.post_content,
              published_at:
                  wpPost.post_date_gmt === "0000-00-00 00:00:00"
                      ? null
                      : wpPost.post_date_gmt,
              updated_at:
                  wpPost.post_modified_gmt === "0000-00-00 00:00:00"
                      ? "1970-01-01 00:00:00"
                      : wpPost.post_modified_gmt,
          } as PostRow)
        : undefined

    await db.knex().transaction(async (transaction) => {
        if (!postRow && existsInGrapher)
            // Delete from grapher
            await transaction.table(Post.table).where({ id: postId }).delete()
        else if (postRow && !existsInGrapher)
            await transaction.table(Post.table).insert(postRow)
        else if (postRow && existsInGrapher)
            await transaction
                .table(Post.table)
                .where("id", "=", postRow.id)
                .update(postRow)
    })

    const newPost = (
        await Post.select("slug").from(
            db.knexTable(Post.table).where({ id: postId })
        )
    )[0]
    return newPost ? newPost.slug : undefined
}
