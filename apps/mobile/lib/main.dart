import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:http/http.dart' as http;
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'widgets/pi_icon.dart';
import 'widgets/healthy_brand.dart';
import 'widgets/pi_process.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'meal_api.dart';
import 'garmin_api.dart';
import 'main_shell.dart';
import 'app_theme.dart';
import 'widgets/nutrition_widgets.dart';
import 'widgets/meal_entry_widget.dart';
import 'widgets/photo_viewer.dart';
import 'widgets/meal_energy.dart';
import 'widgets/day_timeline_widgets.dart';
import 'widgets/journal_overview.dart';

void main() => runApp(ZhixuApp());
const leaf = Color(0xFF326B54);
const bg = Color(0xFFF4F8F4), muted = Color(0xFF74877A);
const nutrientKeys = ['calories', 'protein_g', 'carbs_g', 'fat_g'];
const nutrientLabels = ['热量 kcal', '蛋白质 g', '碳水 g', '脂肪 g'];
const kinds = ['早餐', '午餐', '晚餐', '加餐'];
String message(Object e) => e.toString().replaceFirst('Exception: ', '');

Future<Uint8List?> selectPhoto(ImageSource source) async {
  final file = await ImagePicker().pickImage(
    source: source,
    maxWidth: 1600,
    maxHeight: 1600,
    imageQuality: 85,
    requestFullMetadata: false,
  );
  if (file == null) return null;
  final bytes = await file.readAsBytes();
  if (bytes.length > 5 * 1024 * 1024) throw Exception('照片不能超过 5 MB。');
  return bytes;
}

Future<List<Uint8List>> selectPhotos({
  ImageSource source = ImageSource.gallery,
}) async {
  if (source == ImageSource.camera) {
    final photo = await selectPhoto(ImageSource.camera);
    return photo == null ? [] : [photo];
  }
  try {
    final files = await ImagePicker().pickMultiImage(
      maxWidth: 1600,
      maxHeight: 1600,
      imageQuality: 85,
      requestFullMetadata: false,
    );
    if (files.isNotEmpty) {
      final results = <Uint8List>[];
      for (final file in files) {
        final bytes = await file.readAsBytes();
        if (bytes.length <= 5 * 1024 * 1024) {
          results.add(bytes);
        }
      }
      if (results.isNotEmpty) return results;
    }
  } catch (_) {}
  final single = await selectPhoto(ImageSource.gallery);
  return single == null ? [] : [single];
}

class ZhixuApp extends StatelessWidget {
  const ZhixuApp({
    super.key,
    this.api,
    this.garminApi,
    this.storage,
    this.initialIndex,
  });

  final MealApi? api;
  final GarminApi? garminApi;
  final MealLocalStore? storage;
  final int? initialIndex;

  @override
  Widget build(BuildContext context) {
    final effectiveApi = api ?? MealApi();
    final effectiveGarmin =
        garminApi ??
        GarminApi(baseUrl: effectiveApi.baseUrl, client: effectiveApi.client);
    final effectiveStorage = storage ?? MealLocalStore();

    return ThemeHost(
      storage: effectiveStorage,
      builder: (mode) => MaterialApp(
        title: healthyAppName,
        debugShowCheckedModeBanner: false,
        theme: healthTheme(Brightness.light),
        darkTheme: healthTheme(Brightness.dark),
        themeMode: mode,
        home: garminApi == null && api != null && initialIndex == null
            ? Journal(api: effectiveApi, storage: effectiveStorage)
            : MainShell(
                api: effectiveApi,
                garminApi: effectiveGarmin,
                storage: effectiveStorage,
                initialIndex: initialIndex ?? 0,
              ),
      ),
    );
  }
}

class Journal extends StatefulWidget {
  const Journal({
    super.key,
    required this.api,
    required this.storage,
    this.onRecord,
  });
  final VoidCallback? onRecord;
  final MealApi api;
  final MealLocalStore storage;
  @override
  State<Journal> createState() => _JournalState();
}

class _JournalState extends State<Journal> {
  late DateTime currentMonth;
  String date = dateText(shanghaiNow());
  List<Map<String, dynamic>> meals = [];
  List<Map<String, dynamic>> trendMeals = [];
  List<String> trendDays = [];
  Map<String, dynamic>? profile;
  String? activeMetricKey;
  Map<String, num> energyPoints = {};
  bool energyLoading = false, energyFailed = false;
  int energyRequest = 0;
  bool loading = true;
  String? error;
  int request = 0;

  DateTime get thisMonth {
    final now = shanghaiNow();
    return DateTime(now.year, now.month, 1);
  }

  @override
  void initState() {
    super.initState();
    final now = shanghaiNow();
    currentMonth = DateTime(now.year, now.month, 1);
    unawaited(initialize());
  }

  Future<void> initialize() async {
    try {
      widget.api.baseUrl = await loadServer(widget.storage);
      await widget.storage.clear('draft');
    } catch (_) {
      /* A missing settings file must not stop server-backed records. */
    }
    await load();
  }

  void shiftMonth(int delta) {
    final next = DateTime(currentMonth.year, currentMonth.month + delta, 1);
    if (next.isAfter(thisMonth)) return;
    setState(() {
      currentMonth = next;
    });
    unawaited(load());
  }

  void goToCurrentMonth() {
    setState(() {
      currentMonth = thisMonth;
    });
    unawaited(load());
  }

  Future<void> load() async {
    if (!mounted) return;
    final current = ++request;
    ++energyRequest;
    setState(() {
      energyPoints = {};
      energyLoading = false;
      energyFailed = false;
      loading = true;
      error = null;
    });

    final year = currentMonth.year;
    final month = currentMonth.month;
    final monthStart = '$year-${month.toString().padLeft(2, '0')}-01';
    final lastDay = DateTime.utc(year, month + 1, 0).day;
    final monthEnd =
        '$year-${month.toString().padLeft(2, '0')}-${lastDay.toString().padLeft(2, '0')}';

    final now = shanghaiNow();
    final todayStr = dateText(now);
    final trendEnd = (monthEnd.compareTo(todayStr) < 0) ? monthEnd : todayStr;
    final trendEndDate = DateTime.tryParse(trendEnd) ?? now;
    final weekDays = List.generate(7, (i) {
      final d = trendEndDate.subtract(Duration(days: 6 - i));
      return dateText(d);
    });

    try {
      if (profile == null) {
        try {
          profile = await widget.api.fetchProfile();
        } catch (_) {}
      }

      List<Map<String, dynamic>> monthResult = [];
      try {
        monthResult = await widget.api.listRange(monthStart, monthEnd);
      } catch (_) {
        // Fallback to single-date list for mock tests
        monthResult = await widget.api.list(date);
      }

      List<Map<String, dynamic>> weekResult = [];
      if (weekDays.first.compareTo(monthStart) >= 0 &&
          weekDays.last.compareTo(monthEnd) <= 0) {
        weekResult = monthResult
            .where((m) => weekDays.contains(m['date']))
            .toList();
      } else {
        try {
          weekResult = await widget.api.listRange(
            weekDays.first,
            weekDays.last,
          );
        } catch (_) {
          weekResult = monthResult;
        }
      }

      if (!mounted || request != current) return;
      setState(() {
        meals = monthResult;
        trendMeals = weekResult;
        trendDays = weekDays;
        loading = false;
      });
      unawaited(loadEnergy(weekDays.last));
    } catch (e) {
      if (mounted && request == current) {
        setState(() {
          error = message(e);
          loading = false;
        });
      }
    }
  }

  Future<void> loadEnergy(String end) async {
    final token = ++energyRequest;
    setState(() {
      energyLoading = true;
      energyFailed = false;
      energyPoints = {};
    });
    try {
      final dates =
          meals.map((meal) => meal['date']).whereType<String>().toList()
            ..sort();
      final ends = [end];
      if (dates.isNotEmpty &&
          DateTime.parse(end).difference(DateTime.parse(dates.first)).inDays >=
              30) {
        ends.add(dates.first);
      }
      final responses = await Future.wait(
        ends.asMap().entries.map((entry) async {
          try {
            final data = await widget.api.request(
              'GET',
              '/api/health/history?metric=calories&date=${entry.value}&days=${entry.key == 0 ? 30 : 7}',
            );
            if (data['points'] is! List) throw const FormatException();
            return data['points'] as List;
          } catch (_) {
            return null;
          }
        }),
      );
      final points = <String, num>{};
      for (final data in responses.whereType<List>()) {
        for (final point in data) {
          if (point['date'] is String && point['value'] is num) {
            points[point['date'] as String] = point['value'] as num;
          }
        }
      }
      if (!mounted || token != energyRequest) return;
      setState(() {
        energyPoints = points;
        energyLoading = false;
        energyFailed = responses.any((result) => result == null);
      });
    } catch (_) {
      if (!mounted || token != energyRequest) return;
      setState(() {
        energyLoading = false;
        energyFailed = true;
      });
    }
  }

