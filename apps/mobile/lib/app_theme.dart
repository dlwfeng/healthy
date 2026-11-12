import 'dart:async';
import 'package:flutter/material.dart';
import 'meal_api.dart';

ThemeData healthTheme(Brightness brightness) {
  final dark = brightness == Brightness.dark;
  final colors = ColorScheme.fromSeed(
    seedColor: const Color(0xFF14786C),
    brightness: brightness,
    surface: dark ? const Color(0xFF16201D) : Colors.white,
  );
  return ThemeData(
    useMaterial3: true,
    brightness: brightness,
    colorScheme: colors,
    scaffoldBackgroundColor: dark
        ? const Color(0xFF101815)
        : const Color(0xFFF4F8F4),
    appBarTheme: AppBarTheme(
      backgroundColor: dark ? const Color(0xFF101815) : const Color(0xFFF4F8F4),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: dark ? const Color(0xFF16201D) : const Color(0xFFF4F8F4),
      labelTextStyle: WidgetStatePropertyAll(
        TextStyle(fontSize: 12, color: colors.onSurface),
      ),
    ),
    inputDecorationTheme: const InputDecorationTheme(
      border: OutlineInputBorder(),
      isDense: true,
    ),
  );
}

class ThemeHost extends StatefulWidget {
  const ThemeHost({super.key, required this.storage, required this.builder});
  final MealLocalStore storage;
  final Widget Function(ThemeMode) builder;
  @override
  State<ThemeHost> createState() => ThemeHostState();
}

class ThemeHostState extends State<ThemeHost> {
  ThemeMode mode = ThemeMode.light;
  int revision = 0;
  @override
  void initState() {
    super.initState();
    unawaited(load());
  }

  Future<void> load() async {
    final token = revision;
    try {
      final value = await widget.storage.read('appearance');
      if (mounted && token == revision) {
        setState(
          () => mode = value?['theme'] == 'dark'
              ? ThemeMode.dark
              : ThemeMode.light,
        );
      }
    } catch (_) {}
  }

  Future<void> toggle(BuildContext context) async {
    final old = mode;
    final token = ++revision;
    setState(
      () => mode = mode == ThemeMode.dark ? ThemeMode.light : ThemeMode.dark,
    );
    try {
      await widget.storage.write('appearance', {
        'theme': mode == ThemeMode.dark ? 'dark' : 'light',
      });
    } catch (_) {
      if (mounted && token == revision) {
        setState(() => mode = old);
        if (context.mounted) {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(const SnackBar(content: Text('外观设置保存失败，请重试。')));
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) =>
      ThemeScope(controller: this, child: widget.builder(mode));
}

class ThemeScope extends InheritedWidget {
  const ThemeScope({super.key, required this.controller, required super.child});
  final ThemeHostState controller;
  static ThemeHostState? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<ThemeScope>()?.controller;
  @override
  bool updateShouldNotify(ThemeScope oldWidget) => true;
}

class ThemeToggle extends StatelessWidget {
  const ThemeToggle({super.key});
  @override
  Widget build(BuildContext context) {
    final controller = ThemeScope.maybeOf(context);
    if (controller == null) return const SizedBox.shrink();
    final dark = Theme.of(context).brightness == Brightness.dark;
    return IconButton(
      tooltip: dark ? '切换到 Light' : '切换到 Dark',
      onPressed: () => controller.toggle(context),
      icon: Icon(dark ? Icons.light_mode_outlined : Icons.dark_mode_outlined),
    );
  }
}

Color adaptiveColor(BuildContext context, Color light) {
  if (Theme.of(context).brightness != Brightness.dark) return light;
  final colors = Theme.of(context).colorScheme;
  const surfaces = {0xFFFFFFFF, 0xFFF4F8F4, 0xFFF7FAF8, 0xFFF1F6F3, 0xFFF9FCFA};
  const borders = {0xFFE2EBE5, 0xFFE9EFEA, 0xFFF0F4F2, 0xFFD0DCD3};
  final value = light.toARGB32();
  const nutrients = {
    0xFFC85A48: Color(0xFFFFA18D),
    0xFF4A68B0: Color(0xFFA9BEFF),
    0xFFB57428: Color(0xFFFFCE8E),
    0xFF288673: Color(0xFF8BD5C5),
  };
  if (nutrients.containsKey(value)) return nutrients[value]!;
  if (surfaces.contains(value)) return colors.surface;
  if (borders.contains(value)) return colors.outlineVariant;
  if (value == 0x42000000) return colors.onSurface.withValues(alpha: 0.38);
  if (value == 0xDD000000 || value == 0xFF263C32) return colors.onSurface;
  if (value == 0xFF607078 || value == 0xFF74877A) {
    return colors.onSurfaceVariant;
  }
  if (value == 0xFF14786C || value == 0xFF326B54) return colors.primary;
  if (value == 0xFF3F51B5) return const Color(0xFFAEB6FF);
  if (value == 0xFFB44836) return const Color(0xFFFFB4A8);
  return light;
}
