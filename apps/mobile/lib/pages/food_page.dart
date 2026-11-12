import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../garmin_api.dart';
import '../widgets/data_page.dart';
import '../widgets/document_reader.dart';

class RecipesPage extends StatefulWidget {
  const RecipesPage({super.key, required this.api});
  final GarminApi api;
  @override
  State<RecipesPage> createState() => _RecipesPageState();
}

class _RecipesPageState extends State<RecipesPage> {
  final search = TextEditingController();
  Timer? debounce;
  String category = '', query = '';
  int page = 1, total = 0, request = 0;
  bool loading = true;
  String? error;
  List<Map<String, dynamic>> recipes = [], categories = [];
  @override
  void initState() {
    super.initState();
    unawaited(load());
  }

  @override
  void dispose() {
    debounce?.cancel();
    search.dispose();
    super.dispose();
  }

  Future<void> load({bool more = false}) async {
    final token = ++request;
    setState(() {
      loading = true;
      error = null;
    });
    final nextPage = more ? page + 1 : 1;
    try {
      final data = await widget.api.get('/api/recipes', {
        'q': query,
        'category': category,
        'page': '$nextPage',
      });
      if (mounted && token == request) {
        setState(() {
          recipes = [if (more) ...recipes, ...rows(data['recipes'])];
          categories = rows(data['categories']);
          total = data['total'] as int;
          page = nextPage;
          loading = false;
        });
      }
    } catch (e) {
      if (mounted && token == request) {
        setState(() {
          error = errorText(e);
          loading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => Column(
    children: [
      Padding(
        padding: const EdgeInsets.all(12),
        child: TextField(
          controller: search,
          maxLength: 100,
          decoration: const InputDecoration(
            labelText: '搜索菜名或食材',
            prefixIcon: Icon(Icons.search),
            counterText: '',
          ),
          onChanged: (v) {
            query = v.trim();
            debounce?.cancel();
            ++request;
            debounce = Timer(const Duration(milliseconds: 350), () => load());
          },
        ),
      ),
      SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        child: Row(
          children:
              [
                    {'category': ''},
                    ...categories,
                  ]
                  .map(
                    (c) => Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        label: Text(
                          c['category'] == '' ? '全部' : '${c['category']}',
                        ),
                        selected: category == c['category'],
                        onSelected: (_) {
                          debounce?.cancel();
                          setState(() {
                            category = '${c['category']}';
                          });
                          unawaited(load());
                        },
                      ),
                    ),
                  )
                  .toList(),
        ),
      ),
      Expanded(
        child: DataBody(
          loading: loading,
          error: error,
          onRefresh: load,
          children: [
            Text('食谱资料库 · $total 道匹配结果\n可按食材检索，尚未提供个性化推荐。'),
            if (recipes.isEmpty) const ListTile(title: Text('没有找到匹配的食谱')),
            ...recipes.map(
              (r) => Card.outlined(
                child: ListTile(
                  leading: r['image_url'] == null
                      ? const Icon(Icons.restaurant_menu)
                      : ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: Image.network(
                            '${widget.api.baseUrl}${r['image_url']}',
                            width: 64,
                            height: 64,
                            fit: BoxFit.cover,
                            errorBuilder: (_, e, s) =>
                                const Icon(Icons.broken_image_outlined),
                          ),
                        ),
                  title: Text('${r['title']}'),
                  subtitle: Text(
                    '${r['category']} · ${r['servings'] ?? '份量未标注'}',
                  ),
                  onTap: () => Navigator.push(
                    context,
                    MaterialPageRoute<void>(
                      builder: (_) =>
                          RecipeDetail(api: widget.api, id: '${r['id']}'),
                    ),
                  ),
                ),
              ),
            ),
            if (recipes.length < total)
              TextButton(
                onPressed: () => load(more: true),
                child: const Text('加载更多'),
              ),
          ],
        ),
      ),
    ],
  );
}

class RecipeDetail extends StatefulWidget {
  const RecipeDetail({super.key, required this.api, required this.id});
  final GarminApi api;
  final String id;
  @override
  State<RecipeDetail> createState() => _RecipeDetailState();
}

class _RecipeDetailState extends State<RecipeDetail> {
  bool loading = true;
  String? error;
  Map<String, dynamic>? recipe;
  @override
  void initState() {
    super.initState();
    unawaited(load());
  }

