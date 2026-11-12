import 'package:flutter/material.dart';
import '../app_theme.dart';
import '../nutrition_reference.dart';
import 'nutrition_widgets.dart';
import 'photo_viewer.dart';

IconData getMealTimeIcon(String? time) {
  if (time == null || !time.contains(':')) return Icons.restaurant;
  final hour = int.tryParse(time.split(':')[0]) ?? 12;
  if (hour >= 5 && hour < 11) return Icons.wb_twilight;
  if (hour >= 11 && hour < 17) return Icons.wb_sunny_outlined;
  if (hour >= 17 && hour < 21) return Icons.wb_twilight;
  return Icons.nightlight_outlined;
}

class MealEntryWidget extends StatelessWidget {
  const MealEntryWidget({
    super.key,
    required this.meal,
    required this.baseUrl,
    required this.profile,
    this.detail = false,
    this.onOpen,
    required this.onEdit,
    required this.onDelete,
    this.onShowSources,
  });

  final Map<String, dynamic> meal;
  final String baseUrl;
  final Map<String, dynamic>? profile;
  final bool detail;
  final VoidCallback? onOpen;
  final VoidCallback onEdit;
  final VoidCallback onDelete;
  final VoidCallback? onShowSources;

  @override
  Widget build(BuildContext context) {
    final assessment = NutritionReference.assessMeal(meal, profile);
    final photoUrl = meal['photo_url'] as String?;
    final photoUrls = (meal['photo_urls'] as List? ?? [])
        .cast<String>()
        .toList();
    if (photoUrls.isEmpty && photoUrl != null) photoUrls.add(photoUrl);
    final kind = meal['kind'] as String? ?? '餐食';
    final time = meal['time'] as String? ?? '';
    final name = (meal['name'] as String? ?? '').isNotEmpty
        ? meal['name'] as String
        : kind;
    final items = (meal['items'] as List? ?? []).cast<Map<String, dynamic>>();
    final itemsSummary = items.isNotEmpty
        ? items.map((i) => i['name'] ?? '').where((s) => s.isNotEmpty).join('、')
        : (meal['note'] as String? ?? '未记录食物明细');

    return Container(
      margin: EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: adaptiveColor(context, Colors.white),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: adaptiveColor(context, borderLine)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.03),
            blurRadius: 6,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (photoUrls.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
              child: detail && photoUrls.length > 1
                  ? SizedBox(
                      height: 180,
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        itemCount: photoUrls.length,
                        separatorBuilder: (_, _) => const SizedBox(width: 8),
                        itemBuilder: (context, idx) => SizedBox(
                          key: ValueKey('meal-detail-photo-$idx'),
                          width: 180,
                          child: GestureDetector(
                            onTap: () => _openPhotos(context, photoUrls, idx),
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(12),
                              child: _photo(
                                context,
                                '$baseUrl${photoUrls[idx]}',
                                '$name (${idx + 1}/${photoUrls.length})',
                                BoxFit.cover,
                              ),
                            ),
                          ),
                        ),
                      ),
                    )
                  : ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: GestureDetector(
                        onTap: detail
                            ? () => _openPhotos(context, photoUrls, 0)
                            : onOpen,
                        child: detail
                            ? _photo(
                                context,
                                '$baseUrl${photoUrls.first}',
                                name,
                                BoxFit.contain,
                              )
                            : Stack(
                                children: [
                                  AspectRatio(
                                    aspectRatio: 16 / 9,
                                    child: _photo(
                                      context,
                                      '$baseUrl${photoUrls.first}',
                                      name,
                                      BoxFit.cover,
                                    ),
                                  ),
                                  if (photoUrls.length > 1)
                                    Positioned(
                                      right: 8,
                                      bottom: 8,
                                      child: Container(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 6,
                                          vertical: 2,
                                        ),
                                        decoration: BoxDecoration(
                                          color: Colors.black.withValues(
                                            alpha: 0.65,
                                          ),
                                          borderRadius: BorderRadius.circular(
                                            10,
                                          ),
                                        ),
                                        child: Row(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            const Icon(
                                              Icons.photo_library,
                                              size: 12,
                                              color: Colors.white,
                                            ),
                                            const SizedBox(width: 4),
                                            Text(
                                              '${photoUrls.length}',
                                              style: const TextStyle(
                                                color: Colors.white,
                                                fontSize: 11,
                                                fontWeight: FontWeight.bold,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ),
                                ],
                              ),
                      ),
                    ),
            ),
          // 摘要进入独立详情页。
          InkWell(
            onTap: detail ? null : onOpen,
            borderRadius: BorderRadius.vertical(
              top: Radius.circular(24),
              bottom: Radius.circular(detail ? 0 : 16),
            ),
            child: Padding(
              padding: EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // 标题与副标题信息
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            // Keep metadata readable when text is enlarged.
                            Wrap(
                              crossAxisAlignment: WrapCrossAlignment.center,
                              runSpacing: 6,
                              children: [
                                Icon(
                                  getMealTimeIcon(time),
                                  size: 14,
                                  color: adaptiveColor(context, leafGreen),
                                ),
                                SizedBox(width: 4),
                                Text(
                                  '$kind $time',
                                  style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                    color: adaptiveColor(context, leafGreen),
                                  ),
                                ),
                              ],
                            ),
                            SizedBox(height: 5),
                            // 餐食主名称
                            Text(
                              name,
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                                color: adaptiveColor(context, Colors.black87),
                                height: 1.3,
                              ),
                              maxLines: detail ? null : 2,
                              overflow: detail
                                  ? TextOverflow.visible
                                  : TextOverflow.ellipsis,
                            ),
                            if (itemsSummary != name &&
                                itemsSummary.isNotEmpty) ...[
                              SizedBox(height: 4),
                              Text(
                                itemsSummary,
                                style: TextStyle(
                                  fontSize: 12,
                                  color: adaptiveColor(context, mutedText),
                                  height: 1.4,
                                ),
                                maxLines: detail ? null : 2,
                                overflow: detail
                                    ? TextOverflow.visible
                                    : TextOverflow.ellipsis,
                              ),
                            ],
                          ],
                        ),
                      ),
                      SizedBox(width: 8),
                      if (!detail)
                        Icon(
                          Icons.chevron_right_rounded,
                          color: adaptiveColor(context, mutedText),
                          size: 22,
                        ),
                    ],
                  ),
                  SizedBox(height: 12),
                  Divider(height: 1, color: adaptiveColor(context, borderLine)),
                  SizedBox(height: 10),
                  if (detail) ...[
                    Text(
                      '合计',
                      style: TextStyle(
                        fontSize: 13,
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(height: 12),
                    NutrientMetricsGrid(metrics: assessment.metrics),
                  ] else
                    Wrap(
                      spacing: 16,
                      runSpacing: 10,
                      children: mealMetrics.map((metric) {
                        final value = assessment.metrics[metric.key]!;
                        final amount = value.value == null
                            ? '—'
                            : metric.key == 'calories'
                            ? value.value!.round().toString()
                            : value.value!.toStringAsFixed(1);
                        return Text.rich(
                          TextSpan(
                            children: [
                              TextSpan(
                                text: '$amount${value.complete ? '' : '*'} ',
                                style: TextStyle(
                                  fontWeight: FontWeight.w700,
                                  color: Theme.of(
                                    context,
                                  ).colorScheme.onSurface,
                                ),
                              ),
                              TextSpan(
                                text: metric.key == 'calories'
                                    ? 'kcal'
                                    : '${metric.label} ${metric.unit}',
                              ),
                            ],
                          ),
                          style: TextStyle(
                            fontSize: 12,
                            color: Theme.of(
                              context,
                            ).colorScheme.onSurfaceVariant,
                          ),
                        );
                      }).toList(),
                    ),
                ],
              ),
            ),
          ),

          // 详情页保留食物表格、备注、估算依据与操作。
          if (detail) ...[
            Container(
              decoration: BoxDecoration(
                color: adaptiveColor(context, surfaceBg),
                borderRadius: BorderRadius.vertical(
                  bottom: Radius.circular(24),
                ),
                border: Border(
                  top: BorderSide(color: adaptiveColor(context, borderLine)),
                ),
              ),
              padding: EdgeInsets.fromLTRB(14, 14, 14, 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // 明细标题行
                  Wrap(
                    spacing: 12,
                    runSpacing: 8,
                    alignment: WrapAlignment.spaceBetween,
                    children: [
                      Text(
                        '食物明细',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                          color: adaptiveColor(context, Colors.black87),
                        ),
                      ),
                    ],
                  ),
                  SizedBox(height: 10),

                  // 食物表格
                  if (items.isEmpty)
                    Padding(
                      padding: EdgeInsets.symmetric(vertical: 8),
                      child: Text(
                        '这餐还没有记录食物明细。',
                        style: TextStyle(
                          fontSize: 12,
                          color: adaptiveColor(context, mutedText),
                        ),
                      ),
                    )
                  else
                    _buildFoodTable(context, items, assessment),

                  // 备注与估算依据
                  if ((meal['note'] as String? ?? '').isNotEmpty ||
                      (meal['analysis']?['uncertainty'] as String? ?? '')
                          .isNotEmpty) ...[
                    SizedBox(height: 10),
                    Divider(
                      height: 1,
                      color: adaptiveColor(context, borderLine),
                    ),
                    SizedBox(height: 10),
                    if ((meal['note'] as String? ?? '').isNotEmpty) ...[
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '备注：',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                              color: adaptiveColor(context, mutedText),
                            ),
                          ),
                          Expanded(
                            child: Text(
                              meal['note'] as String,
                              style: TextStyle(fontSize: 12, height: 1.5),
                            ),
                          ),
                        ],
                      ),
                      SizedBox(height: 6),
                    ],
                    if ((meal['analysis']?['uncertainty'] as String? ?? '')
                        .isNotEmpty) ...[
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '估算依据：',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                              color: adaptiveColor(context, mutedText),
                            ),
                          ),
                          Expanded(
                            child: Text(
                              meal['analysis']['uncertainty'] as String,
                              style: TextStyle(
                                fontSize: 11,
                                color: adaptiveColor(context, mutedText),
                                height: 1.5,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],

                  SizedBox(height: 12),
                  // 操作按钮栏
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    alignment: WrapAlignment.end,
                    children: [
                      if (onShowSources != null)
                        TextButton.icon(
                          onPressed: onShowSources,
                          icon: Icon(Icons.travel_explore, size: 15),
                          label: Text('联网参考', style: TextStyle(fontSize: 12)),
                        ),
                      OutlinedButton.icon(
                        style: OutlinedButton.styleFrom(
                          visualDensity: VisualDensity.compact,
                          padding: EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 6,
                          ),
                        ),
                        onPressed: onEdit,
                        icon: Icon(Icons.edit_outlined, size: 14),
                        label: Text('编辑', style: TextStyle(fontSize: 12)),
                      ),
                      SizedBox(width: 8),
                      TextButton.icon(
                        style: TextButton.styleFrom(
                          visualDensity: VisualDensity.compact,
                          foregroundColor: warningRed,
                          padding: EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 6,
                          ),
                        ),
                        onPressed: onDelete,
                        icon: Icon(Icons.delete_outline, size: 14),
                        label: Text('删除', style: TextStyle(fontSize: 12)),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _photo(BuildContext context, String url, String name, BoxFit fit) =>
      Tooltip(
        message: detail ? '点击放大照片' : '查看餐食详情',
        child: Image.network(
          url,
          width: double.infinity,
          fit: fit,
          semanticLabel: '$name 照片',
          errorBuilder: (_, _, _) => const SizedBox(
            height: 180,
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.broken_image_outlined, size: 32),
                  SizedBox(height: 8),
                  Text('照片暂时无法加载'),
                ],
              ),
            ),
          ),
        ),
      );

  void _openPhotos(BuildContext context, List<String> paths, int initialIndex) {
    MealPhotoViewer.open(
      context,
      photos: paths.map((path) => MealPhoto.network('$baseUrl$path')).toList(),
      initialIndex: initialIndex,
    );
  }

  Widget _buildFoodTable(
    BuildContext context,
    List<Map<String, dynamic>> items,
    MealNutritionAssessment assessment,
  ) {
    final colors = Theme.of(context).colorScheme;
    return Column(
      children: items
          .map(
            (item) => Container(
              width: double.infinity,
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: colors.surface,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${item['name'] ?? ''}',
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  if ('${item['portion'] ?? ''}'.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      '${item['portion']}',
                      style: TextStyle(
                        fontSize: 13,
                        color: colors.onSurfaceVariant,
                      ),
                    ),
                  ],
                  const SizedBox(height: 14),
                  LayoutBuilder(
                    builder: (context, constraints) => Wrap(
                      spacing: 16,
                      runSpacing: 16,
                      children: mealMetrics.map((metric) {
                        final raw = item[metric.key];
                        final value = raw is num ? raw.toDouble() : null;
                        final amount = value == null
                            ? '未填'
                            : metric.key == 'calories'
                            ? value.round().toString()
                            : value.toStringAsFixed(1);
                        return SizedBox(
                          width: (constraints.maxWidth - 16) / 2,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '${metric.label} · $amount ${metric.unit}',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: colors.onSurfaceVariant,
                                ),
                              ),
                              const SizedBox(height: 6),
                              FoodPortionBar(
                                value: value,
                                upperBound:
                                    assessment.metrics[metric.key]?.range?.max,
                                metricColor: colors.primary,
                              ),
                            ],
                          ),
                        );
                      }).toList(),
                    ),
                  ),
                ],
              ),
            ),
          )
          .toList(),
    );
  }
}