  Future<void> openMeal(Map<String, dynamic> initial) async {
    var meal = initial;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (detailContext) => StatefulBuilder(
          builder: (context, updateDetail) => Scaffold(
            appBar: AppBar(title: const Text('餐食详情')),
            body: SafeArea(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
                children: [
                  Text(
                    '${meal['date']} · ${meal['kind']} ${meal['time']}',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                  const SizedBox(height: 12),
                  MealEntryWidget(
                    meal: meal,
                    baseUrl: widget.api.baseUrl,
                    profile: profile,
                    detail: true,
                    onEdit: () async {
                      await edit(meal);
                      if (!detailContext.mounted || !mounted) return;
                      final updated = meals
                          .where((m) => m['id'] == meal['id'])
                          .firstOrNull;
                      if (updated != null) updateDetail(() => meal = updated);
                    },
                    onDelete: () async {
                      if (await remove(meal) && detailContext.mounted) {
                        Navigator.of(detailContext).pop();
                      }
                    },
                    onShowSources:
                        (meal['analysis']?['sources'] as List? ?? []).isNotEmpty
                        ? () => showMealSources(meal)
                        : null,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> add() async {
    final choice = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const PiIcon(),
              title: const Text('用健康助手记餐'),
              onTap: () => Navigator.pop(ctx, 'chat'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(ctx, 'manual'),
              child: Text('手动记录'),
            ),
            SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (choice == null || !mounted) return;
    if (choice == 'manual') {
      await edit(null);
      return;
    }
    if (widget.onRecord != null) {
      widget.onRecord!();
      return;
    }
    Uint8List? photo;
    if (choice == 'camera' || choice == 'gallery') {
      try {
        photo = await selectPhoto(
          choice == 'camera' ? ImageSource.camera : ImageSource.gallery,
        );
      } catch (e) {
        if (mounted) notify(message(e));
        return;
      }
      if (photo == null) return;
    }
    if (!mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => MealChatRecorder(
          api: widget.api,
          selectedDate: date,
          initialPhoto: photo,
          initialRecording: true,
        ),
      ),
    );
    if (mounted) await load();
  }

  Future<void> edit(
    Map<String, dynamic>? meal, {
    Uint8List? initialPhoto,
  }) async {
    if (!mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => MealEditor(
          api: widget.api,
          initial: meal,
          initialPhoto: initialPhoto,
          selectedDate: meal?['date'] as String? ?? date,
        ),
      ),
    );
    if (!mounted) return;
    await load();
  }

  void notify(String text) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));

  Future<bool> remove(Map<String, dynamic> meal) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('删除这餐记录？'),
        content: Text('餐食、营养和关联照片会一起删除。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text('删除'),
          ),
        ],
      ),
    );
    if (yes != true) return false;
    try {
      await widget.api.remove(meal);
      await load();
      return true;
    } catch (e) {
      if (mounted) notify(message(e));
      return false;
    }
  }

  void showMealSources(Map<String, dynamic> meal) {
    final sources = (meal['analysis']?['sources'] as List? ?? [])
        .cast<Map<String, dynamic>>();
    if (sources.isEmpty) return;

    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: EdgeInsets.fromLTRB(20, 0, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '联网参考来源',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
              SizedBox(height: 12),
              ...sources.map(
                (s) => Padding(
                  padding: EdgeInsets.only(bottom: 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        s['title'] as String? ?? '',
                        style: TextStyle(fontWeight: FontWeight.w600),
                      ),
                      Text(
                        s['url'] as String? ?? '',
                        style: TextStyle(fontSize: 12, color: muted),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Map<String, List<Map<String, dynamic>>> groupMealsByDay(
    List<Map<String, dynamic>> list,
  ) {
    final map = <String, List<Map<String, dynamic>>>{};
    for (final meal in list) {
      final d = meal['date'] as String? ?? date;
      map.putIfAbsent(d, () => []).add(meal);
    }
    for (final key in map.keys) {
      map[key]!.sort((a, b) {
        final tA = a['time'] as String? ?? '';
        final tB = b['time'] as String? ?? '';
        return tB.compareTo(tA);
      });
    }
    return map;
  }

  @override
  Widget build(BuildContext context) {
    final dayGroups = groupMealsByDay(meals);
    final sortedDates = dayGroups.keys.toList()..sort((a, b) => b.compareTo(a));
    final trendGroup = groupMealsByDay(trendMeals);
    final today = dateText(shanghaiNow());
    final overviewDate = currentMonth == thisMonth
        ? today
        : (sortedDates.firstOrNull ??
              dateText(DateTime(currentMonth.year, currentMonth.month + 1, 0)));

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        title: Text('饮食记录'),
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        actions: [
          IconButton(
            onPressed: () => showReferenceGuideDialog(context, profile),
            tooltip: '参考依据',
            icon: Icon(Icons.info_outline),
          ),
          IconButton(
            onPressed: loading ? null : load,
            tooltip: '刷新记录',
            icon: Icon(Icons.refresh),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: add,
        tooltip: '添加餐食',
        icon: const Icon(Icons.add),
        label: const Text('记一餐'),
      ),
      body: RefreshIndicator(
        onRefresh: load,
        child: ListView(
          padding: EdgeInsets.fromLTRB(16, 12, 16, 100),
          children: [
            if (!loading && error == null)
              JournalOverview(
                date: overviewDate,
                today: today,
                meals: dayGroups[overviewDate] ?? [],
                profile: profile,
                expenditure: energyPoints[overviewDate],
              ),
            const SizedBox(height: 12),
            Material(
              color: Theme.of(context).colorScheme.surface,
              borderRadius: BorderRadius.circular(20),
              clipBehavior: Clip.antiAlias,
              child: ExpansionTile(
                shape: const Border(),
                collapsedShape: const Border(),
                leading: Icon(
                  Icons.insights_rounded,
                  color: Theme.of(context).colorScheme.primary,
                ),
                title: const Text(
                  '饮食趋势',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                ),
                subtitle: const Text(
                  '近 7 天 · 热量平衡与营养摄入',
                  style: TextStyle(fontSize: 12),
                ),
                childrenPadding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
                children: [
                  MealEnergyChart(
                    days: trendDays
                        .map(
                          (day) => MealEnergyDay(
                            day,
                            trendGroup[day] ?? [],
                            energyPoints[day],
                          ),
                        )
                        .toList(),
                    today: dateText(shanghaiNow()),
                    loading: energyLoading,
                    failed: energyFailed,
                    onRetry: () => loadEnergy(trendDays.last),
                  ),
                  // Nutrient trends share the same disclosure as energy balance.
                  TrendChartWidget(
                    days: trendDays.isNotEmpty
                        ? trendDays
                        : List.generate(
                            7,
                            (i) => dateText(
                              shanghaiNow().subtract(Duration(days: 6 - i)),
                            ),
                          ),
                    dayEntries: trendGroup,
                    profile: profile,
                    activeMetricKey: activeMetricKey,
                    onSelectMetric: (key) =>
                        setState(() => activeMetricKey = key),
                  ),
                  SizedBox(height: 10),
                ],
              ),
            ),
            const SizedBox(height: 24),
            Text(
              '餐食记录',
              style: Theme.of(
                context,
              ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            // 月份切换工具栏与图例
            MonthToolbarWidget(
              currentMonth: currentMonth,
              onPreviousMonth: () => shiftMonth(-1),
              onNextMonth: () => shiftMonth(1),
              onToday: goToCurrentMonth,
              canGoNext: currentMonth.isBefore(thisMonth),
              isCurrentMonth:
                  currentMonth.year == thisMonth.year &&
                  currentMonth.month == thisMonth.month,
            ),

            if (loading)
              Padding(
                padding: EdgeInsets.all(40),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (error != null)
              Padding(
                padding: EdgeInsets.symmetric(vertical: 40),
                child: Column(
                  children: [
                    Text(error!, style: TextStyle(color: Colors.red)),
                    SizedBox(height: 8),
                    TextButton(onPressed: load, child: Text('重新读取')),
                  ],
                ),
              )
            else if (meals.isEmpty)
              Container(
                margin: EdgeInsets.only(top: 16),
                padding: EdgeInsets.symmetric(vertical: 36, horizontal: 20),
                decoration: BoxDecoration(
                  color: adaptiveColor(context, Colors.white),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                    color: adaptiveColor(context, Color(0xFFE2EBE5)),
                  ),
                ),
                child: Column(
                  children: [
                    Icon(
                      Icons.restaurant_outlined,
                      size: 38,
                      color: adaptiveColor(context, leaf),
                    ),
                    SizedBox(height: 14),
                    Text(
                      '这个月还没有餐食记录',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: adaptiveColor(context, Colors.black87),
                      ),
                    ),
                    SizedBox(height: 6),
                    Text(
                      '记下第一餐，从了解自己的饮食开始',
                      style: TextStyle(color: muted, fontSize: 13),
                    ),
                  ],
                ),
              )
            else
              ...sortedDates.expand((dayStr) {
                final dayMeals = dayGroups[dayStr] ?? [];
                return [
                  DaySummaryHeader(
                    dateStr: dayStr,
                    expenditure: energyPoints[dayStr],
                    meals: dayMeals,
                    profile: profile,
                  ),
                  ...dayMeals.map(
                    (m) => MealEntryWidget(
                      meal: m,
                      baseUrl: widget.api.baseUrl,
                      profile: profile,
                      onOpen: () => openMeal(m),
                      onEdit: () => edit(m),
                      onDelete: () => remove(m),
                      onShowSources:
                          (m['analysis']?['sources'] as List? ?? []).isNotEmpty
                          ? () => showMealSources(m)
                          : null,
                    ),
                  ),
                ];
              }),
          ],
        ),
      ),
    );
  }
}

class ItemFields {
  ItemFields([Map<String, dynamic>? value])
    : fields = [
        TextEditingController(text: value?['name'] as String? ?? ''),
        TextEditingController(text: value?['portion'] as String? ?? ''),
        ...nutrientKeys.map(
          (k) => TextEditingController(text: value?[k]?.toString() ?? ''),
        ),
      ];
  final List<TextEditingController> fields;
  Map<String, dynamic> value() {
    final result = <String, dynamic>{
      'name': fields[0].text.trim(),
      'portion': fields[1].text.trim(),
    };
    if ((result['name'] as String).isEmpty) {
      throw Exception('请为每项食物填写名称，或移除空白项。');
    }
    for (int i = 0; i < 4; i++) {
      final text = fields[i + 2].text.trim(),
          number = double.tryParse(fields[i + 2].text.trim());
      if (text.isNotEmpty &&
          (number == null ||
              !number.isFinite ||
              number < 0 ||
              number > (i == 0 ? 20000 : 3000))) {
        throw Exception('营养数值无效，请填写非负数字或留空。');
      }
      result[nutrientKeys[i]] = text.isEmpty ? null : number;
    }
    return result;
  }

  void dispose() {
    for (final f in fields) {
      f.dispose();
    }
  }
}

class MealEditor extends StatefulWidget {
  const MealEditor({
    super.key,
    required this.api,
    required this.selectedDate,
    this.initial,
    this.initialPhoto,
  });
  final MealApi api;
  final String selectedDate;
  final Map<String, dynamic>? initial;
  final Uint8List? initialPhoto;
  @override
  State<MealEditor> createState() => _MealEditorState();
}

class _MealEditorState extends State<MealEditor> {
  final name = TextEditingController(),
      note = TextEditingController(),
      hint = TextEditingController();
  final items = <ItemFields>[];
  final localPhotos = <Uint8List>[];
  final remotePhotos = <String>[];
  late String id, date, time, kind;
  bool editing = false, busy = false, recognizing = false;
  bool confirmed = false, removePhoto = false;
  String? error, photoError;
  Map<String, dynamic>? analysis;
  int? version;

  Uint8List? get photo => localPhotos.isNotEmpty ? localPhotos.first : null;
  String? get remotePhoto =>
      remotePhotos.isNotEmpty ? remotePhotos.first : null;

  @override
  void initState() {
    super.initState();
    final value = widget.initial;
    editing = value != null;
    id = value?['id'] as String? ?? newMealId();
    version = value?['version'] as int?;
    date = value?['date'] as String? ?? widget.selectedDate;
    final now = shanghaiNow();
    time =
        value?['time'] as String? ??
        '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}';
    kind = value?['kind'] as String? ?? '午餐';
    name.text = value?['name'] as String? ?? '';
    note.text = value?['note'] as String? ?? '';
    analysis = value?['analysis'] as Map<String, dynamic>?;
    confirmed = value?['nutrition_confirmed'] as bool? ?? editing;
    final initialUrls = (value?['photo_urls'] as List? ?? [])
        .cast<String>()
        .toList();
    if (initialUrls.isNotEmpty) {
      remotePhotos.addAll(initialUrls);
    } else if (value?['photo_url'] != null) {
      remotePhotos.add(value!['photo_url'] as String);
    }
    if (widget.initialPhoto != null) {
      localPhotos.add(widget.initialPhoto!);
    }
    for (final item in value?['items'] as List? ?? []) {
      items.add(ItemFields(Map<String, dynamic>.from(item as Map)));
    }
    name.addListener(changed);
    note.addListener(changed);
    hint.addListener(changed);
    for (final item in items) {
      listen(item);
    }
  }

  void listen(ItemFields item) {
    for (final f in item.fields) {
      f.addListener(changed);
    }
  }

  void changed() {
    if (analysis != null && confirmed) setState(() => confirmed = false);
  }

  Map<String, dynamic> body() {
    final photoList = <Map<String, dynamic>>[];
    for (final url in remotePhotos) {
      photoList.add({'url': url});
    }
    for (final bytes in localPhotos) {
      photoList.add({'data_base64': base64Encode(bytes)});
    }
    return {
      'id': id,
      if (editing) 'version': version,
      'date': date,
      'time': time,
      'kind': kind,
      'name': name.text.trim(),
      'note': note.text.trim(),
      'items': items.map((i) => i.value()).toList(),
      'nutrition_source': analysis == null ? 'manual' : 'model_estimate',
      'analysis': analysis,
      'nutrition_confirmed': confirmed,
      if (photoList.isNotEmpty) ...{
        'photos': photoList,
        'photo': photoList.first,
      } else if (removePhoto || !editing) ...{
        'photos': [],
        'photo': null,
      },
    };
  }

  @override
  void dispose() {
    name.dispose();
    note.dispose();
    hint.dispose();
    for (final item in items) {
      item.dispose();
    }
    super.dispose();
  }

  Future<void> pick(ImageSource source) async {
    try {
      final list = await selectPhotos(source: source);
      if (list.isEmpty || !mounted) return;
      setState(() {
        localPhotos.addAll(list);
        if (localPhotos.length + remotePhotos.length > 9) {
          localPhotos.removeRange(
            (9 - remotePhotos.length).clamp(0, localPhotos.length),
            localPhotos.length,
          );
        }
        removePhoto = false;
        analysis = null;
        confirmed = false;
        photoError = null;
      });
    } catch (e) {
      if (mounted) setState(() => photoError = message(e));
    }
  }

  Future<void> recognize() async {
    final totalCount = localPhotos.length + remotePhotos.length;
    if (totalCount == 0) return;
    setState(() {
      busy = true;
      recognizing = true;
      photoError = null;
    });
    try {
      final hintParts = [
        hint.text.trim(),
        name.text.trim(),
        note.text.trim(),
      ].where((s) => s.isNotEmpty).toSet().toList();
      final hintText = hintParts.join('\n');
      final photosPayload = <Map<String, dynamic>>[];
      for (final url in remotePhotos) {
        photosPayload.add({'url': url});
      }
      for (final p in localPhotos) {
        photosPayload.add({'data_base64': base64Encode(p)});
      }
      final result = await widget.api.analyze(
        photosPayload.length == 1 ? photosPayload.first : photosPayload,
        hintText,
      );
      if (!mounted) return;
      final previousItems = List<ItemFields>.of(items);
      items.clear();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        for (final item in previousItems) {
          item.dispose();
        }
      });
      name.text = result['name'] as String;
      if (note.text.trim().isEmpty && hint.text.trim().isNotEmpty) {
        note.text = hint.text.trim();
      }
      for (final item in result['items'] as List) {
        final fields = ItemFields(Map<String, dynamic>.from(item as Map));
        listen(fields);
        items.add(fields);
      }
      setState(() {
        analysis = result;
        confirmed = false;
      });
    } catch (e) {
      if (mounted) setState(() => photoError = message(e));
    } finally {
      if (mounted) {
        setState(() {
          busy = false;
          recognizing = false;
        });
      }
    }
  }

  Future<void> save() async {
    try {
      if (note.text.trim().isEmpty && hint.text.trim().isNotEmpty) {
        note.text = hint.text.trim();
      }
      if (name.text.trim().isEmpty) throw Exception('请填写餐食名称。');
      if (analysis != null && !confirmed) throw Exception('请核对食物、份量与营养，并勾选确认。');
      final value = body();
      setState(() {
        busy = true;
        error = null;
      });
      await widget.api.save(value, editing);
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        setState(() {
          busy = false;
          error = message(e);
        });
      }
    }
  }

  void leave() {
    if (busy) return;
    Navigator.pop(context);
  }

  void showSources() {
    final sources = (analysis?['sources'] as List? ?? [])
        .cast<Map<String, dynamic>>();
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('联网参考'),
        content: SizedBox(
          width: double.maxFinite,
          child: ListView.separated(
            shrinkWrap: true,
            itemCount: sources.length,
            separatorBuilder: (_, _) => SizedBox(height: 12),
            itemBuilder: (_, index) => Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(sources[index]['title'] as String),
                SelectableText(
                  sources[index]['url'] as String,
                  style: TextStyle(fontSize: 12, color: muted),
                ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: Text('关闭')),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !busy,
    child: Scaffold(
      appBar: AppBar(
        title: Text(editing ? '编辑餐食' : '记录一餐'),
        leading: IconButton(
          onPressed: busy ? null : leave,
          tooltip: '返回',
          icon: Icon(Icons.arrow_back),
        ),
      ),
      bottomNavigationBar: SafeArea(
        minimum: EdgeInsets.fromLTRB(20, 8, 20, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (error != null)
              Padding(
                padding: EdgeInsets.only(bottom: 8),
                child: Text(error!, style: TextStyle(color: Colors.red)),
              ),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: busy ? null : save,
                style: FilledButton.styleFrom(minimumSize: Size.fromHeight(54)),
                child: Text(
                  busy && !recognizing
                      ? '保存中…'
                      : editing
                      ? '保存修改'
                      : '保存记录',
                ),
              ),
            ),
          ],
        ),
      ),
      body: AbsorbPointer(
        absorbing: busy,
        child: ListView(
          padding: EdgeInsets.fromLTRB(20, 12, 20, 24),
          children: [
            if (localPhotos.length + remotePhotos.length > 0) ...[
              SizedBox(
                height: 140,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount:
                      localPhotos.length +
                      remotePhotos.length +
                      (localPhotos.length + remotePhotos.length < 9 ? 1 : 0),
                  separatorBuilder: (_, _) => const SizedBox(width: 10),
                  itemBuilder: (ctx, index) {
                    final total = localPhotos.length + remotePhotos.length;
                    if (index == total) {
                      return InkWell(
                        borderRadius: BorderRadius.circular(12),
                        onTap: () => showModalBottomSheet<void>(
                          context: context,
                          showDragHandle: true,
                          builder: (bctx) => SafeArea(
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                ListTile(
                                  leading: const Icon(
                                    Icons.photo_camera_outlined,
                                  ),
                                  title: const Text('拍照'),
                                  onTap: () {
                                    Navigator.pop(bctx);
                                    pick(ImageSource.camera);
                                  },
                                ),
                                ListTile(
                                  leading: const Icon(
                                    Icons.photo_library_outlined,
                                  ),
                                  title: const Text('从相册选择'),
                                  onTap: () {
                                    Navigator.pop(bctx);
                                    pick(ImageSource.gallery);
                                  },
                                ),
                              ],
                            ),
                          ),
                        ),
                        child: Container(
                          width: 110,
                          height: 140,
                          decoration: BoxDecoration(
                            border: Border.all(
                              color: adaptiveColor(
                                context,
                                leaf,
                              ).withValues(alpha: 0.4),
                            ),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(
                                Icons.add_photo_alternate_outlined,
                                color: adaptiveColor(context, leaf),
                                size: 28,
                              ),
                              const SizedBox(height: 6),
                              Text(
                                '添加照片',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: adaptiveColor(context, leaf),
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    }
                    final isRemote = index < remotePhotos.length;
                    final Widget imgWidget = isRemote
                        ? Image.network(
                            '${widget.api.baseUrl}${remotePhotos[index]}',
                            width: 130,
                            height: 140,
                            fit: BoxFit.cover,
                            errorBuilder: (_, _, _) =>
                                const Center(child: Text('无法加载')),
                          )
                        : Image.memory(
                            localPhotos[index - remotePhotos.length],
                            width: 130,
                            height: 140,
                            fit: BoxFit.cover,
                          );
                    return Stack(
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(12),
                          child: imgWidget,
                        ),
                        if (index == 0)
                          Positioned(
                            top: 6,
                            left: 6,
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 6,
                                vertical: 2,
                              ),
                              decoration: BoxDecoration(
                                color: Colors.black.withValues(alpha: 0.65),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: const Text(
                                '默认展示',
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 10,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                          ),
                        Positioned(
                          top: 4,
                          right: 4,
                          child: GestureDetector(
                            onTap: () => setState(() {
                              if (isRemote) {
                                remotePhotos.removeAt(index);
                              } else {
                                localPhotos.removeAt(
                                  index - remotePhotos.length,
                                );
                              }
                              if (remotePhotos.isEmpty && localPhotos.isEmpty) {
                                removePhoto = true;
                                analysis = null;
                              }
                            }),
                            child: Container(
                              decoration: const BoxDecoration(
                                color: Colors.black54,
                                shape: BoxShape.circle,
                              ),
                              padding: const EdgeInsets.all(4),
                              child: const Icon(
                                Icons.close,
                                size: 14,
                                color: Colors.white,
                              ),
                            ),
                          ),
                        ),
                      ],
                    );
                  },
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  children: [
                    Text(
                      '已选 ${localPhotos.length + remotePhotos.length} 张（列表默认展示第 1 张）',
                      style: TextStyle(
                        fontSize: 12,
                        color: adaptiveColor(context, muted),
                      ),
                    ),
                    const Spacer(),
                    TextButton(
                      onPressed: () => setState(() {
                        remotePhotos.clear();
                        localPhotos.clear();
                        removePhoto = true;
                        analysis = null;
                      }),
                      child: const Text('清空全部'),
                    ),
                  ],
                ),
              ),
            ] else
              Row(
                children: [
                  TextButton.icon(
                    onPressed: () => pick(ImageSource.camera),
                    icon: const Icon(Icons.photo_camera_outlined),
                    label: const Text('拍照'),
                  ),
                  TextButton.icon(
                    onPressed: () => pick(ImageSource.gallery),
                    icon: const Icon(Icons.photo_library_outlined),
                    label: const Text('相册 (支持多选)'),
                  ),
                ],
              ),
            if (localPhotos.length + remotePhotos.length > 0) ...[
              const SizedBox(height: 8),
              TextField(
                controller: hint,
                maxLength: 200,
                decoration: const InputDecoration(
                  labelText: '人工补充描述（可选）',
                  hintText: '如：叮咚买菜敦煌杏皮茶 / 喝了半瓶 / 少油少盐',
                  helperText: '提供品牌、菜名或份量，AI 将以此为准识别与检索',
                  counterText: '',
                  prefixIcon: Icon(Icons.edit_note),
                ),
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: FilledButton.tonalIcon(
                  onPressed: busy ? null : recognize,
                  icon: recognizing
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.auto_awesome_outlined),
                  label: Text(recognizing ? '识别中…' : '识别照片'),
                ),
              ),
            ],
            if (photoError != null)
              Padding(
                padding: EdgeInsets.only(top: 8),
                child: Text(photoError!, style: TextStyle(color: Colors.red)),
              ),
            SizedBox(height: 20),
            TextField(
              controller: name,
              maxLength: 100,
              decoration: InputDecoration(labelText: '餐食名称 *', counterText: ''),
            ),
            SizedBox(height: 12),
            Wrap(
              spacing: 8,
              children: kinds
                  .map(
                    (k) => ChoiceChip(
                      label: Text(k),
                      selected: kind == k,
                      onSelected: (_) {
                        setState(() => kind = k);
                        changed();
                      },
                    ),
                  )
                  .toList(),
            ),
            SizedBox(height: 12),
            Wrap(
              spacing: 12,
              children: [
                OutlinedButton(
                  onPressed: () async {
                    final picked = await showDatePicker(
                      context: context,
                      initialDate: DateTime.parse(date),
                      firstDate: DateTime(2000),
                      lastDate: DateTime(2100),
                    );
                    if (picked != null && mounted) {
                      setState(() => date = dateText(picked));
                      changed();
                    }
                  },
                  child: Text(date),
                ),
                OutlinedButton(
                  onPressed: () async {
                    final parts = time.split(':');
                    final picked = await showTimePicker(
                      context: context,
                      initialTime: TimeOfDay(
                        hour: int.parse(parts[0]),
                        minute: int.parse(parts[1]),
                      ),
                    );
                    if (picked != null && mounted) {
                      setState(
                        () => time =
                            '${picked.hour.toString().padLeft(2, '0')}:${picked.minute.toString().padLeft(2, '0')}',
                      );
                      changed();
                    }
                  },
                  child: Text('$time · 上海时间'),
                ),
              ],
            ),
            SizedBox(height: 16),
            TextField(
              controller: note,
              maxLength: 2000,
              minLines: 1,
              maxLines: 3,
              decoration: InputDecoration(labelText: '备注', counterText: ''),
            ),
            SizedBox(height: 20),
            Text(
              '食物与营养',
              style: TextStyle(fontSize: 19, fontWeight: FontWeight.w700),
            ),
            SizedBox(height: 6),
            for (int n = 0; n < items.length; n++)
              Card(
                margin: EdgeInsets.only(top: 14),
                child: Padding(
                  padding: EdgeInsets.all(14),
                  child: Column(
                    children: [
                      Row(
                        children: [
                          Expanded(child: Text('食物 ${n + 1}')),
                          IconButton(
                            onPressed: () {
                              final item = items.removeAt(n);
                              setState(() {});
                              changed();
                              WidgetsBinding.instance.addPostFrameCallback(
                                (_) => item.dispose(),
                              );
                            },
                            tooltip: '移除此食物',
                            icon: Icon(Icons.close),
                          ),
                        ],
                      ),
                      TextField(
                        controller: items[n].fields[0],
                        maxLength: 100,
                        decoration: InputDecoration(labelText: '食物名称 *'),
                      ),
                      SizedBox(height: 8),
                      TextField(
                        controller: items[n].fields[1],
                        maxLength: 100,
                        decoration: InputDecoration(
                          labelText: '份量，例如一碗 / 约150克',
                        ),
                      ),
                      LayoutBuilder(
                        builder: (context, constraints) => Wrap(
                          spacing: 10,
                          runSpacing: 12,
                          children: List.generate(
                            4,
                            (i) => SizedBox(
                              width: (constraints.maxWidth - 10) / 2,
                              child: TextField(
                                controller: items[n].fields[i + 2],
                                keyboardType: TextInputType.numberWithOptions(
                                  decimal: true,
                                ),
                                decoration: InputDecoration(
                                  labelText: nutrientLabels[i],
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            TextButton.icon(
              onPressed: items.length >= 30
                  ? null
                  : () {
                      final item = ItemFields();
                      listen(item);
                      setState(() => items.add(item));
                      changed();
                    },
              icon: Icon(Icons.add),
              label: Text('添加食物'),
            ),
            if (analysis != null) ...[
              Text(
                analysis!['uncertainty'] as String? ?? '',
                style: TextStyle(color: muted, fontSize: 12, height: 1.8),
              ),
              if (analysis!['search_status'] == 'used')
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton(
                    onPressed: showSources,
                    child: Text('查看联网参考'),
                  ),
                )
              else if (analysis!['search_status'] == 'unavailable')
                Text('联网参考暂不可用', style: TextStyle(color: muted, fontSize: 12)),
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                value: confirmed,
                onChanged: (v) {
                  setState(() => confirmed = v ?? false);
                },
                title: Text('已核对识别结果'),
              ),
            ],
          ],
        ),
      ),
    ),
  );
}

class MealChatRecorder extends StatefulWidget {
  const MealChatRecorder({
    super.key,
    required this.api,
    required this.selectedDate,
    this.initialPhoto,
    this.embedded = false,
    this.initialRecording = false,
    this.onSaved,
  });
  final bool embedded, initialRecording;
  final VoidCallback? onSaved;

  final MealApi api;
  final String selectedDate;
  final Uint8List? initialPhoto;

  @override
  State<MealChatRecorder> createState() => PiChatState();
}

class PiChatState extends State<MealChatRecorder> {
  bool recording = false;
  int mealStart = 0;
  String? saveId;
  http.Client? activeTransport;
  Timer? progressTimer;
  int elapsed = 0, generation = 0;
  String progressLabel = "正在连接健康助手";
  final blocks = <Map<String, dynamic>>[];
  late String date;
  late String time;
  late String kind;
  Uint8List? photo;
  final pendingPhotos = <Uint8List>[];
  final messages = <Map<String, dynamic>>[];
  Map<String, dynamic>? currentDraft;
  bool draftExpanded = true;
  bool busy = false;
  bool saving = false;
  bool retryChat = false;
  String? error;
  final textController = TextEditingController();
  final scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    recording = widget.initialRecording || widget.initialPhoto != null;
    date = widget.selectedDate;
    final now = shanghaiNow();
    time =
        '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}';
    kind = now.hour < 10
        ? '早餐'
        : now.hour < 14
        ? '午餐'
        : now.hour < 17
        ? '加餐'
        : now.hour < 21
        ? '晚餐'
        : '加餐';
    photo = widget.initialPhoto;

    if (photo != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _sendTurn(text: '帮我记录这餐', photoBytes: photo);
      });
    } else {
      messages.add({
        'role': 'assistant',
        'content': '你好，我是健康助手。可以一起看看身体数据、安排运动，也可以拍照或告诉我吃了什么来记餐。',
      });
    }
  }

  @override
  void didUpdateWidget(covariant MealChatRecorder oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.selectedDate != widget.selectedDate &&
        currentDraft == null &&
        !busy) {
      date = widget.selectedDate;
    }
  }

  @override
  void dispose() {
    activeTransport?.close();
    progressTimer?.cancel();
    textController.dispose();
    scrollController.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (scrollController.hasClients) {
        scrollController.animateTo(
          scrollController.position.maxScrollExtent,
          duration: Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void refreshMealTime() {
    final now = shanghaiNow();
    time =
        '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}';
    kind = now.hour < 10
        ? '早餐'
        : now.hour < 14
        ? '午餐'
        : now.hour < 17
        ? '加餐'
        : now.hour < 21
        ? '晚餐'
        : '加餐';
  }

  void startRecording() {
    if (!mounted || busy || saving) return;
    setState(() {
      if (currentDraft == null) {
        mealStart = messages.length;
        refreshMealTime();
      }
      recording = true;
    });
  }

  void stopGeneration() {
    generation++;
    activeTransport?.close();
    progressTimer?.cancel();
    if (!mounted) return;
    setState(() {
      busy = false;
      for (final block in blocks) {
        if (block['state'] == 'running') block['state'] = 'stopped';
      }
      error = '已停止生成，可重试。';
      retryChat = true;
    });
  }

  Future<void> _sendTurn({
    String? text,
    Uint8List? photoBytes,
    List<Uint8List>? photos,
    bool retry = false,
  }) async {
    final turnPhotos = photos ?? (photoBytes != null ? [photoBytes] : null);
    final trimmed = text?.trim() ?? '';
    if ((!retry && trimmed.isEmpty && turnPhotos == null) || busy || saving) {
      return;
    }
    if (currentDraft == null && !retry) refreshMealTime();
    final turn = ++generation;
    final transport = widget.api.newChatTransport();
    activeTransport = transport;
    setState(() {
      busy = true;
      retryChat = false;
      error = null;
      elapsed = 0;
      progressLabel = '正在连接健康助手';
      blocks.clear();
      if (turnPhotos != null && !recording) mealStart = messages.length;
      if (!retry) {
        messages.add({
          'role': 'user',
          'content': trimmed.isEmpty
              ? ((turnPhotos?.length ?? 0) > 1
                    ? '帮我记录这些照片中的食物'
                    : '帮我记录这张照片中的食物')
              : trimmed,
          if (turnPhotos != null && turnPhotos.isNotEmpty) ...{
            'photos': turnPhotos,
            'photo': turnPhotos.first,
          },
        });
      }
      if (turnPhotos != null) recording = true;
    });
    textController.clear();
    final timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted && busy) setState(() => elapsed++);
    });
    progressTimer = timer;
    _scrollToBottom();
    try {
      final history = messages
          .skip(recording ? mealStart : 0)
          .where((m) => m['include'] != false)
          .toList();
      // Exclude the local greeting, and keep the original photo first-turn path.
      while (history.isNotEmpty && history.first['role'] != 'user') {
        history.removeAt(0);
      }
      final apiMessages = history
          .skip(history.length > 20 ? history.length - 20 : 0)
          .map(
            (m) => {
              'role': m['role'],
              'content': (m['content'] as String).substring(
                0,
                (m['content'] as String).length.clamp(0, 2000),
              ),
              if (m['photos'] != null && (m['photos'] as List).isNotEmpty) ...{
                'photos': (m['photos'] as List)
                    .map((p) => {'data_base64': base64Encode(p as Uint8List)})
                    .toList(),
                'photo': {
                  'data_base64': base64Encode(
                    (m['photos'] as List).first as Uint8List,
                  ),
                },
              } else if (m['photo'] != null) ...{
                'photo': {'data_base64': base64Encode(m['photo'] as Uint8List)},
              },
              if (m['meal_draft'] != null) 'meal_draft': m['meal_draft'],
            },
          )
          .toList();
      // Use the injected HTTP client in widget tests, a closable client on device.
      await for (final event in widget.api.piChat(
        apiMessages,
        date,
        recording: recording,
        transport: transport,
      )) {
        if (!mounted || turn != generation || !busy) break;
        setState(() {
          switch (event['type']) {
            case 'status':
              progressLabel = event['label'] as String? ?? '正在分析';
            case 'text':
              if (blocks.isNotEmpty && blocks.last['type'] == 'text') {
                blocks.last['text'] = '${blocks.last['text']}${event['delta']}';
              } else {
                blocks.add({'type': 'text', 'text': event['delta']});
              }
              progressLabel = '正在生成回答';
            case 'tool_start':
              blocks.add({
                'type': 'tool',
                'name': event['tool'],
                'state': 'running',
              });
              progressLabel = '正在处理 ${piToolLabel(event['tool'])}';
            case 'tool_end':
              for (final block in blocks.reversed) {
                if (block['name'] == event['tool'] &&
                    block['state'] == 'running') {
                  block['state'] = event['success'] != true
                      ? 'failed'
                      : event['verified'] == false
                      ? 'pending'
                      : 'done';
                  block['durationMs'] = event['durationMs'];
                  break;
                }
              }
              progressLabel = '正在整理结果';
            case 'meal_draft':
              currentDraft = Map<String, dynamic>.from(event['draft'] as Map);
              if (currentDraft!['date'] is String) {
                date = currentDraft!['date'] as String;
              }
              if (currentDraft!['time'] is String) {
                time = currentDraft!['time'] as String;
              }
              if (currentDraft!['kind'] is String) {
                kind = currentDraft!['kind'] as String;
              }
              recording = true;
              saveId ??= newMealId();
            case 'error':
              timer.cancel();
              error = errorMessage(event['error'] as String?);
              retryChat = true;
              busy = false;
              for (final block in blocks) {
                if (block['state'] == 'running') block['state'] = 'failed';
              }
            case 'done':
              timer.cancel();
              final reply = event['answer'] as String? ?? '';
              if (!blocks.any((b) => b['type'] == 'text')) {
                blocks.add({'type': 'text', 'text': reply});
              }
              messages.add({
                'role': 'assistant',
                'content': reply,
                'blocks': blocks
                    .map((b) => Map<String, dynamic>.from(b))
                    .toList(),
                if (currentDraft != null) 'meal_draft': currentDraft,
              });
              busy = false;
              blocks.clear();
          }
          if (currentDraft?['kind'] != null &&
              kinds.contains(currentDraft!['kind'])) {
            kind = currentDraft!['kind'] as String;
          }
        });
        _scrollToBottom();
      }
    } catch (e) {
      if (mounted && turn == generation && busy) {
        setState(() {
          busy = false;
          error = message(e);
          retryChat = true;
          for (final block in blocks) {
            if (block['state'] == 'running') block['state'] = 'failed';
          }
        });
        _scrollToBottom();
      }
    } finally {
      timer.cancel();
      if (turn == generation) {
        progressTimer?.cancel();
        activeTransport = null;
      }
      if (!widget.api.customClient) transport.close();
    }
  }

  Future<void> _pickPhotos(ImageSource source) async {
    try {
      final list = await selectPhotos(source: source);
      if (list.isEmpty || !mounted) return;
      setState(() {
        pendingPhotos.addAll(list);
        if (pendingPhotos.length > 9) {
          pendingPhotos.removeRange(9, pendingPhotos.length);
        }
      });
    } catch (e) {
      if (mounted) {
        setState(() => error = message(e));
      }
    }
  }

  Future<void> _saveMeal() async {
    if (currentDraft == null || saving) return;
    setState(() {
      saving = true;
      retryChat = false;
      error = null;
    });

    try {
      final draft = currentDraft!;
      final items = (draft['items'] as List? ?? []).map((i) {
        final itemMap = Map<String, dynamic>.from(i as Map);
        return {
          'name': itemMap['name'] ?? '',
          'portion': itemMap['portion'] ?? '',
          'calories': itemMap['calories'] == null
              ? null
              : (itemMap['calories'] as num).toDouble(),
          'protein_g': itemMap['protein_g'] == null
              ? null
              : (itemMap['protein_g'] as num).toDouble(),
          'carbs_g': itemMap['carbs_g'] == null
              ? null
              : (itemMap['carbs_g'] as num).toDouble(),
          'fat_g': itemMap['fat_g'] == null
              ? null
              : (itemMap['fat_g'] as num).toDouble(),
        };
      }).toList();

      final userNotes = messages
          .skip(mealStart)
          .where(
            (m) => m['role'] == 'user' && (m['content'] as String).isNotEmpty,
          )
          .map((m) => m['content'] as String)
          .where(
            (s) =>
                s != '帮我记录这餐' &&
                s != '帮我分析这张照片中的食物' &&
                s != '我更新了照片，请帮我分析' &&
                s != '帮我记录这些照片中的食物',
          )
          .toList();

      final allMealPhotos = <Uint8List>[];
      for (final m
          in draft['copied_from'] != null
              ? <Map<String, dynamic>>[]
              : messages.skip(mealStart)) {
        if (m['role'] == 'user') {
          if (m['photos'] is List) {
            allMealPhotos.addAll((m['photos'] as List).cast<Uint8List>());
          } else if (m['photo'] != null) {
            allMealPhotos.add(m['photo'] as Uint8List);
          }
        }
      }
      if (draft['copied_from'] == null &&
          allMealPhotos.isEmpty &&
          photo != null) {
        allMealPhotos.add(photo!);
      }

      final meal = {
        'id': saveId ??= newMealId(),
        'date': date,
        'time': time,
        'kind': kind,
        'name': (draft['name'] as String? ?? '').trim().isEmpty
            ? '餐食记录'
            : draft['name'],
        'note': [
          if (draft['note'] is String) draft['note'] as String,
          ...userNotes,
        ].where((s) => s.isNotEmpty).join('\n'),
        'items': items,
        'nutrition_source': draft['nutrition_source'] ?? 'model_estimate',
        'analysis': draft['nutrition_source'] == 'manual'
            ? null
            : {
                'model': draft['model'] ?? 'MiniMax-M3',
                'is_food': true,
                'name': draft['name'],
                'items': items,
                'uncertainty': draft['uncertainty'],
                'sources': draft['sources'] ?? [],
                'search_status': draft['search_status'] ?? 'not_needed',
              },
        'nutrition_confirmed': true,
        if (allMealPhotos.isNotEmpty) ...{
          'photos': allMealPhotos
              .map((p) => {'data_base64': base64Encode(p)})
              .toList(),
          'photo': {'data_base64': base64Encode(allMealPhotos.first)},
        } else if (draft['copied_from'] == null && photo != null) ...{
          'photo': {'data_base64': base64Encode(photo!)},
        },
      };

      await widget.api.save(meal, false);
      if (mounted) {
        widget.onSaved?.call();
        if (!widget.embedded) {
          Navigator.pop(context, true);
          return;
        }
        setState(() {
          saving = false;
          currentDraft = null;
          photo = null;
          saveId = null;
          recording = false;
          messages.clear();
          mealStart = 0;
          messages.add({'role': 'assistant', 'content': '这餐已保存。可以继续聊，或记录下一餐。'});
        });
        _scrollToBottom();
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          saving = false;
          error = message(e);
        });
      }
    }
  }

  void _showSources(List sources) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: EdgeInsets.fromLTRB(20, 0, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '参考来源',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
              SizedBox(height: 12),
              ...sources.map((s) {
                final source = Map<String, dynamic>.from(s as Map);
                return Padding(
                  padding: EdgeInsets.only(bottom: 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        source['title'] as String? ?? '',
                        style: TextStyle(fontWeight: FontWeight.w600),
                      ),
                      Text(
                        source['url'] as String? ?? '',
                        style: TextStyle(
                          fontSize: 12,
                          color: adaptiveColor(context, muted),
                        ),
                      ),
                    ],
                  ),
                );
              }),
            ],
          ),
        ),
      ),
    );
  }

  void _showPhotoPicker() {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('拍照'),
              onTap: () {
                Navigator.pop(ctx);
                _pickPhotos(ImageSource.camera);
              },
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('从相册选择 (支持多选)'),
              onTap: () {
                Navigator.pop(ctx);
                _pickPhotos(ImageSource.gallery);
              },
            ),
          ],
        ),
      ),
    );
  }

  List<Uint8List> _mealPhotos() {
    final photos = <Uint8List>[];
    for (final m in messages.skip(mealStart)) {
      if (m['role'] != 'user') continue;
      if (m['photos'] is List) {
        photos.addAll((m['photos'] as List).cast<Uint8List>());
      } else if (m['photo'] is Uint8List) {
        photos.add(m['photo'] as Uint8List);
      }
    }
    if (photos.isEmpty && photo != null) photos.add(photo!);
    return photos;
  }

  @override
  Widget build(BuildContext context) {
    final draftPhotos = currentDraft == null ? <Uint8List>[] : _mealPhotos();
    double totalCalories = 0;
    if (currentDraft != null && currentDraft!['items'] is List) {
      for (final item in currentDraft!['items'] as List) {
        if (item is Map) {
          final cal = item['calories'] as num?;
          if (cal != null) totalCalories += cal.toDouble();
        }
      }
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('健康对话'),
        leading: widget.embedded
            ? const Padding(padding: EdgeInsets.all(16), child: PiIcon())
            : null,
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        actions: [
          TextButton(
            onPressed: busy || saving
                ? null
                : () {
                    if (recording) {
                      setState(() => recording = false);
                    } else {
                      startRecording();
                    }
                  },
            child: Text(recording ? '返回对话' : '记餐'),
          ),

          IconButton(
            tooltip: '手动记录',
            onPressed: busy || saving
                ? null
                : () async {
                    final result = await Navigator.push<bool>(
                      context,
                      MaterialPageRoute(
                        builder: (_) =>
                            MealEditor(api: widget.api, selectedDate: date),
                      ),
                    );
                    if (result == true) widget.onSaved?.call();
                  },
            icon: const Icon(Icons.note_add_outlined),
          ),
          if (currentDraft != null)
            IconButton(
              tooltip: '表单编辑',
              onPressed: busy || saving
                  ? null
                  : () async {
                      final nav = Navigator.of(context);
                      final saved = await nav.push<bool>(
                        MaterialPageRoute<bool>(
                          builder: (_) => MealEditor(
                            api: widget.api,
                            selectedDate: date,
                            initial: {
                              'name': currentDraft!['name'],
                              'date': date,
                              'time': time,
                              'kind': kind,
                              'items': currentDraft!['items'],
                              'analysis': currentDraft,
                              'nutrition_confirmed': true,
                            },
                            initialPhoto: photo,
                          ),
                        ),
                      );
                      if (saved == true && mounted) {
                        widget.onSaved?.call();
                        if (!widget.embedded) {
                          nav.pop(true);
                        } else {
                          setState(() {
                            currentDraft = null;
                            photo = null;
                            saveId = null;
                            recording = false;
                          });
                        }
                      }
                    },
              icon: const Icon(Icons.edit_outlined),
            ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                const Icon(Icons.calendar_month_outlined, size: 16),
                const SizedBox(width: 6),
                Text(
                  '查看日期 $date',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const Spacer(),
                TextButton(
                  onPressed: busy || saving
                      ? null
                      : () async {
                          final picked = await showDatePicker(
                            context: context,
                            initialDate: DateTime.parse(date),
                            firstDate: DateTime(2000),
                            lastDate: DateTime(2099, 12, 31),
                          );
                          if (picked != null && mounted) {
                            setState(() => date = dateText(picked));
                          }
                        },
                  child: const Text('更改'),
                ),
              ],
            ),
          ),
          // Header Bar
          if (recording || currentDraft != null)
            Container(
              padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              decoration: BoxDecoration(
                color: adaptiveColor(context, Colors.white),
                border: Border(
                  bottom: BorderSide(
                    color: adaptiveColor(context, Color(0xFFE2EBE5)),
                  ),
                ),
              ),
              child: Row(
                children: [
                  ...kinds.map((k) {
                    final selected = kind == k;
                    return Padding(
                      padding: EdgeInsets.only(right: 6),
                      child: ChoiceChip(
                        label: Text(k),
                        selected: selected,
                        visualDensity: VisualDensity.compact,
                        padding: EdgeInsets.symmetric(horizontal: 4),
                        onSelected: (val) {
                          if (val) setState(() => kind = k);
                        },
                      ),
                    );
                  }),
                  Spacer(),
                  InkWell(
                    onTap: () async {
                      final parts = time.split(':');
                      final picked = await showTimePicker(
                        context: context,
                        initialTime: TimeOfDay(
                          hour: int.tryParse(parts[0]) ?? 12,
                          minute: int.tryParse(parts[1]) ?? 0,
                        ),
                      );
                      if (picked != null) {
                        setState(() {
                          time =
                              '${picked.hour.toString().padLeft(2, '0')}:${picked.minute.toString().padLeft(2, '0')}';
                        });
                      }
                    },
                    child: Row(
                      children: [
                        Icon(
                          Icons.access_time,
                          size: 15,
                          color: adaptiveColor(context, leaf),
                        ),
                        SizedBox(width: 4),
                        Text(
                          time,
                          style: TextStyle(
                            fontSize: 13,
                            color: adaptiveColor(context, leaf),
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          // Chat message stream
          Expanded(
            child: ListView.builder(
              controller: scrollController,
              padding: EdgeInsets.symmetric(vertical: 12),
              itemCount:
                  messages.length +
                  (busy || (error != null && blocks.isNotEmpty) ? 1 : 0),
              itemBuilder: (ctx, index) {
                if (index == messages.length) {
                  return Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const PiIcon(size: 20),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                '$progressLabel · $elapsed 秒',
                                style: const TextStyle(fontSize: 12),
                              ),
                            ),
                            if (busy)
                              TextButton(
                                onPressed: stopGeneration,
                                child: const Text('停止生成'),
                              ),
                          ],
                        ),
                        ...blocks.map((block) => PiProcessBlock(block: block)),
                      ],
                    ),
                  );
                }
                final msg = messages[index];
                final isUser = msg['role'] == 'user';
                final content = msg['content'] as String? ?? '';
                final photoBytes = msg['photo'] as Uint8List?;
                final messagePhotos =
                    (msg['photos'] as List?)?.cast<Uint8List>().toList() ??
                    <Uint8List>[];

                if (isUser) {
                  return Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 6,
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Flexible(
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 14,
                              vertical: 10,
                            ),
                            decoration: BoxDecoration(
                              color: leaf,
                              borderRadius: const BorderRadius.only(
                                topLeft: Radius.circular(16),
                                topRight: Radius.circular(16),
                                bottomLeft: Radius.circular(16),
                                bottomRight: Radius.circular(4),
                              ),
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.black.withValues(alpha: 0.04),
                                  blurRadius: 4,
                                  offset: const Offset(0, 2),
                                ),
                              ],
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                if (messagePhotos.isNotEmpty) ...[
                                  Wrap(
                                    spacing: 6,
                                    runSpacing: 6,
                                    children: messagePhotos
                                        .asMap()
                                        .entries
                                        .map(
                                          (entry) => GestureDetector(
                                            key: ValueKey(
                                              'chat-photo-$index-${entry.key}',
                                            ),
                                            onTap: () => MealPhotoViewer.open(
                                              ctx,
                                              photos: messagePhotos
                                                  .map(MealPhoto.memory)
                                                  .toList(),
                                              initialIndex: entry.key,
                                            ),
                                            child: ClipRRect(
                                              borderRadius:
                                                  BorderRadius.circular(10),
                                              child: Image.memory(
                                                entry.value,
                                                width: messagePhotos.length == 1
                                                    ? 180
                                                    : 100,
                                                height:
                                                    messagePhotos.length == 1
                                                    ? 140
                                                    : 100,
                                                fit: BoxFit.cover,
                                              ),
                                            ),
                                          ),
                                        )
                                        .toList(),
                                  ),
                                  const SizedBox(height: 8),
                                ] else if (photoBytes != null) ...[
                                  GestureDetector(
                                    onTap: () => MealPhotoViewer.open(
                                      ctx,
                                      photos: [MealPhoto.memory(photoBytes)],
                                      title: '餐食照片',
                                    ),
                                    child: ClipRRect(
                                      borderRadius: BorderRadius.circular(10),
                                      child: Image.memory(
                                        photoBytes,
                                        width: 180,
                                        height: 140,
                                        fit: BoxFit.cover,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                ],
                                Text(
                                  content,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 14,
                                    height: 1.5,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  );
                }

                return Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 8,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (msg['blocks'] is List &&
                          (msg['blocks'] as List).isNotEmpty)
                        ...((msg['blocks'] as List)
                                .cast<Map<String, dynamic>>())
                            .map((b) => PiProcessBlock(block: b))
                      else
                        MarkdownBody(data: content),
                    ],
                  ),
                );
              },
            ),
          ),
          if (error != null)
            Container(
              margin: EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              padding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.red.shade50,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.red.shade200),
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.error_outline,
                    size: 16,
                    color: Colors.red.shade700,
                  ),
                  SizedBox(width: 8),
                  if (retryChat)
                    TextButton(
                      onPressed: busy || saving
                          ? null
                          : () => _sendTurn(retry: true),
                      child: const Text('重试'),
                    ),
                  Expanded(
                    child: Text(
                      error!,
                      style: TextStyle(
                        color: Colors.red.shade700,
                        fontSize: 12,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          // Live Draft Card
          if (currentDraft != null)
            Flexible(
              child: SingleChildScrollView(
                child: Container(
                  margin: EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                  decoration: BoxDecoration(
                    color: adaptiveColor(context, Colors.white),
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.06),
                        blurRadius: 10,
                        offset: Offset(0, 2),
                      ),
                    ],
                    border: Border.all(
                      color: adaptiveColor(
                        context,
                        leaf,
                      ).withValues(alpha: 0.25),
                    ),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (draftPhotos.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
                          child: SizedBox(
                            height: 76,
                            child: ListView.separated(
                              scrollDirection: Axis.horizontal,
                              itemCount: draftPhotos.length,
                              separatorBuilder: (_, _) =>
                                  const SizedBox(width: 8),
                              itemBuilder: (context, index) => GestureDetector(
                                key: ValueKey('draft-photo-$index'),
                                onTap: () => MealPhotoViewer.open(
                                  context,
                                  photos: draftPhotos
                                      .map(MealPhoto.memory)
                                      .toList(),
                                  initialIndex: index,
                                ),
                                child: ClipRRect(
                                  borderRadius: BorderRadius.circular(8),
                                  child: Image.memory(
                                    draftPhotos[index],
                                    width: 76,
                                    height: 76,
                                    fit: BoxFit.cover,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      InkWell(
                        borderRadius: BorderRadius.vertical(
                          top: Radius.circular(16),
                        ),
                        onTap: () =>
                            setState(() => draftExpanded = !draftExpanded),
                        child: Padding(
                          padding: EdgeInsets.fromLTRB(16, 12, 16, 12),
                          child: Row(
                            children: [
                              Icon(
                                Icons.receipt_long_outlined,
                                color: adaptiveColor(context, leaf),
                                size: 22,
                              ),
                              SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      currentDraft!['name'] as String? ??
                                          '餐食草稿',
                                      style: TextStyle(
                                        fontSize: 15,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                    Text(
                                      '总热量 ${totalCalories.round()} kcal · ${(currentDraft!['items'] as List? ?? []).length}项食物',
                                      style: TextStyle(
                                        fontSize: 12,
                                        color: adaptiveColor(context, muted),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              Icon(
                                draftExpanded
                                    ? Icons.keyboard_arrow_up
                                    : Icons.keyboard_arrow_down,
                                color: adaptiveColor(context, muted),
                              ),
                            ],
                          ),
                        ),
                      ),
                      if (draftExpanded) ...[
                        Divider(height: 1, indent: 16, endIndent: 16),
                        Padding(
                          padding: EdgeInsets.fromLTRB(16, 10, 16, 12),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              ConstrainedBox(
                                constraints: BoxConstraints(
                                  maxHeight:
                                      MediaQuery.of(context).viewInsets.bottom >
                                          0
                                      ? 110
                                      : 200,
                                ),
                                child: SingleChildScrollView(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      ...((currentDraft!['items'] as List? ??
                                                  [])
                                              .cast<Map<String, dynamic>>())
                                          .map((item) {
                                            final portion =
                                                item['portion'] as String? ??
                                                '';
                                            final cal = item['calories'];
                                            final carbs = item['carbs_g'];
                                            final p = item['protein_g'];
                                            final f = item['fat_g'];
                                            return Padding(
                                              padding: EdgeInsets.only(
                                                bottom: 6,
                                              ),
                                              child: Column(
                                                crossAxisAlignment:
                                                    CrossAxisAlignment.start,
                                                children: [
                                                  Row(
                                                    children: [
                                                      Expanded(
                                                        child: Text.rich(
                                                          TextSpan(
                                                            children: [
                                                              TextSpan(
                                                                text:
                                                                    item['name']
                                                                        as String? ??
                                                                    '',
                                                                style: TextStyle(
                                                                  fontWeight:
                                                                      FontWeight
                                                                          .w600,
                                                                  fontSize: 13,
                                                                ),
                                                              ),
                                                              if (portion
                                                                  .isNotEmpty)
                                                                TextSpan(
                                                                  text:
                                                                      ' · $portion',
                                                                  style: TextStyle(
                                                                    fontSize:
                                                                        12,
                                                                    color:
                                                                        adaptiveColor(
                                                                          context,
                                                                          leaf,
                                                                        ),
                                                                  ),
                                                                ),
                                                            ],
                                                          ),
                                                          maxLines: 2,
                                                          overflow: TextOverflow
                                                              .ellipsis,
                                                        ),
                                                      ),
                                                      SizedBox(width: 8),
                                                      if (cal != null)
                                                        Text(
                                                          '$cal kcal',
                                                          style: TextStyle(
                                                            fontWeight:
                                                                FontWeight.bold,
                                                            fontSize: 13,
                                                          ),
                                                        ),
                                                    ],
                                                  ),
                                                  Text(
                                                    '碳水 ${carbs ?? '-'}g · 蛋白质 ${p ?? '-'}g · 脂肪 ${f ?? '-'}g',
                                                    style: TextStyle(
                                                      fontSize: 11,
                                                      color: adaptiveColor(
                                                        context,
                                                        muted,
                                                      ),
                                                    ),
                                                  ),
                                                ],
                                              ),
                                            );
                                          }),
                                      if (currentDraft!['uncertainty'] !=
                                              null &&
                                          (currentDraft!['uncertainty']
                                                  as String)
                                              .isNotEmpty)
                                        Padding(
                                          padding: EdgeInsets.only(top: 4),
                                          child: Row(
                                            crossAxisAlignment:
                                                CrossAxisAlignment.start,
                                            children: [
                                              Icon(
                                                Icons.info_outline,
                                                size: 14,
                                                color: adaptiveColor(
                                                  context,
                                                  muted,
                                                ),
                                              ),
                                              SizedBox(width: 4),
                                              Expanded(
                                                child: Text(
                                                  currentDraft!['uncertainty']
                                                      as String,
                                                  style: TextStyle(
                                                    fontSize: 11,
                                                    color: adaptiveColor(
                                                      context,
                                                      muted,
                                                    ),
                                                  ),
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),
                                      if ((currentDraft!['sources'] as List? ??
                                              [])
                                          .isNotEmpty)
                                        Align(
                                          alignment: Alignment.centerLeft,
                                          child: TextButton.icon(
                                            style: TextButton.styleFrom(
                                              visualDensity:
                                                  VisualDensity.compact,
                                              padding: EdgeInsets.zero,
                                            ),
                                            onPressed: () => _showSources(
                                              currentDraft!['sources'] as List,
                                            ),
                                            icon: Icon(
                                              Icons.travel_explore,
                                              size: 14,
                                            ),
                                            label: Text(
                                              '参考了 ${(currentDraft!['sources'] as List).length} 条网络资料',
                                              style: TextStyle(fontSize: 11),
                                            ),
                                          ),
                                        ),
                                    ],
                                  ),
                                ),
                              ),
                              SizedBox(height: 8),
                              SizedBox(
                                width: double.infinity,
                                child: FilledButton.icon(
                                  onPressed: (saving || busy)
                                      ? null
                                      : _saveMeal,
                                  icon: saving
                                      ? SizedBox(
                                          width: 16,
                                          height: 16,
                                          child: CircularProgressIndicator(
                                            strokeWidth: 2,
                                            color: Colors.white,
                                          ),
                                        )
                                      : Icon(Icons.check, size: 18),
                                  label: Text(saving ? '正在保存…' : '保存记录'),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ),
          // Pending Photos Preview Bar
          if (pendingPhotos.isNotEmpty)
            Container(
              height: 96,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              decoration: BoxDecoration(
                color: adaptiveColor(context, Colors.white),
                border: Border(
                  top: BorderSide(
                    color: adaptiveColor(context, const Color(0xFFE2EBE5)),
                  ),
                ),
              ),
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount:
                    pendingPhotos.length + (pendingPhotos.length < 9 ? 1 : 0),
                separatorBuilder: (_, _) => const SizedBox(width: 8),
                itemBuilder: (ctx, index) {
                  if (index == pendingPhotos.length) {
                    return InkWell(
                      borderRadius: BorderRadius.circular(8),
                      onTap: () => _showPhotoPicker(),
                      child: Container(
                        width: 70,
                        decoration: BoxDecoration(
                          border: Border.all(
                            color: adaptiveColor(
                              context,
                              leaf,
                            ).withValues(alpha: 0.4),
                          ),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              Icons.add,
                              color: adaptiveColor(context, leaf),
                              size: 20,
                            ),
                            Text(
                              '加图',
                              style: TextStyle(
                                fontSize: 10,
                                color: adaptiveColor(context, leaf),
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  }
                  return Stack(
                    children: [
                      GestureDetector(
                        onTap: () => MealPhotoViewer.open(
                          ctx,
                          photos: pendingPhotos.map(MealPhoto.memory).toList(),
                          initialIndex: index,
                        ),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: Image.memory(
                            pendingPhotos[index],
                            width: 70,
                            height: 80,
                            fit: BoxFit.cover,
                          ),
                        ),
                      ),
                      Positioned(
                        top: 2,
                        right: 2,
                        child: GestureDetector(
                          onTap: () =>
                              setState(() => pendingPhotos.removeAt(index)),
                          child: Container(
                            decoration: const BoxDecoration(
                              color: Colors.black54,
                              shape: BoxShape.circle,
                            ),
                            padding: const EdgeInsets.all(2),
                            child: const Icon(
                              Icons.close,
                              size: 12,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ),
                    ],
                  );
                },
              ),
            ),
          // Bottom Input Bar
          Container(
            padding: EdgeInsets.fromLTRB(12, 8, 12, 8),
            decoration: BoxDecoration(
              color: adaptiveColor(context, Colors.white),
              border: Border(
                top: BorderSide(
                  color: adaptiveColor(context, Color(0xFFE2EBE5)),
                ),
              ),
            ),
            child: SafeArea(
              top: false,
              child: Row(
                children: [
                  IconButton(
                    onPressed: busy ? null : () => _showPhotoPicker(),
                    icon: Icon(
                      Icons.add_photo_alternate_outlined,
                      color: adaptiveColor(context, leaf),
                    ),
                    tooltip: '发送照片',
                  ),
                  Expanded(
                    child: TextField(
                      controller: textController,
                      enabled: !busy && !saving,
                      minLines: 1,
                      maxLines: 4,
                      decoration: InputDecoration(
                        hintText: recording ? '描述餐食或补充份量…' : '问问身体数据，或记录这一餐…',
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.all(Radius.circular(24)),
                          borderSide: BorderSide(color: Color(0xFFD0DCD3)),
                        ),
                        contentPadding: EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 10,
                        ),
                      ),
                      onSubmitted: (val) {
                        if ((val.trim().isNotEmpty ||
                                pendingPhotos.isNotEmpty) &&
                            !busy) {
                          final photosToSend = List<Uint8List>.from(
                            pendingPhotos,
                          );
                          setState(() => pendingPhotos.clear());
                          _sendTurn(
                            text: val,
                            photos: photosToSend.isNotEmpty
                                ? photosToSend
                                : null,
                          );
                        }
                      },
                    ),
                  ),
                  SizedBox(width: 8),
                  IconButton(
                    style: IconButton.styleFrom(
                      backgroundColor: leaf,
                      foregroundColor: Colors.white,
                    ),
                    onPressed: (busy || saving)
                        ? null
                        : () {
                            final text = textController.text.trim();
                            if (text.isNotEmpty || pendingPhotos.isNotEmpty) {
                              final photosToSend = List<Uint8List>.from(
                                pendingPhotos,
                              );
                              setState(() => pendingPhotos.clear());
                              _sendTurn(
                                text: text,
                                photos: photosToSend.isNotEmpty
                                    ? photosToSend
                                    : null,
                              );
                            }
                          },
                    icon: Icon(Icons.send_rounded, size: 18),
                    tooltip: '发送',
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
