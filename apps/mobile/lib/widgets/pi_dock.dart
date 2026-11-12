import 'package:flutter/material.dart';
import '../navigation.dart';
import 'pi_icon.dart';

class PiDock extends StatelessWidget {
  const PiDock({
    super.key,
    required this.dock,
    required this.selected,
    required this.onNavigate,
  });
  final List<String> dock;
  final String selected;
  final ValueChanged<String>? onNavigate;
  List<String> get items => [...dock, 'more'];
  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final split = (items.length / 2).ceil();
    Widget piButton() => SizedBox(
      width: 76,
      child: Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(
                color: colors.surface,
                shape: BoxShape.circle,
              ),
              child: Semantics(
                selected: selected == 'pi',
                button: true,
                label: '健康助手',
                child: Tooltip(
                  message: '健康助手',
                  excludeFromSemantics: true,
                  child: Material(
                    color: colors.primary,
                    shape: const CircleBorder(),
                    elevation: selected == 'pi' ? 6 : 3,
                    shadowColor: colors.shadow.withValues(alpha: 0.3),
                    clipBehavior: Clip.antiAlias,
                    child: InkWell(
                      key: const ValueKey('dock-pi'),
                      customBorder: const CircleBorder(),
                      onTap: onNavigate == null
                          ? null
                          : () => onNavigate!('pi'),
                      child: SizedBox.square(
                        dimension: 60,
                        child: Center(
                          child: PiIcon(size: 30, color: colors.onPrimary),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 2),
            Text(
              '健康助手',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: colors.primary,
              ),
            ),
          ],
        ),
      ),
    );
    Widget entry(String id) {
      final active = selected == id;
      final color = active
          ? Theme.of(context).colorScheme.primary
          : Theme.of(context).colorScheme.onSurfaceVariant;
      return Semantics(
        selected: active,
        button: true,
        child: InkWell(
          key: ValueKey('dock-$id'),
          onTap: onNavigate == null ? null : () => onNavigate!(id),
          borderRadius: BorderRadius.circular(20),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 2),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: active
                        ? Theme.of(context).colorScheme.secondaryContainer
                        : Colors.transparent,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Icon(
                    id == 'more' ? Icons.more_horiz : destination(id).icon,
                    color: color,
                    size: 24,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  id == 'more' ? '更多' : destination(id).label,
                  maxLines: 1,
                  style: TextStyle(fontSize: 10, color: color),
                ),
              ],
            ),
          ),
        ),
      );
    }

    Widget side(List<String> ids) => Expanded(
      child: Row(
        children: ids.map((id) => Expanded(child: entry(id))).toList(),
      ),
    );
    return Stack(
      children: [
        Positioned.fill(top: 20, child: Material(color: colors.surface)),
        Material(
          type: MaterialType.transparency,
          child: SafeArea(
            top: false,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                side(items.take(split).toList()),
                piButton(),
                side(items.skip(split).toList()),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
