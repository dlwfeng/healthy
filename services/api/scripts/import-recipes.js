#!/usr/bin/env node
// Offline, transactional import. No public write API and no external model calls.
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import pg from "pg";
import { ensureRecipes } from "../src/recipes.js";

export function validateManifest(manifest) {
  if (manifest?.format_version !== 1 || !/^[a-f0-9]{64}$/.test(manifest.source?.sha256 || "") ||
      !manifest.source?.title || !manifest.source?.author || !manifest.source?.filename ||
      !Number.isInteger(manifest.source?.page_count) || !Array.isArray(manifest.recipes) || !manifest.recipes.length)
    throw new Error("Invalid cookbook manifest");
  const pages = new Set();
  for (const r of manifest.recipes) {
    if (typeof r.title !== "string" || !r.title.trim() || !r.category || !r.original_text ||
        !Number.isInteger(r.source_page) || r.source_page < 1 || pages.has(r.source_page) ||
        !Number.isInteger(r.source_page_end) || r.source_page_end < r.source_page || r.source_page_end > manifest.source.page_count ||
        !Array.isArray(r.steps) || !r.steps.length || r.steps.some((s) => typeof s !== "string" || !s.trim()) ||
        !Array.isArray(r.ingredients) || !r.ingredients.length || !Array.isArray(r.images))
      throw new Error(`Invalid recipe at page ${r.source_page}`);
    pages.add(r.source_page);
    for (const [index, i] of r.ingredients.entries()) {
      if (i.position !== index + 1 || !i.name?.trim() || !i.text?.trim())
        throw new Error(`Invalid ingredient at page ${r.source_page}`);
    }
    for (const image of r.images) {
      const bytes = Buffer.from(image.data_base64 || "", "base64");
      if (image.mime_type !== "image/jpeg" || bytes.length < 100 || bytes.length > 5_000_000 ||
          bytes[0] !== 0xff || bytes[1] !== 0xd8 || !Number.isInteger(image.source_page) ||
          image.source_page < r.source_page || image.source_page > r.source_page_end ||
          createHash("sha256").update(bytes).digest("hex") !== image.sha256)
        throw new Error(`Invalid photograph at page ${r.source_page}`);
    }
  }
  return manifest;
}

export async function importRecipes(db, manifest) {
  validateManifest(manifest);
  await db.query("BEGIN");
  try {
    await db.query("SELECT pg_advisory_xact_lock(hashtext('recipe-import'))");
    await ensureRecipes(db);
    const s = manifest.source;
    for (const r of manifest.recipes) {
      const { rows } = await db.query(`INSERT INTO recipes (
        title, category, servings, description, steps, notes, original_text,
        source_title, source_author, source_filename, source_sha256, source_page, source_page_end, images
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      ON CONFLICT (source_sha256, source_page) DO UPDATE SET title=excluded.title,
        category=excluded.category, servings=excluded.servings, description=excluded.description,
        steps=excluded.steps, notes=excluded.notes, original_text=excluded.original_text,
        source_title=excluded.source_title, source_author=excluded.source_author,
        source_filename=excluded.source_filename, source_page_end=excluded.source_page_end,
        images=excluded.images, updated_at=now() RETURNING id`,
      [r.title, r.category, r.servings || "", r.description || "", JSON.stringify(r.steps), r.notes || "",
        r.original_text, s.title, s.author, s.filename, s.sha256, r.source_page, r.source_page_end, JSON.stringify(r.images)]);
      const id = rows[0].id;
      await db.query("DELETE FROM recipe_ingredients WHERE recipe_id = $1", [id]);
      for (const i of r.ingredients) {
        await db.query(`INSERT INTO recipe_ingredients (recipe_id, position, group_name, name, quantity, unit, original_text)
          VALUES ($1,$2,$3,$4,$5,$6,$7)`, [id, i.position, i.group_name || "", i.name, i.quantity || "", i.unit || "", i.text]);
      }
    }
    await db.query("COMMIT");
    return { recipes: manifest.recipes.length,
      ingredients: manifest.recipes.reduce((n, r) => n + r.ingredients.length, 0),
      images: manifest.recipes.reduce((n, r) => n + r.images.length, 0) };
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  const file = process.argv[2];
  if (!file || (!process.argv.includes("--check") && !process.env.DATABASE_URL))
    throw new Error("Usage: DATABASE_URL=… node scripts/import-recipes.js <manifest.json|-> [--check]");
  let input;
  if (file === "-") {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    input = Buffer.concat(chunks).toString("utf8");
  } else { input = await readFile(file, "utf8"); }
  const manifest = validateManifest(JSON.parse(input));
  if (process.argv.includes("--check")) {
    console.log(JSON.stringify({ valid: true, recipes: manifest.recipes.length }));
  } else {
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try { console.log(JSON.stringify(await importRecipes(client, manifest))); }
    finally { await client.end(); }
  }
}
