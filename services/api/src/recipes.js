import pg from "pg";
import { readFile } from "node:fs/promises";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
let initialized;
export async function ensureRecipes(db = pool) {
  if (db === pool && !process.env.DATABASE_URL) throw new Error("Database not configured");
  const initialize = async () => db.query(await readFile(new URL("../migrations/002-recipes.sql", import.meta.url), "utf8"));
  if (db !== pool) return initialize();
  initialized ??= initialize().catch((error) => { initialized = undefined; throw error; });
  await initialized;
}

const columns = `r.id::text, r.title, r.category, r.servings, r.description,
  r.source_title, r.source_author, r.source_page, r.source_page_end,
  jsonb_array_length(r.images) AS image_count,
  (SELECT count(*)::int FROM recipe_ingredients i WHERE i.recipe_id = r.id) AS ingredient_count`;
const withImageUrl = (recipe) => ({ ...recipe, image_url: recipe.image_count ? `/api/recipes/${recipe.id}/images/0` : null });

export function recipeParameters(params) {
  const q = (params.get("q") || "").trim();
  const category = (params.get("category") || "").trim();
  const rawPage = params.get("page") || "1";
  if (q.length > 100 || category.length > 80 || !/^[1-9]\d{0,5}$/.test(rawPage)) return null;
  return { q, category, page: Number(rawPage), pageSize: 18 };
}

export const recipeStore = {
  async list({ q, category, page, pageSize }) {
    await ensureRecipes();
    // Escape LIKE wildcards so searches are literal; all values stay parameterized.
    const search = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
    const where = `WHERE ($1 = '' OR r.title ILIKE $2 OR EXISTS (
      SELECT 1 FROM recipe_ingredients i WHERE i.recipe_id = r.id AND i.original_text ILIKE $2
    )) AND ($3 = '' OR r.category = $3)`;
    const client = await pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const values = [q, search, category];
      const counts = await client.query(`SELECT count(*)::int AS total FROM recipes r ${where}`, values);
      const { rows } = await client.query(`SELECT ${columns} FROM recipes r ${where}
        ORDER BY r.source_title, r.source_page, r.id LIMIT $4 OFFSET $5`, [...values, pageSize, (page - 1) * pageSize]);
      const categories = await client.query("SELECT category, count(*)::int AS count FROM recipes GROUP BY category ORDER BY min(source_page), category");
      const summary = await client.query(`SELECT count(*)::int AS recipes,
        coalesce(sum(jsonb_array_length(images)), 0)::int AS images FROM recipes`);
      await client.query("COMMIT");
      return { recipes: rows.map(withImageUrl), total: counts.rows[0].total, page, page_size: pageSize,
        categories: categories.rows, summary: summary.rows[0] };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  },
  async get(id) {
    await ensureRecipes();
    // Only return image metadata; binary payloads are served through their own route.
    const { rows } = await pool.query(`SELECT ${columns}, r.steps, r.notes, r.original_text,
      coalesce((SELECT jsonb_agg(jsonb_build_object('source_page', img->'source_page',
        'width', img->'width', 'height', img->'height') ORDER BY n)
        FROM jsonb_array_elements(r.images) WITH ORDINALITY AS photos(img, n)), '[]') AS images
      FROM recipes r WHERE r.id = $1`, [id]);
    if (!rows.length) return null;
    const ingredients = await pool.query(`SELECT position, group_name, name, quantity, unit, original_text
      FROM recipe_ingredients WHERE recipe_id = $1 ORDER BY position`, [id]);
    return { ...withImageUrl(rows[0]), ingredients: ingredients.rows };
  },
  async image(id, index) {
    await ensureRecipes();
    const { rows } = await pool.query("SELECT images->$2::int AS image FROM recipes WHERE id = $1", [id, index]);
    return rows[0]?.image || null;
  },
};
