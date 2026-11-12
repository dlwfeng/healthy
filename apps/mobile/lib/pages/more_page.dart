import 'package:flutter/material.dart';

import '../navigation.dart';
import '../meal_api.dart';
import '../widgets/data_page.dart';

class MorePage extends StatelessWidget {
  const MorePage({
    super.key,
    required this.dock,
    required this.onNavigate,
    required this.onConfigureDock,
    required this.onConfigureServer,
    required this.onReportSettings,
    this.onAppUpdate,
  });
  final List<String> dock;
  final ValueChanged<String> onNavigate;
  final VoidCallback onConfigureDock, onConfigureServer, onReportSettings;
  final VoidCallback? onAppUpdate;
  Widget item(String id) => ListTile(
    leading: Icon(destination(id).icon),
    title: Text(destination(id).label),
    trailing: const Icon(Icons.chevron_right),
    onTap: () => onNavigate(id),
  );
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('更多')),
    body: ListView(
      padding: const EdgeInsets.all(16),
      children: [
        ListTile(
          leading: const Icon(Icons.tune),
          title: const Text('自定义 Dock 栏'),
          subtitle: Text(dock.map((id) => destination(id).label).join(' · ')),
          trailing: const Icon(Icons.chevron_right),
          onTap: onConfigureDock,
        ),
        const Divider(),
        item('home'),
        item('reports'),
        ...navigationGroups.entries.map(
          (g) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 20, 16, 4),
                child: Text(
                  g.key,
                  style: Theme.of(context).textTheme.titleSmall,
                ),
              ),
              ...g.value.map(item),
            ],
          ),
        ),
        const Divider(),
        ListTile(
          leading: const Icon(Icons.settings_outlined),
          title: const Text('连接设置'),
          onTap: onConfigureServer,
        ),
        ListTile(
          leading: const Icon(Icons.schedule),
          title: const Text('自动报告设置'),
          onTap: onReportSettings,
        ),
        ListTile(
          leading: const Icon(Icons.system_update_alt),
          title: const Text('应用更新'),
          trailing: const Icon(Icons.chevron_right),
          onTap: onAppUpdate,
        ),
        const Divider(),
        item('memory'),
        item('feedback'),
      ],
    ),
  );
}

class DockSettingsPage extends StatefulWidget {
  const DockSettingsPage({
    super.key,
    required this.dock,
    required this.storage,
  });
  final List<String> dock;
  final MealLocalStore storage;
  @override
  State<DockSettingsPage> createState() => _DockSettingsPageState();
}

class _DockSettingsPageState extends State<DockSettingsPage> {
  late List<String> dock = [...widget.dock];
  bool saving = false;
  String? error;
  Future<void> save() async {
    setState(() {
      saving = true;
      error = null;
    });
    try {
      await widget.storage.write('navigation', {'dock': dock});
      if (mounted) Navigator.pop(context, dock);
    } catch (e) {
      if (mounted) {
        setState(() {
          saving = false;
          error = errorText(e);
        });
      }
    }
  }

  void toggle(String id, bool selected) {
    if (selected && dock.length == 4) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Dock 最多展示 4 个入口；“更多”固定在右侧。')),
      );
      return;
    }
    if (!selected && dock.length == 1) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('请至少保留 1 个 Dock 入口。')));
      return;
    }
    setState(() {
      if (selected) {
        dock.add(id);
      } else {
        dock.remove(id);
      }
    });
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('自定义 Dock 栏'),
      actions: [
        TextButton(
          onPressed: saving ? null : save,
          child: Text(saving ? '保存中…' : '保存'),
        ),
      ],
    ),
    body: ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text('选择 1–4 个入口，拖动调整顺序。“更多”始终位于最右侧，包含完整菜单。'),
        const SizedBox(height: 16),
        Text('展示顺序', style: Theme.of(context).textTheme.titleMedium),
        ReorderableListView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          buildDefaultDragHandles: false,
          itemCount: dock.length,
          onReorderItem: saving
              ? (oldIndex, newIndex) {}
              : (oldIndex, newIndex) => setState(() {
                  dock.insert(newIndex, dock.removeAt(oldIndex));
                }),
          itemBuilder: (context, i) => ListTile(
            key: ValueKey(dock[i]),
            leading: Icon(destination(dock[i]).icon),
            title: Text(destination(dock[i]).label),
            trailing: ReorderableDragStartListener(
              index: i,
              enabled: !saving,
              child: const Padding(
                padding: EdgeInsets.all(12),
                child: Icon(Icons.drag_handle),
              ),
            ),
          ),
        ),
        const Divider(),
        Text('可选菜单', style: Theme.of(context).textTheme.titleMedium),
        ...destinations.map(
          (d) => CheckboxListTile(
            value: dock.contains(d.id),
            title: Text(d.label),
            secondary: Icon(d.icon),
            onChanged: saving ? null : (v) => toggle(d.id, v == true),
          ),
        ),
        if (error != null) Text(error!),
        TextButton(
          onPressed: saving
              ? null
              : () => setState(() => dock = [...defaultDock]),
          child: const Text('恢复默认'),
        ),
      ],
    ),
  );
}
