import 'dart:async';
import 'package:flutter/material.dart';
import '../app_theme.dart';
import '../meal_api.dart';
import '../garmin_api.dart';
import '../widgets/home/home_cards.dart';
import '../widgets/home/cockpit_widgets.dart';
import '../widgets/home/module_summaries.dart';

// ──────────────────────────────────────────────────────────────
// 首页 Tab：健康仪表盘 (Home Dashboard)
// ──────────────────────────────────────────────────────────────

class HomeDashboard extends StatefulWidget {
  const HomeDashboard({
    super.key,
    required this.garminApi,
    required this.storage,
    required this.selectedDate,
    required this.onDateChanged,
    this.onConfigure,
    this.onNavigateTab,
    this.onMetric,
    this.onStatus,
    this.onReports,
  });

  final GarminApi garminApi;
  final MealLocalStore storage;
  final String selectedDate;
  final ValueChanged<String> onDateChanged;
  final VoidCallback? onConfigure;
  final ValueChanged<int>? onNavigateTab;
  final VoidCallback? onStatus, onReports;
  final ValueChanged<String>? onMetric;

  @override
  State<HomeDashboard> createState() => _HomeDashboardState();
}

class _HomeDashboardState extends State<HomeDashboard> {
  Map<String, dynamic>? overview;
  String? garminState;
  bool loading = true;
  String? error;
  int _request = 0;

  DateTime get _currentDateTime =>
      DateTime.tryParse(widget.selectedDate) ?? shanghaiNow();

  bool _isToday(String d) => d == dateText(shanghaiNow());

  bool _canGoForward() {
    final nowStr = dateText(shanghaiNow());
    return widget.selectedDate.compareTo(nowStr) < 0;
  }

  void _shiftDate(int delta) {
    final current = _currentDateTime;
    final next = current.add(Duration(days: delta));
    final nextStr = dateText(next);
    final nowStr = dateText(shanghaiNow());
    if (nextStr.compareTo(nowStr) > 0) return;
    widget.onDateChanged(nextStr);
  }

  Future<void> _pickDate() async {
    final now = shanghaiNow();
    final picked = await showDatePicker(
      context: context,
      initialDate: _currentDateTime,
      firstDate: DateTime(2020),
      lastDate: now,
    );
    if (picked != null) {
      widget.onDateChanged(dateText(picked));
    }
  }

  String _formatDisplayDate(String d) {
    final dt = DateTime.tryParse(d);
    if (dt == null) return d;
    return '${dt.month}月${dt.day}日';
  }

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  @override
  void didUpdateWidget(HomeDashboard old) {
    super.didUpdateWidget(old);
    if (old.selectedDate != widget.selectedDate) {
      unawaited(_load());
    }
  }

  Future<void> _load({bool refresh = false}) async {
    if (!mounted) return;
    final current = ++_request;
    setState(() {
      loading = true;
      error = null;
      overview = null;
    });
    try {
      // Fetch connection status
      final status = await widget.garminApi.fetchStatus();
      if (!mounted || current != _request) return;
      final state = status['state'] as String?;
      if (state != 'ready') {
        setState(() {
          garminState = state;
          loading = false;
          overview = null;
        });
        return;
      }

      // Fetch overview data
      final data = await widget.garminApi.fetchOverview(
        widget.selectedDate,
        refresh: refresh,
      );
      if (!mounted || current != _request) return;
      setState(() {
        garminState = 'ready';
        overview = data;
        loading = false;
      });
    } catch (e) {
      if (mounted && current == _request) {
        setState(() {
          error = e.toString().replaceFirst('Exception: ', '');
          loading = false;
        });
      }
    }
  }

