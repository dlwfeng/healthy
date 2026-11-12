class HealthMemory {
  constructor({ onChange, escapeHtml }) {
    this.onChange = onChange;
    this.escape = escapeHtml;
    this.entries = [];
    this.loading = false;
    this.error = false;
  }
  async load() {
    if (this.loading) return;
    this.loading = true;
    this.error = false;
    this.onChange();
    try {
      const response = await fetch('/api/memory', { cache: 'no-store' });
      if (!response.ok) throw Error();
      this.entries = (await response.json()).entries;
    } catch { this.error = true; }
    finally { this.loading = false; this.onChange(); }
  }
  render() {
    const e = this.escape;
    let body;
    if (this.loading) body = '<p role="status" class="memory-state">正在读取记忆…</p>';
    else if (this.error) body = '<div role="alert" class="memory-state"><p>暂时无法读取记忆。</p><button class="primary-btn" type="button" data-memory-refresh>重试</button></div>';
    else if (!this.entries.length) body = '<div class="memory-state"><h2>还没有保存的记忆</h2><p>聊天时，健康助手会逐渐记住你明确提到的生活习惯和偏好。</p></div>';
    else body = '<ol class="memory-list">' + this.entries.map(entry => `<li><div class="memory-meta"><span>${e({ profile: '关于我', memory: '日常记忆', learning: '经验与纠正' }[entry.kind] || '日常记忆')}</span><time>${e(entry.created_at || '')}</time></div><p>${e(entry.content)}</p></li>`).join('') + '</ol>';
    return `<section class="memory-page" aria-labelledby="memory-title"><header class="memory-heading"><div><h1 id="memory-title">记忆</h1><p>健康助手记住的生活习惯、偏好和个人资料。需要修改或忘记某件事，直接在聊天中告诉它。</p></div><button type="button" class="secondary-btn" data-memory-refresh ${this.loading ? 'disabled' : ''}>刷新</button></header>${!this.loading && !this.error && this.entries.length ? `<p class="memory-count">共 ${this.entries.length} 条</p>` : ''}${body}</section>`;
  }
}