  Future<void> load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final data = await widget.api.get('/api/recipes/${widget.id}');
      if (mounted) {
        setState(() {
          recipe = Map<String, dynamic>.from(data['recipe']);
          loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          error = errorText(e);
          loading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final r = recipe ?? {};
    return Scaffold(
      appBar: AppBar(title: Text('${r['title'] ?? '食谱详情'}')),
      body: DataBody(
        loading: loading,
        error: error,
        onRefresh: load,
        children: [
          if (r['image_url'] != null)
            Image.network(
              '${widget.api.baseUrl}${r['image_url']}',
              fit: BoxFit.contain,
              errorBuilder: (_, e, s) =>
                  const ListTile(title: Text('图片暂时无法加载')),
            ),
          Text('${r['category'] ?? ''} · ${r['servings'] ?? '份量未标注'}'),
          if (r['description'] != null) Text('${r['description']}'),
          const SizedBox(height: 16),
          Text('配料', style: Theme.of(context).textTheme.titleLarge),
          ...rows(r['ingredients']).map(
            (i) => ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text('${i['original_text'] ?? i['name'] ?? ''}'),
              subtitle: i['group_name'] == null
                  ? null
                  : Text('${i['group_name']}'),
            ),
          ),
          Text('制作步骤', style: Theme.of(context).textTheme.titleLarge),
          if (r['steps'] is List)
            ...(r['steps'] as List).asMap().entries.map(
              (e) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Text('${e.key + 1}. ${e.value}'),
              ),
            )
          else
            Text('${r['steps'] ?? '暂无结构化步骤，请查看原文。'}'),
          if (r['notes'] != null) Text('${r['notes']}'),
          ExpansionTile(
            title: const Text('食谱原文'),
            children: [SelectableText('${r['original_text'] ?? ''}')],
          ),
          Text(
            '来源：${r['source_title'] ?? ''} · ${r['source_author'] ?? ''} · 第 ${r['source_page'] ?? ''} 页',
          ),
        ],
      ),
    );
  }
}

class GuidelinesPage extends StatefulWidget {
  const GuidelinesPage({super.key});
  @override
  State<GuidelinesPage> createState() => _GuidelinesPageState();
}

class _GuidelinesPageState extends State<GuidelinesPage> {
  int index = 0;
  String text = '';
  String? error;
  int request = 0;
  @override
  void initState() {
    super.initState();
    unawaited(load());
  }

  Future<void> load() async {
    final token = ++request;
    setState(() {
      text = '';
      error = null;
    });
    try {
      final result = await rootBundle.loadString(
        'assets/references/${index == 0 ? 'chinese-dietary-guidelines-2022-core-recommendations.md' : 'WS-T-578.1-2017-macronutrients.md'}',
      );
      if (mounted && token == request) {
        setState(() {
          text = result;
        });
      }
    } catch (e) {
      if (mounted && token == request) {
        setState(() {
          error = '资料加载失败';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => Column(
    children: [
      Padding(
        padding: const EdgeInsets.all(12),
        child: SegmentedButton<int>(
          segments: const [
            ButtonSegment(value: 0, label: Text('膳食指南')),
            ButtonSegment(value: 1, label: Text('宏量营养素')),
          ],
          selected: {index},
          onSelectionChanged: (s) {
            setState(() {
              index = s.first;
            });
            unawaited(load());
          },
        ),
      ),
      Expanded(
        child: DataBody(
          loading: text.isEmpty && error == null,
          error: error,
          onRefresh: load,
          children: [MarkdownDocument(text)],
        ),
      ),
    ],
  );
}
