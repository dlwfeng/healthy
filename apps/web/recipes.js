/* Database-backed cookbook UI. Kept separate from Garmin and journal state. */
class RecipeLibrary {
  constructor({ onChange }) {
    this.onChange = onChange;
    this.status = 'idle';
    this.result = null;
    this.recipe = null;
    this.request = 0;
    this.key = null;
    this.searchDraft = null;
    document.addEventListener('input', e => {
      if (e.target.id === 'recipe-query') this.searchDraft = e.target.value;
    });
    document.addEventListener('submit', e => {
      if (!e.target.matches('[data-recipe-search]')) return;
      e.preventDefault();
      this.change({ recipe_q: new FormData(e.target).get('q').trim(), recipe_page: null, recipe: null });
    });
    document.addEventListener('click', e => {
      const button = e.target.closest('[data-recipe-category], [data-recipe-page], [data-recipe-open], [data-recipe-back], [data-recipe-retry], [data-recipe-clear]');
      if (!button) return;
      e.preventDefault();
      if (button.hasAttribute('data-recipe-category')) this.change({ recipe_category: button.dataset.recipeCategory, recipe_page: null, recipe: null });
      if (button.hasAttribute('data-recipe-page')) { this.change({ recipe_page: button.dataset.recipePage }); window.scrollTo({ top: 0 }); }
      if (button.hasAttribute('data-recipe-open')) {
        this.change({ recipe: button.dataset.recipeOpen });
        window.scrollTo({ top: 0 });
      }
      if (button.hasAttribute('data-recipe-back')) this.change({ recipe: null });
      if (button.hasAttribute('data-recipe-clear')) this.change({ recipe_q: null, recipe_category: null, recipe_page: null, recipe: null });
      if (button.hasAttribute('data-recipe-retry')) this.open(true);
    });
  }
  escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }
  readRoute() {
    const p = new URLSearchParams(location.search);
    return { id: p.get('recipe') || '', q: p.get('recipe_q') || '', category: p.get('recipe_category') || '', page: p.get('recipe_page') || '1' };
  }
  change(values) {
    const url = new URL(location.href);
    url.hash = 'recipes';
    for (const [key, value] of Object.entries(values)) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    history.pushState({}, '', url);
    this.open();
    document.getElementById('app-main').focus({ preventScroll: true });
  }
  async open(force = false) {
    const route = this.readRoute();
    const key = JSON.stringify(route);
    if (!force && key === this.key && this.status !== 'idle') return;
    this.key = key;
    this.route = route;
    this.searchDraft = route.q;
    const request = ++this.request;
    this.status = 'loading';
    this.onChange();
    const query = new URLSearchParams({ q: route.q, category: route.category, page: route.page });
    try {
      if (route.id && !/^[1-9]\d{0,17}$/.test(route.id)) { this.status = 'missing'; this.onChange(); return; }
      const response = await fetch(route.id ? `/api/recipes/${route.id}` : `/api/recipes?${query}`, { cache: 'no-store' });
      if (request !== this.request) return;
      if (response.status === 404) { this.status = 'missing'; this.onChange(); return; }
      if (!response.ok) throw new Error('recipe_unavailable');
      const data = await response.json();
      if (request !== this.request) return;
      if (route.id) this.recipe = data.recipe;
      else this.result = data;
      this.status = 'ready';
    } catch {
      if (request !== this.request) return;
      this.status = 'error';
    }
    this.onChange();
  }
  render() {
    const e = value => this.escape(value);
    const route = this.route || this.readRoute();
    const title = '<div class="page-heading rc-heading"><div><div class="rc-eyebrow">MY COOKBOOK</div><h1>食谱推荐</h1><p>目前可浏览食谱库；个性化推荐仍在规划中。</p></div><a class="text-link" href="#food" data-goto="food">饮食记录 →</a><span class="rc-source-label">Suzy Karadsheh · 地中海饮食</span></div>';
    const loading = '<div class="rc-state" role="status">正在翻开食谱…</div>';
    if (this.status === 'error') return `<section class="recipe-library">${route.id ? '<button class="rc-back" type="button" data-recipe-back>← 返回食谱</button>' : title}<div class="rc-state" role="alert"><h2>暂时无法读取食谱</h2><p>请稍后重试。</p><button class="rc-button" type="button" data-recipe-retry>重新读取</button></div></section>`;
    if (route.id) {
      const back = '<button class="rc-back" type="button" data-recipe-back>← 返回食谱</button>';
      if (this.status === 'missing') return `<section class="recipe-library">${back}<div class="rc-state"><h1>没有找到这道食谱</h1><p>可以返回食谱库重新选择。</p></div></section>`;
      if (this.status !== 'ready') return `<section class="recipe-library">${back}${loading}</section>`;
      return `<section class="recipe-library">${back}${this.detail()}</section>`;
    }
    const data = this.result;
    const search = `<form class="rc-search" data-recipe-search role="search"><label for="recipe-query">想吃什么？</label><div><input type="search" id="recipe-query" name="q" maxlength="100" value="${e(this.searchDraft ?? route.q)}" placeholder="搜索菜名或配料，如番茄、鹰嘴豆"><button class="rc-button" type="submit">搜索食谱</button></div></form>`;
    const categories = data?.categories?.length ? `<div class="rc-categories" role="group" aria-label="食谱分类"><button type="button" class="rc-filter" aria-pressed="${!route.category}" data-recipe-category="">全部 <span>${data.summary.recipes}</span></button>${data.categories.map(c => `<button type="button" class="rc-filter" aria-pressed="${route.category === c.category}" data-recipe-category="${e(c.category)}">${e(c.category)} <span>${c.count}</span></button>`).join('')}</div>` : '';
    let body;
    if (this.status !== 'ready') body = loading;
    else if (!data.summary.recipes) body = '<div class="rc-state"><h2>食谱库还是空的</h2><p>导入食谱后，就可以在这里查看了。</p></div>';
    else if (!data.recipes.length) body = `<div class="rc-state"><h2>${data.total ? '这一页没有食谱' : '没有找到符合条件的食谱'}</h2><p>试试其他菜名、配料或分类。</p><button class="rc-button" type="button" data-recipe-clear>查看全部食谱</button></div>`;
    else body = `<div class="rc-result-count" role="status">${route.q || route.category ? `找到 ${data.total} 道食谱` : `共 ${data.total} 道食谱`}</div><div class="rc-grid">${data.recipes.map(r => `<button type="button" class="rc-card" data-recipe-open="${r.id}" aria-label="查看食谱：${e(r.title)}"><span class="rc-card-image">${r.image_url ? `<img src="${e(r.image_url)}" alt="${e(r.title)}" loading="lazy" width="640" height="480">` : '<span class="rc-no-image"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M3 4c4-1 6 0 9 2 3-2 5-3 9-2v16c-4-1-6 0-9 1-3-1-5-2-9-1V4Z"/><path d="M12 6v15"/></svg><span>原书未配图</span></span>'}</span><span class="rc-card-body"><span class="rc-card-category">${e(r.category)}</span><strong>${e(r.title)}</strong><span class="rc-card-meta">${e(r.servings || '份量见原文')}<span>${r.ingredient_count} 项配料</span></span></span></button>`).join('')}</div><nav class="rc-pagination" aria-label="食谱分页"><button class="rc-button rc-secondary" type="button" data-recipe-page="${data.page - 1}" ${data.page <= 1 ? 'disabled' : ''}>上一页</button><span>第 ${data.page} / ${Math.ceil(data.total / data.page_size)} 页</span><button class="rc-button rc-secondary" type="button" data-recipe-page="${data.page + 1}" ${data.page * data.page_size >= data.total ? 'disabled' : ''}>下一页</button></nav>`;
    return `<section class="recipe-library">${title}${search}${categories}${body}</section>`;
  }
  detail() {
    const r = this.recipe, e = value => this.escape(value);
    let previousGroup = null;
    const ingredients = r.ingredients.map(i => {
      const group = i.group_name && i.group_name !== previousGroup ? `<li class="rc-ingredient-group">${e(i.group_name)}</li>` : '';
      previousGroup = i.group_name;
      return `${group}<li>${e(i.original_text)}</li>`;
    }).join('');
    return `<article data-share-scope="recipe" class="rc-detail"><header class="rc-detail-heading">${HealthShare.button({ title: r.title, context: '食谱 · ' + r.source_author })}<span class="rc-card-category">${e(r.category)}</span><h1>${e(r.title)}</h1><p>${e(r.servings || '份量见原文')}<span>·</span>${r.ingredients.length} 项配料<span>·</span>${r.steps.length} 个步骤</p><small>${e(r.source_author)} · ${e(r.source_title)} · PDF 第 ${r.source_page}${r.source_page_end !== r.source_page ? `–${r.source_page_end}` : ''} 页</small></header>${r.images.length ? `<figure class="rc-hero"><img src="/api/recipes/${r.id}/images/0" alt="${e(r.title)}，原书配图" width="${r.images[0].width}" height="${r.images[0].height}"><figcaption>原书配图 · PDF 第 ${r.images[0].source_page} 页</figcaption></figure>` : ''}${r.description ? `<details class="rc-author"><summary>作者的话</summary><p>${e(r.description)}</p></details>` : ''}<div class="rc-cooking"><aside class="rc-ingredients"><h2>准备配料 <small>${r.ingredients.length} 项</small></h2><ul>${ingredients}</ul></aside><section class="rc-steps"><h2>开始制作</h2><ol>${r.steps.map(s => `<li><p>${e(s)}</p></li>`).join('')}</ol>${r.notes ? `<div class="rc-notes"><h2>小贴士与补充</h2><p>${e(r.notes)}</p></div>` : ''}</section></div>${r.images.length > 1 ? `<section class="rc-gallery"><h2>更多原书配图</h2>${r.images.slice(1).map((img, i) => `<figure><img src="/api/recipes/${r.id}/images/${i + 1}" alt="${e(r.title)}的补充配图" loading="lazy" width="${img.width}" height="${img.height}"><figcaption>PDF 第 ${img.source_page} 页</figcaption></figure>`).join('')}</section>` : ''}<details class="rc-original"><summary>查看提取原文</summary><p>保留 PDF 原文与单位，方便核对；书中“此页”等交叉引用仍沿用原文。</p><pre>${e(r.original_text)}</pre></details></article>`;
  }
}