  Future<void> _refresh() => _load(refresh: true);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton(
              icon: Icon(Icons.chevron_left),
              tooltip: '前一天',
              onPressed: () => _shiftDate(-1),
            ),
            InkWell(
              onTap: _pickDate,
              borderRadius: BorderRadius.circular(8),
              child: Padding(
                padding: EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      _formatDisplayDate(widget.selectedDate),
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: adaptiveColor(context, Colors.black87),
                      ),
                    ),
                    if (_isToday(widget.selectedDate)) ...[
                      SizedBox(width: 6),
                      Container(
                        padding: EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: adaptiveColor(
                            context,
                            leafGreen,
                          ).withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          '今天',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                            color: adaptiveColor(context, leafGreen),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            IconButton(
              icon: Icon(Icons.chevron_right),
              tooltip: '后一天',
              onPressed: _canGoForward() ? () => _shiftDate(1) : null,
            ),
          ],
        ),
        centerTitle: true,
        actions: [
          if (widget.onConfigure != null)
            IconButton(
              onPressed: widget.onConfigure,
              tooltip: '连接设置',
              icon: Icon(Icons.settings_outlined),
            ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          padding: EdgeInsets.fromLTRB(12, 4, 12, 100),
          physics: AlwaysScrollableScrollPhysics(),
          children: [
            Text(
              '健康首页',
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.w700,
                letterSpacing: -.6,
              ),
            ),
            // Garmin 连接状态条
            _buildStatusBar(colorScheme),

            if (loading)
              Padding(
                padding: EdgeInsets.symmetric(vertical: 16),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (error != null)
              _buildErrorState()
            else if (garminState != 'ready')
              _buildNotConfigured()
            else if (overview != null)
              CockpitVitals(data: overview!)
            else
              _buildEmptyState(),
            ModuleSummaries(
              key: ValueKey('${widget.selectedDate}:$_request'),
              api: widget.garminApi,
              date: widget.selectedDate,
              totalCalories: (overview?['daily'] as Map?)?['calories'] as num?,
              signals: !loading && overview != null
                  ? CockpitSignals(data: overview!)
                  : null,
              movement: !loading && overview != null
                  ? CockpitMovement(data: overview!)
                  : null,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatusBar(ColorScheme colorScheme) {
    final isReady = garminState == 'ready';
    final syncedAt = overview?['syncedAt'] as String?;
    final deviceSynced = overview?['deviceSyncedAt'] as String?;
    final syncTime = deviceSynced ?? syncedAt;

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Container(
            width: 7,
            height: 7,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: loading
                  ? Colors.orange
                  : isReady
                  ? Colors.green
                  : Colors.red.shade300,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Wrap(
              spacing: 8,
              runSpacing: 3,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Text(
                  loading
                      ? 'Garmin'
                      : isReady
                      ? 'Garmin 已连接'
                      : garminState == 'not_configured'
                      ? '未配置 Garmin'
                      : 'Garmin 离线',
                  style: TextStyle(
                    fontSize: 12,
                    color: colorScheme.onSurfaceVariant,
                  ),
                ),
                if (syncTime != null && isReady)
                  Text(
                    '· ${_formatSyncTime(syncTime)}',
                    style: TextStyle(
                      fontSize: 11,
                      color: colorScheme.onSurfaceVariant,
                    ),
                  ),
              ],
            ),
          ),
          IconButton(
            onPressed: loading ? null : _refresh,
            tooltip: '刷新数据',
            icon: const Icon(Icons.refresh, size: 20),
          ),
        ],
      ),
    );
  }

  String _formatSyncTime(String iso) {
    final dt = DateTime.tryParse(iso);
    if (dt == null) return '';
    final local = dt.toUtc().add(Duration(hours: 8));
    return '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')} 同步';
  }

  Widget _buildErrorState() {
    return Center(
      child: Padding(
        padding: EdgeInsets.symmetric(vertical: 20),
        child: Column(
          children: [
            Icon(Icons.cloud_off, size: 48, color: Colors.grey.shade400),
            SizedBox(height: 16),
            Text(
              error!,
              style: TextStyle(color: Colors.red, fontSize: 14),
              textAlign: TextAlign.center,
            ),
            SizedBox(height: 16),
            FilledButton.tonal(
              onPressed: () => unawaited(_load()),
              child: Text('重新读取'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildNotConfigured() {
    return Center(
      child: Padding(
        padding: EdgeInsets.symmetric(vertical: 20),
        child: Column(
          children: [
            Icon(
              Icons.watch_off_outlined,
              size: 48,
              color: Colors.grey.shade400,
            ),
            SizedBox(height: 16),
            Text(
              '尚未配置 Garmin 连接',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
            SizedBox(height: 8),
            Text(
              '请在设置中配置 Garmin 服务以查看健康数据。',
              style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Padding(
        padding: EdgeInsets.symmetric(vertical: 20),
        child: Text('暂无数据', style: TextStyle(fontSize: 14)),
      ),
    );
  }
}
